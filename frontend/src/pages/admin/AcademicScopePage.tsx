import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Search, UserMinus, X } from "lucide-react";
import {
  academicScopeService,
  ScopeMember,
  ScopeRequest,
  ScopeUnit,
} from "@/services/academicScopeService";
import userService, { User } from "@/services/userService";

/**
 * Admin: connect each organisation unit to a faculty (Dean) or department
 * (HOD), set who holds it, and place the staff who work in it. Deans and HODs
 * then see only their faculty or department.
 */
export default function AcademicScopePage() {
  const qc = useQueryClient();

  const overviewQ = useQuery({
    queryKey: ["academic-scope", "overview"],
    queryFn: () => academicScopeService.overview(),
  });
  const overview: any = overviewQ.data;
  const data = overview?.data ?? overview;
  const units: ScopeUnit[] = data?.units ?? [];
  const faculties: { fac_id: number; fac_name: string }[] = data?.faculties ?? [];
  const departments: { dep_id: number; dep_name: string; fac_id: number | null }[] =
    data?.departments ?? [];

  const [staffUnitId, setStaffUnitId] = useState<number | null>(null);
  const [picker, setPicker] = useState<{ unitId: number; mode: "head" | "staff" } | null>(null);
  const [search, setSearch] = useState("");

  const refresh = () => qc.invalidateQueries({ queryKey: ["academic-scope"] });

  const requestsQ = useQuery({
    queryKey: ["academic-scope", "requests", "pending"],
    queryFn: () => academicScopeService.requests("pending"),
  });
  const pendingRaw: any = requestsQ.data;
  const pending: ScopeRequest[] = pendingRaw?.data ?? pendingRaw ?? [];

  const decideM = useMutation({
    mutationFn: async (v: { id: number; approve: boolean }) =>
      v.approve ? academicScopeService.approve(v.id) : academicScopeService.reject(v.id),
    onSuccess: (_d, v) => {
      toast.success(v.approve ? "Approved" : "Rejected");
      refresh();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Could not record the decision"),
  });

  const linkM = useMutation({
    mutationFn: (v: { unitId: number; facId: number | null; depId: number | null }) =>
      academicScopeService.setLink(v.unitId, v.facId, v.depId),
    onSuccess: () => {
      toast.success("Link saved");
      refresh();
    },
    onError: () => toast.error("Could not save the link"),
  });

  const headM = useMutation({
    mutationFn: (v: { unitId: number; userId: number | null }) =>
      academicScopeService.setHead(v.unitId, v.userId),
    onSuccess: () => {
      toast.success("Head saved");
      setPicker(null);
      setSearch("");
      refresh();
    },
    onError: () => toast.error("Could not save the head"),
  });

  const membersQ = useQuery({
    queryKey: ["academic-scope", "members", staffUnitId],
    queryFn: () => academicScopeService.members(staffUnitId as number),
    enabled: staffUnitId !== null,
  });
  const members: ScopeMember[] = useMemo(() => {
    const raw: any = membersQ.data;
    return raw?.data ?? raw ?? [];
  }, [membersQ.data]);

  const staffM = useMutation({
    mutationFn: (v: { unitId: number; userIds: number[] }) =>
      academicScopeService.setMembers(v.unitId, v.userIds),
    onSuccess: () => {
      toast.success("Staff saved");
      setPicker(null);
      setSearch("");
      qc.invalidateQueries({ queryKey: ["academic-scope", "members", staffUnitId] });
      refresh();
    },
    onError: () => toast.error("Could not save staff"),
  });

  const usersQ = useQuery({
    queryKey: ["academic-scope", "users", search],
    queryFn: () => userService.getUsers(1, search, 10),
    enabled: picker !== null && search.trim().length >= 2,
  });
  const found: User[] = useMemo(() => {
    const raw: any = usersQ.data;
    return raw?.data?.data ?? raw?.data ?? [];
  }, [usersQ.data]);

  const depthById = useMemo(() => {
    const parents = new Map(units.map((u) => [u.id, u.parent_id]));
    const depth = new Map<number, number>();
    const walk = (id: number): number => {
      if (depth.has(id)) return depth.get(id) as number;
      const p = parents.get(id);
      const d = p && parents.has(p) ? walk(p) + 1 : 0;
      depth.set(id, d);
      return d;
    };
    units.forEach((u) => walk(u.id));
    return depth;
  }, [units]);

  // Inline search over the units table: unit name, its head, and the faculty or department it is linked to.
  const [unitQuery, setUnitQuery] = useState("");
  const shownUnits = useMemo(() => {
    const q = unitQuery.trim().toLowerCase();
    if (!q) return units;
    const linkName = (u: ScopeUnit) => {
      if (u.fac_id) return faculties.find((f) => f.fac_id === u.fac_id)?.fac_name ?? "";
      if (u.dep_id) return departments.find((d) => d.dep_id === u.dep_id)?.dep_name ?? "";
      return "";
    };
    return units.filter((u) =>
      [u.name, u.head_title, u.head_name ?? "", u.acting_name ?? "", linkName(u)]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [units, unitQuery, faculties, departments]);

  const linkValue = (u: ScopeUnit) =>
    u.fac_id ? `fac:${u.fac_id}` : u.dep_id ? `dep:${u.dep_id}` : "";

  const onLinkChange = (u: ScopeUnit, value: string) => {
    if (!value) {
      linkM.mutate({ unitId: u.id, facId: null, depId: null });
    } else if (value.startsWith("fac:")) {
      linkM.mutate({ unitId: u.id, facId: Number(value.slice(4)), depId: null });
    } else {
      linkM.mutate({ unitId: u.id, facId: null, depId: Number(value.slice(4)) });
    }
  };

  const onPickUser = (user: User) => {
    if (!picker) return;
    if (picker.mode === "head") {
      headM.mutate({ unitId: picker.unitId, userId: user.id });
      return;
    }
    const current = members.map((m) => m.user_id);
    if (current.includes(user.id)) {
      toast("Already in this unit");
      return;
    }
    staffM.mutate({ unitId: picker.unitId, userIds: [...current, user.id] });
  };

  const removeMember = (unitId: number, userId: number) => {
    const next = members.map((m) => m.user_id).filter((id) => id !== userId);
    staffM.mutate({ unitId, userIds: next });
  };

  if (overviewQ.isLoading) {
    return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="card-tight">
        <h1 className="text-lg font-semibold">Academic scope — Deans and Heads of Department</h1>
        <p className="text-sm text-gray-600 mt-1">
          Link each unit to its faculty (Dean) or department (HOD), set the head, and place
          the staff who work there. A Dean sees their whole faculty; an HOD sees only their
          department. Units with no link keep full access.
        </p>
      </div>

      <div className={`card-tight space-y-3 ${pending.length > 0 ? "border-l-4 border-l-amber-500 bg-amber-50" : ""}`}>
        <h2 className="font-semibold">
          Pending requests ({pending.length})
          {pending.length > 0 && <span className="ml-2 text-xs font-medium text-amber-700">Waiting for your decision</span>}
        </h2>
        {pending.length === 0 && (
          <p className="text-sm text-gray-500">No Dean or HOD is waiting for approval.</p>
        )}
        <ul className="divide-y">
          {pending.map((r) => (
            <li key={r.id} className="py-2 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">
                <div className="font-medium">{r.full_name ?? `User #${r.user_id}`} <span className="text-xs text-gray-500">({r.username})</span></div>
                <div className="text-gray-700">Requests: {r.fac_name ?? r.dep_name}</div>
                <div className="text-xs text-gray-500">
                  {r.requester_role === "academic secretary"
                    ? "Academic secretary — approving assigns this person to the faculty or department."
                    : r.unit_name
                    ? `Org unit: ${r.unit_name}${r.unit_head_name ? ` — current head: ${r.unit_head_name}` : " — no head yet"}`
                    : "No org unit is linked to this faculty or department yet. Link it in the table below first."}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  className="px-3 py-1 rounded bg-blue-700 text-white text-sm disabled:opacity-50"
                  disabled={(!r.unit_id && r.requester_role !== "academic secretary") || decideM.isPending}
                  onClick={() => decideM.mutate({ id: r.id, approve: true })}
                >
                  Approve
                </button>
                <button
                  className="px-3 py-1 rounded border text-sm"
                  disabled={decideM.isPending}
                  onClick={() => decideM.mutate({ id: r.id, approve: false })}
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="card-tight flex flex-wrap items-center justify-between gap-2">
        <input
          className="border rounded px-3 py-1.5 text-sm w-full max-w-md"
          placeholder="Search units, heads, faculties or departments"
          value={unitQuery}
          onChange={(e) => setUnitQuery(e.target.value)}
        />
        <span className="text-xs text-gray-500">
          Showing {shownUnits.length} of {units.length} units
        </span>
      </div>

      <div className="card-tight overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="py-2 pr-3">Organisation unit</th>
              <th className="py-2 pr-3">Linked to (MIS)</th>
              <th className="py-2 pr-3">Head (Dean / HOD)</th>
              <th className="py-2 pr-3">Staff</th>
            </tr>
          </thead>
          <tbody>
            {shownUnits.map((u) => {
              const indent = (depthById.get(u.id) ?? 0) * 16;
              const isStaffOpen = staffUnitId === u.id;
              const isPickerOpen = picker?.unitId === u.id;
              return (
                <tr key={u.id} className="border-b align-top">
                  <td className="py-2 pr-3" style={{ paddingLeft: indent }}>
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-gray-500">{u.head_title}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      className="border rounded px-2 py-1 max-w-xs"
                      value={linkValue(u)}
                      onChange={(e) => onLinkChange(u, e.target.value)}
                      disabled={linkM.isPending}
                    >
                      <option value="">— not linked (full access) —</option>
                      <optgroup label="Faculties (Dean)">
                        {faculties.map((f) => (
                          <option key={`fac-${f.fac_id}`} value={`fac:${f.fac_id}`}>
                            {f.fac_name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Departments (HOD)">
                        {departments.map((d) => (
                          <option key={`dep-${d.dep_id}`} value={`dep:${d.dep_id}`}>
                            {d.dep_name}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <div>{u.head_name ?? <span className="text-amber-600">Vacant</span>}</div>
                    {u.acting_name && (
                      <div className="text-xs text-gray-500">
                        Acting: {u.acting_name}
                        {u.acting_until ? ` until ${u.acting_until}` : ""}
                      </div>
                    )}
                    <div className="flex gap-2 mt-1">
                      <button
                        className="text-xs text-blue-700 underline"
                        onClick={() => {
                          setSearch("");
                          setPicker({ unitId: u.id, mode: "head" });
                        }}
                      >
                        {u.head_name ? "Change head" : "Set head"}
                      </button>
                      {u.head_user_id && (
                        <button
                          className="text-xs text-red-700 underline"
                          onClick={() => headM.mutate({ unitId: u.id, userId: null })}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    {isPickerOpen && picker?.mode === "head" && (
                      <UserPicker
                        search={search}
                        setSearch={setSearch}
                        users={found}
                        loading={usersQ.isFetching}
                        onPick={onPickUser}
                        onClose={() => setPicker(null)}
                      />
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <button
                      className="text-xs text-blue-700 underline"
                      onClick={() => setStaffUnitId(isStaffOpen ? null : u.id)}
                    >
                      {isStaffOpen ? "Hide staff" : `Staff (${u.member_count})`}
                    </button>
                    {isStaffOpen && (
                      <div className="mt-2 space-y-2 min-w-[16rem]">
                        {membersQ.isLoading && <div className="text-xs text-gray-500">Loading…</div>}
                        {members.length === 0 && !membersQ.isLoading && (
                          <div className="text-xs text-gray-500">No staff placed yet.</div>
                        )}
                        <ul className="space-y-1">
                          {members.map((m) => (
                            <li key={m.user_id} className="flex items-center justify-between gap-2">
                              <span>{m.full_name}</span>
                              <button
                                className="text-red-700"
                                title="Remove from unit"
                                onClick={() => removeMember(u.id, m.user_id)}
                              >
                                <UserMinus size={14} />
                              </button>
                            </li>
                          ))}
                        </ul>
                        <button
                          className="text-xs text-blue-700 underline"
                          onClick={() => {
                            setSearch("");
                            setPicker({ unitId: u.id, mode: "staff" });
                          }}
                        >
                          Add staff
                        </button>
                        {isPickerOpen && picker?.mode === "staff" && (
                          <UserPicker
                            search={search}
                            setSearch={setSearch}
                            users={found}
                            loading={usersQ.isFetching}
                            onPick={onPickUser}
                            onClose={() => setPicker(null)}
                          />
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UserPicker({
  search,
  setSearch,
  users,
  loading,
  onPick,
  onClose,
}: {
  search: string;
  setSearch: (v: string) => void;
  users: User[];
  loading: boolean;
  onPick: (u: User) => void;
  onClose: () => void;
}) {
  return (
    <div className="mt-2 border rounded p-2 bg-white space-y-2 min-w-[16rem]">
      <div className="flex items-center gap-2">
        <Search size={14} className="text-gray-400" />
        <input
          autoFocus
          className="flex-1 border rounded px-2 py-1 text-sm"
          placeholder="Type a name (2+ letters)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button onClick={onClose} aria-label="Close">
          <X size={14} />
        </button>
      </div>
      {loading && <div className="text-xs text-gray-500">Searching…</div>}
      <ul className="max-h-48 overflow-y-auto">
        {users.map((u) => (
          <li key={u.id}>
            <button
              className="w-full text-left px-2 py-1 rounded hover:bg-gray-100 text-sm"
              onClick={() => onPick(u)}
            >
              {u.full_name} <span className="text-xs text-gray-500">({u.username})</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

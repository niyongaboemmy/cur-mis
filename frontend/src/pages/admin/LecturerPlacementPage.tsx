import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Search } from "lucide-react";
import { academicScopeService, ScopeLecturer, ScopeSecretary } from "@/services/academicScopeService";
import { moduleRequestService, PendingModuleRequest } from "@/services/moduleRequestService";
import userService, { User } from "@/services/userService";
import { useAcademicScope } from "@/hooks/useAcademicScope";

type Pick = { fac: number | ""; dep: number | ""; opt: number | "" };

/**
 * Places each lecturer in a faculty, department and option. Admin sees every
 * unit; a Dean or HOD sees only their own faculty or department.
 */
export default function LecturerPlacementPage() {
  const qc = useQueryClient();
  const { scope } = useAcademicScope();

  const optionsQ = useQuery({
    queryKey: ["academic-scope", "options"],
    queryFn: () => academicScopeService.options(),
  });
  const optionsRaw: any = optionsQ.data;
  const catalog = optionsRaw?.data ?? optionsRaw ?? { faculties: [], departments: [], options: [] };

  const lecturersQ = useQuery({
    queryKey: ["academic-scope", "lecturers"],
    queryFn: () => academicScopeService.lecturers(),
  });
  const lecturersRaw: any = lecturersQ.data;
  const lecturers: ScopeLecturer[] = lecturersRaw?.data ?? lecturersRaw ?? [];

  // Scoped users only see their own faculties / departments. Admin (no scope) sees all.
  const scoped = scope.scoped;
  const faculties = useMemo(
    () => (catalog.faculties as any[]).filter((f) => !scoped || scope.faculty_ids.includes(f.fac_id)),
    [catalog, scoped, scope.faculty_ids],
  );
  const departments = useMemo(
    () => (catalog.departments as any[]).filter((d) => !scoped || scope.department_ids.includes(d.dep_id)),
    [catalog, scoped, scope.department_ids],
  );

  // Module requests from lecturers with no modules: approve or reject.
  const modReqQ = useQuery({
    queryKey: ["module-requests", "pending"],
    queryFn: () => moduleRequestService.pending(),
  });
  const modReqRaw: any = modReqQ.data;
  const modReqs: PendingModuleRequest[] = modReqRaw?.data ?? modReqRaw ?? [];

  const decideModReqM = useMutation({
    mutationFn: (v: { id: number; approve: boolean }) =>
      v.approve ? moduleRequestService.approve(v.id) : moduleRequestService.reject(v.id),
    onSuccess: (_d, v) => {
      toast.success(v.approve ? "Module assigned" : "Request rejected");
      qc.invalidateQueries({ queryKey: ["module-requests", "pending"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Could not record the decision"),
  });

  // Academic secretaries (one per department, or one for a whole faculty).
  const secretariesQ = useQuery({
    queryKey: ["academic-scope", "secretaries"],
    queryFn: () => academicScopeService.secretaries(),
  });
  const secRaw: any = secretariesQ.data;
  const secretaries: ScopeSecretary[] = secRaw?.data ?? secRaw ?? [];
  const [secSearch, setSecSearch] = useState("");
  const [secUser, setSecUser] = useState<User | null>(null);
  const [secUnit, setSecUnit] = useState<string>("");
  const secUsersQ = useQuery({
    queryKey: ["academic-scope", "secretary-user-search", secSearch],
    queryFn: () => userService.getUsers(1, secSearch, 8),
    enabled: secSearch.trim().length >= 2 && !secUser,
  });
  const secUsersRaw: any = secUsersQ.data;
  const secFound: User[] = secUsersRaw?.data?.data ?? secUsersRaw?.data ?? [];

  const assignSecM = useMutation({
    mutationFn: () => {
      if (!secUser || !secUnit) throw new Error("missing");
      const [kind, id] = secUnit.split(":");
      return academicScopeService.assignSecretary(
        secUser.id,
        kind === "fac" ? { fac_id: Number(id) } : { dep_id: Number(id) },
      );
    },
    onSuccess: () => {
      toast.success("Secretary assigned");
      setSecUser(null);
      setSecSearch("");
      setSecUnit("");
      qc.invalidateQueries({ queryKey: ["academic-scope", "secretaries"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Could not assign the secretary"),
  });

  const removeSecM = useMutation({
    mutationFn: (id: number) => academicScopeService.removeSecretary(id),
    onSuccess: () => {
      toast.success("Secretary removed");
      qc.invalidateQueries({ queryKey: ["academic-scope", "secretaries"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Could not remove the secretary"),
  });

  const [modOpenId, setModOpenId] = useState<number | null>(null);
  const [edits, setEdits] = useState<Record<number, Pick>>({});
  const [added, setAdded] = useState<ScopeLecturer[]>([]);
  const [search, setSearch] = useState("");

  const usersQ = useQuery({
    queryKey: ["academic-scope", "user-search", search],
    queryFn: () => userService.getUsers(1, search, 10),
    enabled: search.trim().length >= 2,
  });
  const usersRaw: any = usersQ.data;
  const found: User[] = usersRaw?.data?.data ?? usersRaw?.data ?? [];

  const allRows: ScopeLecturer[] = useMemo(() => {
    const seen = new Set(lecturers.map((l) => l.user_id));
    return [...lecturers, ...added.filter((a) => !seen.has(a.user_id))];
  }, [lecturers, added]);

  const valueOf = (l: ScopeLecturer): Pick =>
    edits[l.user_id] ?? {
      fac: l.fac_id ?? "",
      dep: l.dep_id ?? "",
      opt: l.option_id ?? "",
    };

  const setField = (l: ScopeLecturer, field: keyof Pick, value: number | "") => {
    const cur = valueOf(l);
    const next: Pick = { ...cur, [field]: value };
    // Changing a level clears the levels below it.
    if (field === "fac") { next.dep = ""; next.opt = ""; }
    if (field === "dep") { next.opt = ""; }
    setEdits((e) => ({ ...e, [l.user_id]: next }));
  };

  const saveM = useMutation({
    mutationFn: (v: { userId: number; p: Pick }) =>
      academicScopeService.placeLecturer(v.userId, {
        fac_id: v.p.fac === "" ? null : Number(v.p.fac),
        dep_id: v.p.dep === "" ? null : Number(v.p.dep),
        option_id: v.p.opt === "" ? null : Number(v.p.opt),
      }),
    onSuccess: (_d, v) => {
      toast.success("Placement saved");
      setEdits((e) => {
        const copy = { ...e };
        delete copy[v.userId];
        return copy;
      });
      qc.invalidateQueries({ queryKey: ["academic-scope", "lecturers"] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Could not save the placement"),
  });

  const addUser = (u: User) => {
    if (allRows.some((r) => r.user_id === u.id)) {
      toast("Already in the list");
      return;
    }
    setAdded((a) => [
      ...a,
      {
        user_id: u.id,
        full_name: u.full_name,
        username: u.username,
        fac_id: null,
        dep_id: null,
        option_id: null,
        fac_name: null,
        dep_name: null,
        option_name: null,
      },
    ]);
    setSearch("");
  };

  if (optionsQ.isLoading || lecturersQ.isLoading) {
    return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="card-tight">
        <h1 className="text-lg font-semibold">Lecturers — faculty, department and option</h1>
        <p className="text-sm text-gray-600 mt-1">
          Place each lecturer in their faculty, department and programme option. A lecturer
          sees only the modules assigned to them and the students in those modules.
          {scoped && " You can place lecturers only inside your own faculty or department."}
        </p>
      </div>

      <div className="card-tight space-y-2">
        <label className="text-sm font-medium">Add a lecturer</label>
        <div className="flex items-center gap-2">
          <Search size={14} className="text-gray-400" />
          <input
            className="flex-1 border rounded px-2 py-1 text-sm"
            placeholder="Type a name (2+ letters)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {search.trim().length >= 2 && (
          <ul className="max-h-48 overflow-y-auto">
            {found.map((u) => (
              <li key={u.id}>
                <button
                  className="w-full text-left px-2 py-1 rounded hover:bg-gray-100 text-sm"
                  onClick={() => addUser(u)}
                >
                  {u.full_name} <span className="text-xs text-gray-500">({u.username})</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card-tight space-y-3">
        <h2 className="font-semibold">Module requests ({modReqs.length})</h2>
        <p className="text-sm text-gray-600">
          Lecturers who have no modules yet ask for the modules they teach. Approving assigns the module to the lecturer.
        </p>
        {modReqs.length === 0 && <p className="text-sm text-gray-500">No module requests are waiting.</p>}
        <ul className="divide-y">
          {modReqs.map((r) => (
            <li key={r.id} className="py-2 flex flex-wrap items-center justify-between gap-3 text-sm">
              <div>
                <div className="font-medium">{r.full_name} <span className="text-xs text-gray-500">({r.username})</span></div>
                <div className="text-gray-700">{r.module_code} — {r.module_name}</div>
                <div className="text-xs text-gray-500">{r.dep_name ?? "No department"}</div>
              </div>
              <div className="flex gap-2">
                <button
                  className="px-3 py-1 rounded bg-blue-700 text-white text-sm disabled:opacity-50"
                  disabled={decideModReqM.isPending}
                  onClick={() => decideModReqM.mutate({ id: r.id, approve: true })}
                >
                  Approve
                </button>
                <button
                  className="px-3 py-1 rounded border text-sm"
                  disabled={decideModReqM.isPending}
                  onClick={() => decideModReqM.mutate({ id: r.id, approve: false })}
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="card-tight space-y-3">
        <h2 className="font-semibold">Academic secretaries</h2>
        <p className="text-sm text-gray-600">
          A secretary manages the programmes, modules and staff of one department, or of a whole faculty.
          Secretaries cannot record marks or attendance, and cannot change faculties or departments.
        </p>
        <ul className="divide-y">
          {secretaries.length === 0 && <li className="py-2 text-sm text-gray-500">No secretaries assigned yet.</li>}
          {secretaries.map((s) => (
            <li key={s.id} className="py-2 flex items-center justify-between gap-3 text-sm">
              <div>
                <span className="font-medium">{s.full_name}</span>{" "}
                <span className="text-xs text-gray-500">({s.username})</span>
                <div className="text-xs text-gray-600">
                  {s.fac_name ? `Faculty: ${s.fac_name}` : `Department: ${s.dep_name}`}
                </div>
              </div>
              <button
                className="px-3 py-1 rounded border text-sm"
                disabled={removeSecM.isPending}
                onClick={() => removeSecM.mutate(s.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

        <div className="border-t pt-3 space-y-2">
          <label className="text-sm font-medium">Assign a secretary</label>
          {secUser ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">{secUser.full_name}</span>
              <button className="text-xs text-blue-700 underline" onClick={() => setSecUser(null)}>Change</button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Search size={14} className="text-gray-400" />
                <input
                  className="flex-1 border rounded px-2 py-1 text-sm"
                  placeholder="Type a name (2+ letters)"
                  value={secSearch}
                  onChange={(e) => setSecSearch(e.target.value)}
                />
              </div>
              {secSearch.trim().length >= 2 && (
                <ul className="max-h-40 overflow-y-auto">
                  {secFound.map((u) => (
                    <li key={u.id}>
                      <button
                        className="w-full text-left px-2 py-1 rounded hover:bg-gray-100 text-sm"
                        onClick={() => setSecUser(u)}
                      >
                        {u.full_name} <span className="text-xs text-gray-500">({u.username})</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <select className="border rounded px-2 py-1 text-sm" value={secUnit} onChange={(e) => setSecUnit(e.target.value)}>
              <option value="">Choose a faculty or department</option>
              <optgroup label="Faculties (all departments in it)">
                {faculties.map((f: any) => (
                  <option key={`sf-${f.fac_id}`} value={`fac:${f.fac_id}`}>{f.fac_name}</option>
                ))}
              </optgroup>
              <optgroup label="Departments">
                {departments.map((d: any) => (
                  <option key={`sd-${d.dep_id}`} value={`dep:${d.dep_id}`}>{d.dep_name}</option>
                ))}
              </optgroup>
            </select>
            <button
              className="px-3 py-1 rounded bg-blue-700 text-white text-sm disabled:opacity-40"
              disabled={!secUser || !secUnit || assignSecM.isPending}
              onClick={() => assignSecM.mutate()}
            >
              Assign secretary
            </button>
          </div>
        </div>
      </div>

      <div className="card-tight overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="py-2 pr-3">Lecturer</th>
              <th className="py-2 pr-3">Faculty</th>
              <th className="py-2 pr-3">Department</th>
              <th className="py-2 pr-3">Option</th>
              <th className="py-2 pr-3" />
            </tr>
          </thead>
          <tbody>
            {allRows.length === 0 && (
              <tr><td className="py-3 text-gray-500" colSpan={5}>No lecturers in your scope yet. Add one above.</td></tr>
            )}
            {allRows.map((l) => {
              const v = valueOf(l);
              const deps = departments.filter((d) => v.fac === "" || d.fac_id === Number(v.fac));
              const opts = (catalog.options as any[]).filter((o) => v.dep !== "" && o.department_id === Number(v.dep));
              const dirty = !!edits[l.user_id];
              return (
                <Fragment key={l.user_id}>
                <tr className="border-b align-top">
                  <td className="py-2 pr-3">
                    <div className="font-medium">{l.full_name}</div>
                    <div className="text-xs text-gray-500">{l.username}</div>
                  </td>
                  <td className="py-2 pr-3">
                    <select className="border rounded px-2 py-1" value={v.fac}
                      onChange={(e) => setField(l, "fac", e.target.value ? Number(e.target.value) : "")}>
                      <option value="">— none —</option>
                      {faculties.map((f: any) => <option key={f.fac_id} value={f.fac_id}>{f.fac_name}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <select className="border rounded px-2 py-1" value={v.dep}
                      onChange={(e) => setField(l, "dep", e.target.value ? Number(e.target.value) : "")}>
                      <option value="">— none —</option>
                      {deps.map((d: any) => <option key={d.dep_id} value={d.dep_id}>{d.dep_name}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <select className="border rounded px-2 py-1" value={v.opt} disabled={v.dep === ""}
                      onChange={(e) => setField(l, "opt", e.target.value ? Number(e.target.value) : "")}>
                      <option value="">— none —</option>
                      {opts.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <button
                      className="px-3 py-1 rounded bg-blue-700 text-white text-sm disabled:opacity-40"
                      disabled={!dirty || saveM.isPending}
                      onClick={() => saveM.mutate({ userId: l.user_id, p: v })}
                    >
                      Save
                    </button>
                    <button
                      className="ml-2 px-3 py-1 rounded border text-sm"
                      onClick={() => setModOpenId(modOpenId === l.user_id ? null : l.user_id)}
                    >
                      {modOpenId === l.user_id ? "Hide modules" : "Modules"}
                    </button>
                  </td>
                </tr>
                {modOpenId === l.user_id && (
                  <tr className="border-b">
                    <td colSpan={5} className="py-3">
                      <LecturerModulesEditor userId={l.user_id} />
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Tick the modules this lecturer teaches this term. Saving adds the ticked ones and
 * removes the unticked ones. A Dean, HOD or secretary sees only modules in their scope.
 */
function LecturerModulesEditor({ userId }: { userId: number }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["academic-scope", "lecturer-modules", userId],
    queryFn: () => academicScopeService.lecturerModules(userId),
  });
  const raw: any = q.data;
  const data = raw?.data ?? raw;
  const options: { module_id: number; module_code: string; module_name: string; department: number | null }[] = data?.options ?? [];
  const assignedIds: number[] = (data?.assigned ?? []).map((a: any) => Number(a.module_id));

  const [picked, setPicked] = useState<number[] | null>(null);
  const [filter, setFilter] = useState("");
  const current = picked ?? assignedIds;

  const saveM = useMutation({
    mutationFn: () => academicScopeService.setLecturerModules(userId, current),
    onSuccess: () => {
      toast.success("Modules saved");
      setPicked(null);
      qc.invalidateQueries({ queryKey: ["academic-scope", "lecturer-modules", userId] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Could not save the modules"),
  });

  if (q.isLoading) return <div className="text-sm text-gray-500">Loading modules…</div>;
  if (!data?.academic_term_id) {
    return <div className="text-sm text-red-600">Set the current academic year and term in Years &amp; terms first.</div>;
  }

  const shown = options.filter((m) => {
    const f = filter.trim().toLowerCase();
    return !f || `${m.module_code} ${m.module_name}`.toLowerCase().includes(f);
  });

  const toggle = (id: number) =>
    setPicked((p) => {
      const base = p ?? assignedIds;
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    });

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">Modules taught this term ({current.length} selected)</div>
      <input
        className="w-full max-w-md border rounded px-2 py-1 text-sm"
        placeholder="Search by code or name"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <ul className="max-h-60 overflow-y-auto border rounded divide-y max-w-3xl">
        {shown.length === 0 && <li className="p-2 text-sm text-gray-500">No modules to show.</li>}
        {shown.map((m) => (
          <li key={m.module_id}>
            <label className="flex items-center gap-2 px-2 py-1 text-sm cursor-pointer hover:bg-gray-50">
              <input type="checkbox" checked={current.includes(m.module_id)} onChange={() => toggle(m.module_id)} />
              <span className="font-medium">{m.module_code}</span> {m.module_name}
            </label>
          </li>
        ))}
      </ul>
      <button
        className="px-3 py-1 rounded bg-blue-700 text-white text-sm disabled:opacity-40"
        disabled={picked === null || saveM.isPending}
        onClick={() => saveM.mutate()}
      >
        Save modules
      </button>
    </div>
  );
}

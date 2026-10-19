import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Search } from "lucide-react";
import { academicScopeService, ScopeLecturer } from "@/services/academicScopeService";
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
                <tr key={l.user_id} className="border-b align-top">
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

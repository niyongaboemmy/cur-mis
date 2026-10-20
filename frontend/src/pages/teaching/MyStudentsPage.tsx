import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { academicScopeService, ScopeStudentRow } from "@/services/academicScopeService";

/**
 * Lecturer view: students registered in the modules assigned to me, for the
 * academic year I select. Marks and attendance are recorded from the marks and
 * attendance pages, which already limit entry to my own modules.
 */
export default function MyStudentsPage() {
  const [yearId, setYearId] = useState<number | undefined>(undefined);

  const q = useQuery({
    queryKey: ["academic-scope", "my-students", yearId ?? "current"],
    queryFn: () => academicScopeService.myStudents(yearId),
  });
  const raw: any = q.data;
  const data = raw?.data ?? raw ?? { years: [], academic_year_id: 0, modules: [], students: [] };
  const students: ScopeStudentRow[] = data.students ?? [];

  // One block per module you teach, including modules with nobody enrolled yet.
  const byModule = useMemo(() => {
    const groups = new Map<number, { code: string; name: string; rows: ScopeStudentRow[] }>();
    for (const m of data.modules as { module_id: number; module_code: string; module_name: string }[]) {
      groups.set(m.module_id, { code: m.module_code, name: m.module_name, rows: [] });
    }
    for (const s of students) {
      const g = groups.get(s.module_id) ?? { code: s.module_code, name: s.module_name, rows: [] };
      g.rows.push(s);
      groups.set(s.module_id, g);
    }
    return [...groups.values()];
  }, [students, data.modules]);

  return (
    <div className="space-y-4">
      <div className="card-tight flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">My students</h1>
          <p className="text-sm text-gray-600">Students registered in the modules assigned to you.</p>
        </div>
        <select
          className="border rounded px-2 py-1 text-sm"
          value={data.academic_year_id || ""}
          onChange={(e) => setYearId(Number(e.target.value))}
        >
          {(data.years as { id: number; label: string }[]).map((y) => (
            <option key={y.id} value={y.id}>{y.label}</option>
          ))}
        </select>
      </div>

      {q.isLoading && <div className="text-sm text-gray-500">Loading…</div>}

      {!q.isLoading && data.modules.length === 0 && (
        <div className="card-tight text-sm text-gray-500">No modules are assigned to you for this year.</div>
      )}

      {byModule.map((g) => (
        <div key={g.code + g.name} className="card-tight overflow-x-auto">
          <h2 className="font-semibold mb-2">{g.code} — {g.name} <span className="text-xs text-gray-500">({g.rows.length} students)</span></h2>
          {g.rows.length === 0 && (
            <p className="text-sm text-amber-700">
              No students are enrolled in this module yet. Ask your Head of Department to enrol them.
            </p>
          )}
          {g.rows.length > 0 && <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-3">Reg. number</th>
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Term</th>
                <th className="py-2 pr-3">Grade</th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((s) => (
                <tr key={`${s.module_id}-${s.regnumber}-${s.term_label}`} className="border-b">
                  <td className="py-1 pr-3">{s.regnumber}</td>
                  <td className="py-1 pr-3">{[s.fname, s.lname].filter(Boolean).join(" ") || "—"}</td>
                  <td className="py-1 pr-3">{s.term_label}</td>
                  <td className="py-1 pr-3">{s.grade ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>}
        </div>
      ))}
    </div>
  );
}

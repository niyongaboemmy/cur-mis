import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Search, Users, Download } from 'lucide-react'
import { teacherService } from '@/services/teacherService'

export default function TeacherStudentsPage() {
  const [q, setQ] = useState('')

  const query = useQuery({
    queryKey: ['teacher', 'students'],
    queryFn:  ({ signal }) => teacherService.students(undefined, signal),
  })

  const all  = useMemo(() => query.data?.data ?? [], [query.data])
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return all
    return all.filter((s) =>
      s.full_name.toLowerCase().includes(needle) ||
      s.regnumber.toLowerCase().includes(needle) ||
      s.module_codes.toLowerCase().includes(needle))
  }, [all, q])

  /** CSV of the current (filtered) view. */
  const exportCsv = () => {
    const head = ['Reg number', 'Student', 'Gender', 'Level', 'Email', 'Phone', 'Courses', 'Modules']
    const body = rows.map((s) => [
      s.regnumber, s.full_name, s.gender ?? '', s.level ?? '',
      s.email ?? '', s.phone ?? '', s.modules, s.module_codes,
    ])
    const csv = [head, ...body]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'my-students.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">My Students</h2>
          <p className="text-[13px] text-ink-500">
            Everyone registered on a module you teach, deduplicated across courses.
          </p>
        </div>
        {rows.length > 0 && (
          <button className="btn-ghost btn-sm" onClick={exportCsv}>
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        )}
      </div>

      <div className="card p-3">
        <div className="relative max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            className="input input-sm pl-8 w-full"
            placeholder="Search name, reg number or module…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="bg-ink-50 dark:bg-ink-800/50 border-b border-ink-100 dark:border-ink-700">
              {['Reg number', 'Student', 'Level', 'Contact', 'My courses'].map((h) => (
                <th key={h} className="px-4 py-2.5 font-bold text-ink-400 uppercase tracking-wider text-[10px]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
            {query.isLoading ? (
              <tr><td colSpan={5} className="p-8 text-center">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" />
              </td></tr>
            ) : query.isError ? (
              <tr><td colSpan={5} className="p-8 text-center text-rose-500">Failed to load your students.</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="p-10 text-center">
                <Users className="w-7 h-7 mx-auto text-ink-300 mb-2" />
                <p className="text-ink-400">
                  {q ? 'No student matches that search.' : 'No students on your courses yet.'}
                </p>
              </td></tr>
            ) : rows.map((s) => (
              <tr key={s.regnumber} className="hover:bg-ink-50/50 dark:hover:bg-ink-700/20">
                <td className="px-4 py-2.5 font-mono text-[12px]">{s.regnumber}</td>
                <td className="px-4 py-2.5">
                  <span className="font-medium text-ink-900 dark:text-white">{s.full_name}</span>
                  {s.gender && <span className="text-ink-400 text-[11px] ml-1.5">({s.gender})</span>}
                </td>
                <td className="px-4 py-2.5">{s.level ?? '—'}</td>
                <td className="px-4 py-2.5 text-[12px] text-ink-500">
                  <div className="truncate max-w-[200px]">{s.email ?? '—'}</div>
                  <div className="text-ink-400">{s.phone ?? ''}</div>
                </td>
                <td className="px-4 py-2.5">
                  <span className="chip-soft" title={s.module_codes}>{s.modules} course(s)</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length > 0 && (
        <p className="text-[12px] text-ink-400">
          {rows.length} of {all.length} student(s)
        </p>
      )}
    </div>
  )
}

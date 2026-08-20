import { useMemo, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Loader2, Search, Users, Download, X } from 'lucide-react'
import { teacherService } from '@/services/teacherService'
import { useLevels } from '@/hooks/useLevels'

/**
 * The lecturer's class list.
 *
 * The August 2026 registry report: "mwarimu abona abanyeshuri bavanze muri
 * intake nyinshi" — a lecturer's class mixes several intakes and there was no
 * way to tell them apart. The page showed name, level and contact only, so a
 * class blending March 2024 and March 2025 students, and Day, Weekend and
 * Holiday programmes, looked completely uniform.
 *
 * Intake, class and mode are now columns AND filters. The filters are faceted
 * server-side, so each option carries the number of students behind it and a
 * lecturer can see the mixing before they click anything.
 */
export default function TeacherStudentsPage() {
  const { levelName } = useLevels()
  const [q, setQ] = useState('')
  const [intakeId, setIntakeId] = useState<number | ''>('')
  const [level, setLevel]       = useState<number | ''>('')
  const [mode, setMode]         = useState<string>('')

  const filtersQ = useQuery({
    queryKey: ['teacher', 'student-filters'],
    queryFn:  ({ signal }) => teacherService.studentFilters(undefined, signal),
  })
  const facets = filtersQ.data?.data

  const query = useQuery({
    queryKey: ['teacher', 'students', intakeId, level, mode],
    queryFn:  ({ signal }) => teacherService.students({
      intake_id:     intakeId === '' ? undefined : intakeId,
      level:         level === ''    ? undefined : level,
      mode_of_study: mode || undefined,
    }, signal),
    placeholderData: keepPreviousData,
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

  const anyFilter = intakeId !== '' || level !== '' || mode !== ''
  const clearAll  = () => { setIntakeId(''); setLevel(''); setMode('') }

  /** CSV of the current (filtered) view. */
  const exportCsv = () => {
    const head = ['Reg number', 'Student', 'Gender', 'Intake', 'Class', 'Mode', 'Email', 'Phone', 'Courses', 'Modules']
    const body = rows.map((s) => [
      s.regnumber, s.full_name, s.gender ?? '',
      s.intake_name ?? '', s.level_name ?? levelName(s.level, ''), s.mode_of_study ?? '',
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

  const COLS = ['Reg number', 'Student', 'Intake', 'Class', 'Mode', 'Contact', 'My courses']

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

      <div className="card p-3 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative max-w-sm flex-1 min-w-[220px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              className="input input-sm pl-8 w-full"
              placeholder="Search name, reg number or module…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          {/* Each option carries its headcount, so the spread across cohorts
              is visible without applying a filter first. */}
          <select
            className="input input-sm w-44"
            value={intakeId === '' ? '' : String(intakeId)}
            onChange={(e) => setIntakeId(e.target.value ? Number(e.target.value) : '')}
            aria-label="Filter by intake"
          >
            <option value="">All intakes</option>
            {(facets?.intakes ?? [])
              .filter((i) => i.id !== null)
              .map((i) => (
                <option key={i.id} value={String(i.id)}>{i.label} ({i.count})</option>
              ))}
          </select>

          <select
            className="input input-sm w-40"
            value={level === '' ? '' : String(level)}
            onChange={(e) => setLevel(e.target.value ? Number(e.target.value) : '')}
            aria-label="Filter by class"
          >
            <option value="">All classes</option>
            {(facets?.levels ?? [])
              .filter((l) => l.value !== null)
              .map((l) => (
                <option key={l.value} value={String(l.value)}>{l.label} ({l.count})</option>
              ))}
          </select>

          <select
            className="input input-sm w-36"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            aria-label="Filter by programme type"
          >
            <option value="">All modes</option>
            {(facets?.modes ?? [])
              .filter((m) => m.value !== null)
              .map((m) => (
                <option key={m.value} value={m.value as string}>{m.label} ({m.count})</option>
              ))}
          </select>

          {anyFilter && (
            <button className="btn-ghost btn-sm" onClick={clearAll}>
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>

        {/* Say plainly when a class spans more than one intake — that is the
            situation the lecturer could not previously see. */}
        {!anyFilter && (facets?.intakes.filter((i) => i.id !== null).length ?? 0) > 1 && (
          <p className="text-[12px] text-ink-500">
            This class spans{' '}
            <strong>{facets?.intakes.filter((i) => i.id !== null).length} intakes</strong>
            {(facets?.modes.filter((m) => m.value !== null).length ?? 0) > 1 && (
              <> and <strong>{facets?.modes.filter((m) => m.value !== null).length} programme types</strong></>
            )}
            . Filter above to work with one at a time.
          </p>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="bg-ink-50 dark:bg-ink-800/50 border-b border-ink-100 dark:border-ink-700">
              {COLS.map((h) => (
                <th key={h} className="px-4 py-2.5 font-bold text-ink-400 uppercase tracking-wider text-[10px] whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
            {query.isLoading ? (
              <tr><td colSpan={COLS.length} className="p-8 text-center">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" />
              </td></tr>
            ) : query.isError ? (
              <tr><td colSpan={COLS.length} className="p-8 text-center text-rose-500">Failed to load your students.</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={COLS.length} className="p-10 text-center">
                <Users className="w-7 h-7 mx-auto text-ink-300 mb-2" />
                <p className="text-ink-400">
                  {q || anyFilter
                    ? 'No student matches these filters.'
                    : 'No students on your courses yet.'}
                </p>
              </td></tr>
            ) : rows.map((s) => (
              <tr key={s.regnumber} className="hover:bg-ink-50/50 dark:hover:bg-ink-700/20">
                <td className="px-4 py-2.5 font-mono text-[12px] whitespace-nowrap">{s.regnumber}</td>
                <td className="px-4 py-2.5">
                  <span className="font-medium text-ink-900 dark:text-white">{s.full_name}</span>
                  {s.gender && <span className="text-ink-400 text-[11px] ml-1.5">({s.gender})</span>}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  {s.intake_name
                    ? <span
                        className={s.intake_resolved ? '' : 'text-ink-400 italic'}
                        title={s.intake_resolved
                          ? undefined
                          : 'Stored as free text that matches no intake in the catalogue'}
                      >
                        {s.intake_name}
                      </span>
                    : <span className="text-ink-300">—</span>}
                </td>
                <td className="px-4 py-2.5 whitespace-nowrap">{s.level_name ?? levelName(s.level)}</td>
                <td className="px-4 py-2.5 whitespace-nowrap">
                  {s.mode_of_study ?? <span className="text-ink-300">—</span>}
                </td>
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
          {facets ? ` · ${facets.total} across all your courses` : ''}
        </p>
      )}
    </div>
  )
}

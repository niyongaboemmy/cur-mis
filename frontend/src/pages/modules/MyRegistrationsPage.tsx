import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, GraduationCap, Calendar, ClipboardList, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import { myModulesService } from '@/services/modulesService'
import { academicService } from '@/services/academicService'
import { marksService } from '@/services/marksService'
import type { ModuleRegistration } from '@/types/modules'

type Tab = 'available' | 'mine' | 'marks'

export default function MyRegistrationsPage() {
  const qc = useQueryClient()

  const termsQ = useQuery({ queryKey: ['academic', 'terms'], queryFn: () => academicService.listTerms() })
  const terms = termsQ.data?.data ?? []
  const [termId, setTermId] = useState<number>(0)
  useEffect(() => {
    if (!termId && terms.length) {
      const current = terms.find((t: any) => t.is_current) ?? terms[0]
      setTermId(current.id)
    }
  }, [terms, termId])

  const [tab, setTab] = useState<Tab>('available')

  const eligibleQ = useQuery({
    queryKey: ['my-modules', 'eligible', termId],
    queryFn: () => myModulesService.eligible(termId),
    enabled: !!termId && tab === 'available',
  })

  const mineQ = useQuery({
    queryKey: ['my-modules', 'registrations', termId],
    queryFn: () => myModulesService.registrations({ term_id: termId }),
    enabled: !!termId && tab === 'mine',
  })

  const register = useMutation({
    mutationFn: (moduleId: number) => myModulesService.register({ module_id: moduleId, academic_term_id: termId }),
    onSuccess: () => {
      toast.success('Registered')
      qc.invalidateQueries({ queryKey: ['my-modules'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Registration failed'),
  })

  const drop = useMutation({
    mutationFn: (id: number) => myModulesService.drop(id),
    onSuccess: () => {
      toast.success('Module dropped')
      qc.invalidateQueries({ queryKey: ['my-modules'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Drop failed'),
  })

  const marksQ = useQuery({
    queryKey: ['my-marks'],
    queryFn: () => marksService.myMarks(),
    enabled: tab === 'marks',
  })

  const downloadTranscript = useMutation({
    mutationFn: () => marksService.downloadTranscript(),
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not download transcript'),
  })

  const eligible = eligibleQ.data?.data ?? []
  const mine: ModuleRegistration[] = mineQ.data?.data ?? []
  const marksData = marksQ.data?.data
  const marksRows = marksData?.rows ?? []
  const marksTotals = marksData?.totals

  return (
    <div className="max-w-[1200px] mx-auto space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-white">My modules</h2>
          <p className="text-[13px] text-ink-500">Register for the modules you are eligible to take this term.</p>
        </div>
        <select className="input input-sm w-56" value={termId || ''} onChange={(e) => setTermId(Number(e.target.value))}>
          <option value="" disabled>Select term…</option>
          {terms.map((t: any) => (
            <option key={t.id} value={t.id}>
              {t.label}{t.is_current ? ' (current)' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div className="card p-1 inline-flex gap-1">
        <button
          className={`px-3 py-1.5 text-[13px] rounded-md ${tab === 'available' ? 'bg-brand/10 text-brand font-semibold' : 'text-ink-600'}`}
          onClick={() => setTab('available')}
        >
          <Calendar className="w-3.5 h-3.5 inline mr-1" /> Available
        </button>
        <button
          className={`px-3 py-1.5 text-[13px] rounded-md ${tab === 'mine' ? 'bg-brand/10 text-brand font-semibold' : 'text-ink-600'}`}
          onClick={() => setTab('mine')}
        >
          <GraduationCap className="w-3.5 h-3.5 inline mr-1" /> My registrations
        </button>
        <button
          className={`px-3 py-1.5 text-[13px] rounded-md ${tab === 'marks' ? 'bg-brand/10 text-brand font-semibold' : 'text-ink-600'}`}
          onClick={() => setTab('marks')}
        >
          <ClipboardList className="w-3.5 h-3.5 inline mr-1" /> My marks
        </button>
      </div>

      {tab === 'marks' ? (
        <MyMarksTab
          loading={marksQ.isLoading}
          rows={marksRows}
          totals={marksTotals}
          downloading={downloadTranscript.isPending}
          canDownload={(marksTotals?.modules ?? 0) > 0}
          onDownload={() => downloadTranscript.mutate()}
        />
      ) : !termId ? (
        <div className="card p-8 text-center text-ink-400">Pick an academic term to continue.</div>
      ) : tab === 'available' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {eligibleQ.isLoading ? (
            <div className="col-span-full card p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" /></div>
          ) : eligible.length === 0 ? (
            <div className="col-span-full card p-8 text-center text-ink-400">
              No modules are currently available to you. You can only register for modules that have been scheduled for this term — check back once your registrar publishes the timetable, and verify your year of study and prerequisites.
            </div>
          ) : eligible.map((m: any) => (
            <div key={m.module_id} className="card p-4">
              <div className="font-mono text-[11px] text-ink-500 mb-0.5">{m.module_code}</div>
              <div className="font-semibold text-ink-900 dark:text-white mb-1">{m.module_name}</div>
              <div className="text-[12px] text-ink-500 mb-2">
                {m.module_credits} credits · Level {m.level}
              </div>
              {m.description && (
                <p className="text-[12px] text-ink-600 dark:text-ink-300 mb-3 line-clamp-3">{m.description}</p>
              )}
              <button
                className="btn-primary btn-xs w-full"
                disabled={register.isPending}
                onClick={() => register.mutate(m.module_id)}
              >
                {register.isPending ? 'Registering…' : 'Register'}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="bg-ink-50 dark:bg-ink-800/50 border-b border-ink-100 dark:border-ink-700">
                <th className="px-4 py-2.5 font-bold text-ink-400 text-[10px] uppercase">Module</th>
                <th className="px-4 py-2.5 font-bold text-ink-400 text-[10px] uppercase">Credits</th>
                <th className="px-4 py-2.5 font-bold text-ink-400 text-[10px] uppercase">Status</th>
                <th className="px-4 py-2.5 font-bold text-ink-400 text-[10px] uppercase">Grade</th>
                <th className="px-4 py-2.5 font-bold text-ink-400 text-[10px] uppercase text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
              {mineQ.isLoading ? (
                <tr><td colSpan={5} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" /></td></tr>
              ) : mine.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-ink-400">You have no registrations for this term yet.</td></tr>
              ) : mine.map((r) => (
                <tr key={r.id} className="hover:bg-ink-50/50 dark:hover:bg-ink-700/20">
                  <td className="px-4 py-3">
                    <span className="font-mono">{r.module_code}</span>
                    <span className="text-ink-500 ml-1">— {r.module_name}</span>
                  </td>
                  <td className="px-4 py-3">{r.module_credits ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`chip-xs ${
                      r.status === 'registered' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' :
                      r.status === 'completed'  ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' :
                      r.status === 'failed'     ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' :
                      'bg-ink-100 text-ink-600 dark:bg-ink-700 dark:text-ink-400'
                    }`}>
                      {r.status === 'completed' && <CheckCircle2 className="w-3 h-3 inline mr-0.5" />}
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{r.grade ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {r.status === 'registered' ? (
                      <button
                        className="btn-ghost btn-xs text-red-500"
                        disabled={drop.isPending}
                        onClick={() => confirm(`Drop ${r.module_code}?`) && drop.mutate(r.id)}
                      >
                        Drop
                      </button>
                    ) : (
                      <span className="text-ink-300 text-[12px]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ─── My Marks tab ───────────────────────────────────────────────────── */

interface MyMarksTabProps {
  loading:     boolean
  rows:        import('@/services/marksService').MyMarksRow[]
  totals?:     import('@/services/marksService').MyMarksTotals
  downloading: boolean
  canDownload: boolean
  onDownload:  () => void
}

function MyMarksTab({ loading, rows, totals, downloading, canDownload, onDownload }: MyMarksTabProps) {
  if (loading) {
    return <div className="card p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" /></div>
  }

  if (!rows.length) {
    return (
      <div className="card p-8 text-center text-ink-400">
        No marks have been recorded yet. Once your lecturer records marks for a module you have studied, they will
        appear here and you will be able to download your transcript.
      </div>
    )
  }

  // Group by year for a cleaner read.
  const byYear = new Map<string, typeof rows>()
  for (const r of rows) {
    const k = r.year_label ?? '—'
    if (!byYear.has(k)) byYear.set(k, [] as typeof rows)
    byYear.get(k)!.push(r)
  }

  return (
    <div className="space-y-4">
      {/* Summary card */}
      <div className="card p-4 flex flex-wrap items-center gap-4">
        <SumStat label="Modules"          value={totals?.modules ?? 0} />
        <SumStat label="Total credits"    value={totals?.total_credits ?? 0} />
        <SumStat label="Weighted average" value={totals?.weighted_average != null ? `${totals.weighted_average}%` : '—'} highlight />
        <SumStat label="Overall grade"    value={totals?.overall_grade ?? '—'} />
        <SumStat label="Decision"         value={totals?.decision ?? '—'} tone={totals?.decision === 'Promoted' ? 'good' : totals?.decision === 'Repeat' ? 'bad' : undefined} />
        <button
          className="btn-primary btn-sm ml-auto"
          disabled={!canDownload || downloading}
          onClick={onDownload}
          title={!canDownload ? 'No recorded marks to include in a transcript yet.' : undefined}
        >
          {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          {downloading ? 'Preparing…' : 'Download transcript'}
        </button>
      </div>

      {/* Per-year tables */}
      {Array.from(byYear.entries()).map(([year, list]) => (
        <div key={year} className="card overflow-hidden">
          <div className="px-4 py-2 border-b border-ink-100 dark:border-ink-700 bg-ink-50 dark:bg-ink-800/40 text-[12px] font-semibold text-ink-700 dark:text-ink-200">
            Academic year: <span className="font-mono">{year}</span>
          </div>
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="bg-ink-50/60 dark:bg-ink-800/30 border-b border-ink-100 dark:border-ink-700">
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase">#</th>
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase">Code</th>
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase">Module</th>
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase">Term</th>
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase text-center">Credits</th>
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase text-center">CAT</th>
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase text-center">Assg</th>
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase text-center">Exam</th>
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase text-center">Marks/100</th>
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase text-center">Grade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
              {list.map((r, i) => (
                <tr key={r.id} className="hover:bg-ink-50/50 dark:hover:bg-ink-700/20">
                  <td className="px-3 py-2 text-ink-500">{i + 1}</td>
                  <td className="px-3 py-2 font-mono">{r.module_code}</td>
                  <td className="px-3 py-2">{r.module_name}</td>
                  <td className="px-3 py-2 text-ink-500">{r.term_label}</td>
                  <td className="px-3 py-2 text-center">{r.module_credits}</td>
                  <td className="px-3 py-2 text-center">{fmt(r.cat_marks)}<span className="text-ink-400 text-[11px]">/{Number(r.cat_max) || '—'}</span></td>
                  <td className="px-3 py-2 text-center">{fmt(r.assignment_marks)}<span className="text-ink-400 text-[11px]">/{Number(r.assignment_max) || '—'}</span></td>
                  <td className="px-3 py-2 text-center">{fmt(r.exam_marks)}<span className="text-ink-400 text-[11px]">/{Number(r.exam_max) || '—'}</span></td>
                  <td className="px-3 py-2 text-center font-semibold">
                    {r.percentage != null ? Math.round(Number(r.percentage)) : '—'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {r.grade ? <GradePill grade={r.grade} /> : <span className="text-ink-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

function SumStat({ label, value, highlight, tone }: { label: string; value: React.ReactNode; highlight?: boolean; tone?: 'good' | 'bad' }) {
  const valueCls =
    tone === 'good' ? 'text-emerald-600' :
    tone === 'bad'  ? 'text-red-600' :
    highlight       ? 'text-brand dark:text-gold-400' : 'text-ink-900 dark:text-white'
  return (
    <div>
      <div className="text-[10px] uppercase font-bold text-ink-400">{label}</div>
      <div className={`text-base font-bold ${valueCls}`}>{value}</div>
    </div>
  )
}

function GradePill({ grade }: { grade: string }) {
  const tone =
    grade === 'A' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
    : grade === 'B' ? 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300'
    : grade === 'C' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
    : grade === 'D' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
    : 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${tone}`}>{grade}</span>
}

function fmt(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—'
  const n = Number(v)
  return Number.isFinite(n) ? String(n) : '—'
}

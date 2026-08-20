import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { CalendarClock, CheckCircle2, Loader2, GraduationCap, Calendar, ClipboardList, Download, Scale, AlertTriangle, FileText, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { myModulesService, type MyExamRow } from '@/services/modulesService'
import { academicService } from '@/services/academicService'
import { marksService } from '@/services/marksService'
import { gradeService } from '@/services/gradeService'
import {
  revaluationService, STATUS_LABELS,
  type Revaluation, type BacklogRow,
} from '@/services/revaluationService'
import { transcriptService } from '@/services/transcriptService'
import type { ModuleRegistration } from '@/types/modules'

type Tab = 'available' | 'mine' | 'exams' | 'marks' | 'revaluation'

const VALID_TABS: readonly Tab[] = ['available', 'mine', 'exams', 'marks', 'revaluation'] as const

export default function MyRegistrationsPage() {
  const qc = useQueryClient()

  const [sp, setSp] = useSearchParams()

  const termsQ = useQuery({ queryKey: ['academic', 'terms'], queryFn: () => academicService.listTerms() })
  const terms = termsQ.data?.data ?? []
  const termIdParam = Number(sp.get('term_id') || 0)
  const termId = termIdParam > 0
    ? termIdParam
    : Number((terms.find((t: any) => t.is_current) ?? terms[0])?.id ?? 0)
  const setTermId = (id: number) => {
    const next = new URLSearchParams(sp)
    if (id > 0) next.set('term_id', String(id))
    else        next.delete('term_id')
    setSp(next, { replace: true })
  }

  // Tab is driven by the URL so the sidebar can deep-link "My modules"
  // (mine), "My exams" and "My results" (marks) at the right tab.
  const tabParam = sp.get('tab') as Tab | null
  const tab: Tab = tabParam && (VALID_TABS as readonly string[]).includes(tabParam)
    ? tabParam
    : 'available'
  const setTab = (t: Tab) => {
    const next = new URLSearchParams(sp)
    next.set('tab', t)
    setSp(next, { replace: true })
  }

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

  const examsQ = useQuery({
    queryKey: ['my-modules', 'exams', termId],
    queryFn: () => myModulesService.exams({ term_id: termId }),
    enabled: !!termId && tab === 'exams',
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

  const gpaQ = useQuery({
    queryKey: ['my-gpa'],
    queryFn: () => gradeService.myGpa(),
    enabled: tab === 'marks',
  })

  const revReqQ = useQuery({
    queryKey: ['my-revaluations'],
    queryFn: () => revaluationService.myRequests(),
    enabled: tab === 'revaluation',
  })

  const backlogQ = useQuery({
    queryKey: ['my-backlog'],
    queryFn: () => revaluationService.myBacklog(),
    enabled: tab === 'revaluation',
  })

  const downloadTranscript = useMutation({
    mutationFn: () => marksService.downloadTranscript(),
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not download transcript'),
  })

  const eligible = eligibleQ.data?.data ?? []
  const mine: ModuleRegistration[] = mineQ.data?.data ?? []
  const exams: MyExamRow[] = examsQ.data?.data ?? []
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
          className={`px-3 py-1.5 text-[13px] rounded-md ${tab === 'exams' ? 'bg-brand/10 text-brand font-semibold' : 'text-ink-600'}`}
          onClick={() => setTab('exams')}
        >
          <CalendarClock className="w-3.5 h-3.5 inline mr-1" /> My exams
        </button>
        <button
          className={`px-3 py-1.5 text-[13px] rounded-md ${tab === 'marks' ? 'bg-brand/10 text-brand font-semibold' : 'text-ink-600'}`}
          onClick={() => setTab('marks')}
        >
          <ClipboardList className="w-3.5 h-3.5 inline mr-1" /> My marks
        </button>
        <button
          className={`px-3 py-1.5 text-[13px] rounded-md ${tab === 'revaluation' ? 'bg-brand/10 text-brand font-semibold' : 'text-ink-600'}`}
          onClick={() => setTab('revaluation')}
        >
          <Scale className="w-3.5 h-3.5 inline mr-1" /> Revaluation & backlog
        </button>
      </div>

      {tab === 'revaluation' ? (
        <MyRevaluationTab
          loadingReq={revReqQ.isLoading}
          loadingBacklog={backlogQ.isLoading}
          requests={revReqQ.data?.data ?? []}
          backlog={backlogQ.data?.data ?? []}
        />
      ) : tab === 'marks' ? (
        <MyMarksTab
          loading={marksQ.isLoading}
          rows={marksRows}
          totals={marksTotals}
          cgpa={gpaQ.data?.data?.cgpa ?? null}
          downloading={downloadTranscript.isPending}
          canDownload={(marksTotals?.modules ?? 0) > 0}
          onDownload={() => downloadTranscript.mutate()}
        />
      ) : tab === 'exams' ? (
        !termId ? (
          <div className="card p-8 text-center text-ink-400">Pick an academic term to continue.</div>
        ) : (
          <MyExamsTab loading={examsQ.isLoading} rows={exams} />
        )
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

/* ─── My Exams tab ───────────────────────────────────────────────────── */

function MyExamsTab({ loading, rows }: { loading: boolean; rows: MyExamRow[] }) {
  if (loading) {
    return <div className="card p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" /></div>
  }
  if (rows.length === 0) {
    return (
      <div className="card p-8 text-center text-ink-400">
        You have no scheduled exams for this term yet. Once your registrar publishes the exam timetable for a module
        you are registered to, it will show up here.
      </div>
    )
  }

  // Scheduled (date present) come first, then unscheduled.
  const scheduled   = rows.filter((r) => !!r.exam_date)
  const unscheduled = rows.filter((r) =>  !r.exam_date)

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="px-4 py-2 border-b border-ink-100 dark:border-ink-700 bg-ink-50 dark:bg-ink-800/40 text-[12px] font-semibold text-ink-700 dark:text-ink-200">
          Scheduled exams ({scheduled.length})
        </div>
        {scheduled.length === 0 ? (
          <div className="p-6 text-center text-ink-400 text-[12px]">No exam dates have been published yet.</div>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="bg-ink-50/60 dark:bg-ink-800/30 border-b border-ink-100 dark:border-ink-700">
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase">Code</th>
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase">Module</th>
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase">Term</th>
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase">Component</th>
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase">Date</th>
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase">Time</th>
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase">Campus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
              {scheduled.map((r) => (
                <tr key={`${r.module_id}-${r.exam_id ?? 'pending'}`} className="hover:bg-ink-50/50 dark:hover:bg-ink-700/20">
                  <td className="px-3 py-2 font-mono">{r.module_code}</td>
                  <td className="px-3 py-2">{r.module_name}</td>
                  <td className="px-3 py-2 text-ink-500">{r.term_label ?? '—'}</td>
                  <td className="px-3 py-2 capitalize">{r.component ?? '—'}</td>
                  <td className="px-3 py-2 font-semibold">{r.exam_date}</td>
                  <td className="px-3 py-2">
                    {r.start_time ? `${r.start_time}${r.end_time ? ` – ${r.end_time}` : ''}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-ink-500">{r.campus_name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {unscheduled.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-2 border-b border-ink-100 dark:border-ink-700 bg-ink-50 dark:bg-ink-800/40 text-[12px] font-semibold text-ink-700 dark:text-ink-200">
            Awaiting schedule ({unscheduled.length})
          </div>
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="bg-ink-50/60 dark:bg-ink-800/30 border-b border-ink-100 dark:border-ink-700">
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase">Code</th>
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase">Module</th>
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase">Term</th>
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
              {unscheduled.map((r) => (
                <tr key={`${r.module_id}-pending`}>
                  <td className="px-3 py-2 font-mono">{r.module_code}</td>
                  <td className="px-3 py-2">{r.module_name}</td>
                  <td className="px-3 py-2 text-ink-500">{r.term_label ?? '—'}</td>
                  <td className="px-3 py-2 text-ink-400 italic">Not yet scheduled</td>
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
  cgpa?:       number | null
  downloading: boolean
  canDownload: boolean
  onDownload:  () => void
}

const TR_STATUS_BADGE: Record<string, string> = {
  pending:    'bg-yellow-100 text-yellow-800',
  approved:   'bg-green-100 text-green-800',
  dispatched: 'bg-blue-100 text-blue-800',
  rejected:   'bg-red-100 text-red-800',
}

function MyMarksTab({ loading, rows, totals, cgpa, downloading, canDownload, onDownload }: MyMarksTabProps) {
  const qc = useQueryClient()
  const [requestOpen, setRequestOpen] = useState(false)
  const [purpose, setPurpose]         = useState('')
  const [copies, setCopies]           = useState(1)

  const myRequestsQ = useQuery({
    queryKey: ['my-transcript-requests'],
    queryFn:  () => transcriptService.myRequests(),
  })
  const myRequests: any[] = myRequestsQ.data?.data ?? []

  const submitRequest = useMutation({
    mutationFn: () => transcriptService.create({ purpose, copies }),
    onSuccess: () => {
      toast.success('Transcript request submitted. Registry will process it shortly.')
      qc.invalidateQueries({ queryKey: ['my-transcript-requests'] })
      setRequestOpen(false)
      setPurpose('')
      setCopies(1)
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to submit request.'),
  })

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
        <SumStat label="CGPA"             value={cgpa != null ? cgpa.toFixed(2) : '—'} highlight />
        <SumStat label="Overall grade"    value={totals?.overall_grade ?? '—'} />
        <SumStat label="Decision"         value={totals?.decision ?? '—'} tone={totals?.decision === 'Promoted' ? 'good' : totals?.decision === 'Repeat' ? 'bad' : undefined} />
        <div className="ml-auto flex items-center gap-2">
          <button
            className="btn-primary btn-sm"
            disabled={!canDownload || downloading}
            onClick={onDownload}
            title={!canDownload ? 'No recorded marks to include in a transcript yet.' : undefined}
          >
            {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {downloading ? 'Preparing…' : 'Download transcript'}
          </button>
          <button
            className="btn-sm border border-ink-200 dark:border-ink-600 text-ink-700 dark:text-ink-200 hover:bg-ink-50 dark:hover:bg-ink-700 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium"
            onClick={() => setRequestOpen(true)}
          >
            <FileText className="w-3.5 h-3.5" /> Request Official Copy
          </button>
        </div>
      </div>

      {/* Previous transcript requests */}
      {myRequests.length > 0 && (
        <div className="card p-4">
          <h3 className="text-[12px] font-semibold text-ink-500 uppercase mb-3">My Transcript Requests</h3>
          <div className="space-y-2">
            {myRequests.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between text-[13px] border-b border-ink-100 dark:border-ink-700 pb-2 last:border-0 last:pb-0">
                <div>
                  <span className="font-medium capitalize">{r.request_type}</span>
                  {r.purpose && <span className="text-ink-400 ml-2">— {r.purpose}</span>}
                  <span className="text-ink-400 ml-2 text-[11px]">{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${TR_STATUS_BADGE[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Request modal */}
      {requestOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-ink-800 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-ink-900 dark:text-white">Request Official Transcript</h2>
              <button onClick={() => setRequestOpen(false)} className="text-ink-400 hover:text-ink-700"><X className="w-5 h-5" /></button>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-ink-600 dark:text-ink-300 mb-1">Purpose (optional)</label>
              <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. Further studies, Employment…"
                className="w-full border border-ink-200 dark:border-ink-600 rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-brand dark:bg-ink-700 dark:text-white" />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-ink-600 dark:text-ink-300 mb-1">Number of Copies</label>
              <input type="number" min={1} max={10} value={copies} onChange={(e) => setCopies(Number(e.target.value))}
                className="w-24 border border-ink-200 dark:border-ink-600 rounded-lg px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-brand dark:bg-ink-700 dark:text-white" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setRequestOpen(false)} className="btn-sm border border-ink-200 text-ink-700 px-4 py-2 rounded-lg text-[13px]">Cancel</button>
              <button onClick={() => submitRequest.mutate()} disabled={submitRequest.isPending}
                className="btn-primary btn-sm px-4 py-2 disabled:opacity-50">
                {submitRequest.isPending ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}

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

/* ─── Revaluation & backlog tab ──────────────────────────────────────────── */

interface MyRevaluationTabProps {
  loadingReq:     boolean
  loadingBacklog: boolean
  requests:       Revaluation[]
  backlog:        BacklogRow[]
}

function statusTone(s: Revaluation['status']) {
  return {
    pending:   'text-amber-600',
    approved:  'text-blue-600',
    processed: 'text-emerald-600',
    rejected:  'text-red-600',
  }[s]
}

function MyRevaluationTab({ loadingReq, loadingBacklog, requests, backlog }: MyRevaluationTabProps) {
  const qc = useQueryClient()
  const [target, setTarget] = useState<BacklogRow | null>(null)
  const [reason, setReason] = useState('')

  // mark_ids that already have an open request, to disable the button.
  const openMarkIds = new Set(
    requests.filter((r) => r.status === 'pending' || r.status === 'approved').map((r) => r.exam_id),
  )

  const submit = useMutation({
    mutationFn: () => revaluationService.request(target!.mark_id, reason.trim()),
    onSuccess: () => {
      toast.success('Revaluation request submitted.')
      setTarget(null); setReason('')
      qc.invalidateQueries({ queryKey: ['my-revaluations'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not submit request.'),
  })

  return (
    <div className="space-y-4">
      {/* Backlog */}
      <div className="card overflow-hidden">
        <div className="px-4 py-2 border-b border-ink-100 dark:border-ink-700 bg-ink-50 dark:bg-ink-800/40 text-[12px] font-semibold text-ink-700 dark:text-ink-200">
          Backlog — failed modules
        </div>
        {loadingBacklog ? (
          <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" /></div>
        ) : backlog.length === 0 ? (
          <div className="p-6 text-center text-ink-400 text-[13px]">
            No backlog — you have no failed modules on record. 🎉
          </div>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="bg-ink-50/60 dark:bg-ink-800/30 border-b border-ink-100 dark:border-ink-700 text-[10px] uppercase text-ink-400">
                <th className="px-3 py-2 font-bold">Module</th>
                <th className="px-3 py-2 font-bold">Year / term</th>
                <th className="px-3 py-2 font-bold text-center">Mark</th>
                <th className="px-3 py-2 font-bold text-center">Grade</th>
                <th className="px-3 py-2 font-bold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {backlog.map((b) => (
                <tr key={b.mark_id} className="border-b border-ink-50 dark:border-ink-800/60">
                  <td className="px-3 py-2">
                    <div className="font-medium">{b.module_code}</div>
                    <div className="text-[11px] text-ink-400 max-w-[200px] truncate">{b.module_name}</div>
                  </td>
                  <td className="px-3 py-2 text-ink-500">{b.year_label ?? '—'} · {b.term_label ?? '—'}</td>
                  <td className="px-3 py-2 text-center font-semibold text-red-600">{b.percentage != null ? `${b.percentage}%` : '—'}</td>
                  <td className="px-3 py-2 text-center">{b.grade ?? '—'}</td>
                  <td className="px-3 py-2 text-right">
                    {openMarkIds.has(b.mark_id) ? (
                      <span className="text-[11px] text-amber-600">Request open</span>
                    ) : (
                      <button className="btn-ghost btn-sm" onClick={() => { setTarget(b); setReason('') }}>
                        <Scale className="w-3.5 h-3.5" /> Request revaluation
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* My requests */}
      <div className="card overflow-hidden">
        <div className="px-4 py-2 border-b border-ink-100 dark:border-ink-700 bg-ink-50 dark:bg-ink-800/40 text-[12px] font-semibold text-ink-700 dark:text-ink-200">
          My revaluation requests
        </div>
        {loadingReq ? (
          <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" /></div>
        ) : requests.length === 0 ? (
          <div className="p-6 text-center text-ink-400 text-[13px]">You haven't requested any revaluations yet.</div>
        ) : (
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="bg-ink-50/60 dark:bg-ink-800/30 border-b border-ink-100 dark:border-ink-700 text-[10px] uppercase text-ink-400">
                <th className="px-3 py-2 font-bold">Module</th>
                <th className="px-3 py-2 font-bold">Reason</th>
                <th className="px-3 py-2 font-bold text-center">Current</th>
                <th className="px-3 py-2 font-bold text-center">New</th>
                <th className="px-3 py-2 font-bold">Status</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-b border-ink-50 dark:border-ink-800/60 align-top">
                  <td className="px-3 py-2 font-medium">{r.module_code ?? `#${r.exam_id}`}</td>
                  <td className="px-3 py-2 text-ink-600 dark:text-ink-300 max-w-[240px]"><span className="line-clamp-2">{r.reason}</span></td>
                  <td className="px-3 py-2 text-center">{r.current_marks != null ? `${r.current_marks}%` : '—'}</td>
                  <td className="px-3 py-2 text-center font-semibold text-brand">{r.new_marks != null ? `${r.new_marks}%` : '—'}</td>
                  <td className={`px-3 py-2 font-medium ${statusTone(r.status)}`}>{STATUS_LABELS[r.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Request modal */}
      {target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 backdrop-blur-sm p-4">
          <div className="card w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-3 border-b border-ink-100 dark:border-ink-700">
              <h3 className="font-semibold text-ink-900 dark:text-ink-50">Request revaluation</h3>
              <button className="p-1 text-ink-400 hover:text-ink-700" onClick={() => setTarget(null)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4 text-[13px]">
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 p-3 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  You are requesting a re-mark of <b>{target.module_code}</b> ({target.module_name}),
                  currently <b>{target.percentage}%</b>. A revaluation fee may apply.
                </span>
              </div>
              <div>
                <label className="label">Reason for the request</label>
                <textarea className="input min-h-[100px]" value={reason}
                  placeholder="Explain why you believe this result should be re-checked…"
                  onChange={(e) => setReason(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-ink-100 dark:border-ink-700">
              <button className="btn-ghost btn-sm" onClick={() => setTarget(null)}>Cancel</button>
              <button className="btn-primary btn-sm" disabled={reason.trim().length < 5 || submit.isPending} onClick={() => submit.mutate()}>
                {submit.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scale className="w-4 h-4" />} Submit request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

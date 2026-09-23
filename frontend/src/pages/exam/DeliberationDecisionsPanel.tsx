import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Loader2, Gavel, AlertTriangle, Check, X, ArrowUpRight } from 'lucide-react'
import {
  deliberationService,
  type DeliberationOutcome,
  type DeliberationDecision,
  type FinalizePreview,
} from '@/services/deliberationService'
import { useLevels } from '@/hooks/useLevels'
import ModalPortal from '@/components/ui/ModalPortal'

/**
 * The board's minute for one deliberation session.
 *
 * "Deliberation no kwimura abanyeshuri bava muri Level imwe, gusibiza ndetse
 * no kumufatira umwanzuro, kwimura Promotion" — the board records an outcome
 * per student, and finalising the session applies it.
 *
 * Finalising is irreversible: it locks the marks AND rewrites levels and
 * statuses, and there is no un-finalise. So the confirm step is a dry run
 * fetched from the server, listing every change before any of it happens.
 */

const OUTCOMES: ReadonlyArray<{ value: DeliberationOutcome; label: string; hint: string }> = [
  { value: 'promote',        label: 'Promote',          hint: 'Advance to the next level' },
  { value: 'repeat_level',   label: 'Repeat level',     hint: 'Stay in the same level' },
  { value: 'repeat_modules', label: 'Carry modules',    hint: 'Progress, but resit named modules' },
  { value: 'defer',          label: 'Defer',            hint: 'Authorised break; level unchanged' },
  { value: 'discontinue',    label: 'Discontinue',      hint: 'Leaves the programme' },
]

const OUTCOME_STYLE: Record<DeliberationOutcome, string> = {
  promote:        'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
  repeat_level:   'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
  repeat_modules: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  defer:          'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
  discontinue:    'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400',
}

interface Props {
  sessionId: number
  finalized: boolean
  /** Programme scope passed through to finalise, as the page already does. */
  stdOption?: string
  onFinalized?: () => void
}

export default function DeliberationDecisionsPanel({
  sessionId, finalized, stdOption, onFinalized,
}: Props) {
  const qc = useQueryClient()
  const { levelName } = useLevels()
  const [confirming, setConfirming] = useState(false)

  const decisionsQ = useQuery({
    queryKey: ['deliberation', sessionId, 'decisions'],
    queryFn:  ({ signal }) => deliberationService.listDecisions(sessionId, signal),
  })
  const decisions = (decisionsQ.data?.data ?? []) as DeliberationDecision[]

  const previewQ = useQuery({
    queryKey: ['deliberation', sessionId, 'preview'],
    queryFn:  ({ signal }) => deliberationService.previewFinalize(sessionId, signal),
    enabled:  confirming,
  })
  const preview = previewQ.data?.data as FinalizePreview | undefined

  const counts = useMemo(() => {
    const c: Partial<Record<DeliberationOutcome, number>> = {}
    for (const d of decisions) c[d.outcome] = (c[d.outcome] ?? 0) + 1
    return c
  }, [decisions])

  const finalize = useMutation({
    mutationFn: () => deliberationService.finalizeSession(sessionId, { std_option: stdOption || undefined }),
    onSuccess: (res) => {
      const d = res.data
      toast.success(
        `Session finalised — ${d?.promoted ?? 0} promoted, ${d?.discontinued ?? 0} discontinued.`,
        { duration: 6000 },
      )
      if (d?.unknown_students?.length) {
        toast(`${d.unknown_students.length} decision(s) named a student not in the register and applied to nobody.`,
              { icon: '⚠️', duration: 9000 })
      }
      qc.invalidateQueries({ queryKey: ['deliberation', sessionId] })
      qc.invalidateQueries({ queryKey: ['deliberation-sessions'] })
      setConfirming(false)
      onFinalized?.()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not finalise the session.'),
  })

  if (decisionsQ.isLoading) {
    return <div className="p-4 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-brand" /></div>
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Gavel className="w-4 h-4 text-ink-400" />
        <h4 className="text-[13px] font-bold text-ink-900 dark:text-ink-50">
          Board decisions ({decisions.length})
        </h4>
        {OUTCOMES.map((o) => (counts[o.value] ? (
          <span key={o.value} className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${OUTCOME_STYLE[o.value]}`}>
            {counts[o.value]} {o.label}
          </span>
        ) : null))}

        {!finalized && decisions.length > 0 && (
          <button
            type="button"
            className="btn-primary btn-sm ml-auto"
            onClick={() => setConfirming(true)}
          >
            <Check className="w-3.5 h-3.5" /> Finalise &amp; apply
          </button>
        )}
      </div>

      {decisions.length === 0 ? (
        <p className="text-[12.5px] text-ink-400">
          No decisions recorded yet. Record an outcome per student from the marks grid,
          then finalise to apply them.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-ink-100 dark:border-ink-800">
          <table className="w-full text-left text-[12.5px]">
            <thead className="bg-ink-50 dark:bg-ink-800/50">
              <tr>
                {['Student', 'Outcome', 'Level', 'Notes', 'Applied'].map((h) => (
                  <th key={h} className="px-3 py-2 font-bold text-ink-400 uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
              {decisions.map((d) => (
                <tr key={d.id}>
                  <td className="px-3 py-2">
                    <span className="font-medium text-ink-900 dark:text-ink-50">{d.student_name ?? '—'}</span>
                    <span className="ml-2 font-mono text-[11px] text-ink-400">{d.student_regnumber}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${OUTCOME_STYLE[d.outcome]}`}>
                      {OUTCOMES.find((o) => o.value === d.outcome)?.label ?? d.outcome}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {d.outcome === 'promote' && d.level_to
                      ? <span className="inline-flex items-center gap-1">
                          {levelName(d.level_from ?? null, '—')}
                          <ArrowUpRight className="w-3 h-3 text-emerald-600" />
                          <span className="font-semibold">{levelName(d.level_to, String(d.level_to))}</span>
                        </span>
                      : <span className="text-ink-400">{levelName(d.level_from ?? null, '—')}</span>}
                  </td>
                  <td className="px-3 py-2 text-ink-500 max-w-[280px]">
                    {d.carry_modules && <span className="font-mono text-[11px] mr-1">{d.carry_modules}</span>}
                    {d.reason}
                  </td>
                  <td className="px-3 py-2 text-ink-400 tabular-nums whitespace-nowrap">
                    {d.applied_at ? d.applied_at.slice(0, 10) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirming && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8">
            <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-ink-900 shadow-xl">
              <header className="px-5 py-4 border-b border-ink-100 dark:border-ink-800">
                <h3 className="text-[15px] font-bold text-ink-900 dark:text-ink-50 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Finalise this session?
                </h3>
                <p className="text-[12.5px] text-ink-500 mt-0.5">
                  This locks every mark in the programme and applies the decisions below.
                  It cannot be undone from this screen.
                </p>
              </header>

              <div className="px-5 py-4 space-y-3 max-h-[50vh] overflow-y-auto">
                {previewQ.isLoading ? (
                  <div className="py-6 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-brand" /></div>
                ) : !preview ? (
                  <p className="text-[13px] text-red-600">Could not build the preview. Try again.</p>
                ) : (
                  <>
                    {preview.unknown_students.length > 0 && (
                      <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/15 px-3 py-2 text-[12.5px]">
                        <p className="font-semibold text-amber-800 dark:text-amber-300">
                          {preview.unknown_students.length} decision(s) name a student who is not in the register.
                        </p>
                        <p className="text-amber-700 dark:text-amber-400 font-mono text-[11px] mt-0.5">
                          {preview.unknown_students.join(', ')}
                        </p>
                        <p className="text-amber-700 dark:text-amber-400 mt-0.5">
                          These will apply to nobody. Fix them first if that is not intended.
                        </p>
                      </div>
                    )}

                    {preview.changes.length === 0 ? (
                      <p className="text-[13px] text-ink-500">
                        No student record changes — every decision either leaves the level alone
                        or has already been applied. Marks will still be locked.
                      </p>
                    ) : (
                      <>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">
                          {preview.changes.length} record change(s)
                        </p>
                        <ul className="space-y-1 text-[12.5px]">
                          {preview.changes.map((c, i) => (
                            <li key={i} className="text-ink-700 dark:text-ink-200">
                              <span className="font-medium">{c.student_name}</span>{' '}
                              <span className="text-ink-400">— {c.change}:</span>{' '}
                              <span className="text-ink-400 line-through">{c.from || '—'}</span>{' '}
                              → <span className="font-semibold">{c.to}</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </>
                )}
              </div>

              <footer className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-ink-100 dark:border-ink-800">
                <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirming(false)}>
                  <X className="w-3.5 h-3.5" /> Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary btn-sm disabled:opacity-50"
                  disabled={finalize.isPending || previewQ.isLoading}
                  onClick={() => finalize.mutate()}
                >
                  {finalize.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {finalize.isPending ? 'Applying…' : 'Finalise and apply'}
                </button>
              </footer>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Loader2, Upload, FileText, Download, History, X } from 'lucide-react'
import ModalPortal from '@/components/ui/ModalPortal'
import { studentService, type StudentStatusChange } from '@/services/studentService'

/**
 * Change a student's status, capturing why — and for a death, the document
 * that proves it.
 *
 * The August 2026 registry report asked for "Rejected with reason, Drop out
 * with reason, Death with Upload supporting document". Those rules live on the
 * server (StudentController::updateStatus); this form mirrors them so the user
 * is told before they submit, not after. The generic student PUT refuses
 * status changes outright, so this is the only way to move a student's state.
 */

/** Must stay in step with STUDENT_STATES in StudentDetailsPage.tsx and
 *  StudentController::STUDENT_STATES. */
const STATES: ReadonlyArray<{ value: string; label: string; hint?: string }> = [
  { value: 'active',    label: 'Active' },
  { value: 'inactive',  label: 'Inactive' },
  { value: 'graduands', label: 'Graduand' },
  { value: 'graduated', label: 'Graduated' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'rejected',  label: 'Rejected',    hint: 'Needs a reason' },
  { value: 'dropped',   label: 'Dropped out', hint: 'Needs a reason' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'deceased',  label: 'Deceased',    hint: 'Needs a supporting document' },
]

const REASON_REQUIRED   = ['rejected', 'dropped']
const DOCUMENT_REQUIRED = ['deceased']

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.doc,.docx'

const fmtWhen = (v: string) =>
  new Date(v.replace(' ', 'T')).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

const labelFor = (v: string | null) =>
  !v ? '—' : (STATES.find((s) => s.value === v)?.label ?? v)

interface Props {
  studentId:     number
  studentName:   string
  currentState:  string
  onClose:       () => void
  /** Called after a successful change so the parent can refetch the student. */
  onChanged?:    () => void
}

export default function StatusChangeModal({
  studentId, studentName, currentState, onClose, onChanged,
}: Props) {
  const qc = useQueryClient()
  const [state, setState]   = useState(currentState)
  const [reason, setReason] = useState('')
  const [file, setFile]     = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const historyQ = useQuery({
    queryKey: ['student', studentId, 'status-history'],
    queryFn: ({ signal }) => studentService.statusHistory(studentId, signal),
  })
  const history = (historyQ.data?.data ?? []) as StudentStatusChange[]

  const needsReason = REASON_REQUIRED.includes(state)
  const needsDoc    = DOCUMENT_REQUIRED.includes(state)
  const changed     = state !== currentState

  const blocker = useMemo(() => {
    if (!changed)                              return 'Pick a different status to record a change.'
    if (needsReason && reason.trim() === '')   return `A reason is required to mark this student ${labelFor(state).toLowerCase()}.`
    if (needsDoc && !file)                     return 'Attach the supporting document before saving.'
    return null
  }, [changed, needsReason, needsDoc, reason, file, state])

  const save = useMutation({
    mutationFn: () =>
      studentService.updateStatus(studentId, {
        student_state: state,
        reason: reason.trim() || undefined,
        document: file,
      }),
    onSuccess: () => {
      toast.success(`Status changed to ${labelFor(state)}.`)
      qc.invalidateQueries({ queryKey: ['student', studentId] })
      qc.invalidateQueries({ queryKey: ['student', studentId, 'status-history'] })
      onChanged?.()
      onClose()
    },
    onError: (e: any) => {
      // The server returns field-keyed errors; surface the first one rather
      // than a generic failure so the user knows what to fix.
      const errs = e?.response?.data?.errors as Record<string, string[]> | undefined
      const first = errs ? Object.values(errs)[0]?.[0] : undefined
      toast.error(first ?? e?.response?.data?.message ?? 'Could not change the status.')
    },
  })

  // Clear a chosen file when moving to a state that does not take one, so a
  // certificate can't be attached to an unrelated change by accident.
  useEffect(() => {
    if (!needsDoc && file && !changed) setFile(null)
  }, [needsDoc]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8">
        <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-ink-900 shadow-xl">
          <header className="flex items-start justify-between gap-4 px-5 py-4 border-b border-ink-100 dark:border-ink-800">
            <div>
              <h2 className="text-[15px] font-bold text-ink-900 dark:text-ink-50">Change status</h2>
              <p className="text-[12.5px] text-ink-500">
                {studentName} · currently <strong>{labelFor(currentState)}</strong>
              </p>
            </div>
            <button type="button" onClick={onClose} className="btn-ghost btn-sm" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </header>

          <div className="px-5 py-4 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="new-state" className="label">New status</label>
              <select
                id="new-state"
                className="input"
                value={state}
                onChange={(e) => setState(e.target.value)}
              >
                {STATES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}{s.hint ? ` — ${s.hint}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="status-reason" className="label">
                Reason {needsReason
                  ? <span className="text-red-600">*</span>
                  : <span className="text-ink-400 font-normal">(optional)</span>}
              </label>
              <textarea
                id="status-reason"
                className="input min-h-[76px]"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={needsReason
                  ? 'Why is the student being moved to this status?'
                  : 'Anything the registry should know about this change.'}
              />
            </div>

            <div className="space-y-1.5">
              <span className="label">
                Supporting document {needsDoc
                  ? <span className="text-red-600">*</span>
                  : <span className="text-ink-400 font-normal">(optional)</span>}
              </span>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <div className="flex items-center gap-2">
                <button type="button" className="btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
                  <Upload className="w-3.5 h-3.5" /> Choose file
                </button>
                {file ? (
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-600 dark:text-ink-300">
                    <FileText className="w-3.5 h-3.5" /> {file.name}
                    <button
                      type="button"
                      onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = '' }}
                      className="text-ink-400 hover:text-red-600"
                      aria-label="Remove the chosen file"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ) : (
                  <span className="text-[12px] text-ink-400">PDF, JPG, PNG, DOC or DOCX</span>
                )}
              </div>
            </div>

            {history.length > 0 && (
              <details className="rounded-lg border border-ink-100 dark:border-ink-800">
                <summary className="cursor-pointer px-3 py-2 text-[12.5px] font-semibold text-ink-600 dark:text-ink-300 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5" /> Previous changes ({history.length})
                </summary>
                <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                  {history.map((h) => (
                    <li key={h.id} className="px-3 py-2.5 text-[12.5px]">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-semibold text-ink-800 dark:text-ink-100">
                          {labelFor(h.previous_state)} → {labelFor(h.new_state)}
                        </span>
                        <span className="text-ink-400 tabular-nums">{fmtWhen(h.changed_at)}</span>
                        {h.changed_by_name && <span className="text-ink-400">· {h.changed_by_name}</span>}
                      </div>
                      {h.reason && <p className="mt-0.5 text-ink-600 dark:text-ink-300">{h.reason}</p>}
                      {h.has_document && (
                        <button
                          type="button"
                          onClick={() => studentService.downloadStatusDocument(studentId, h.id)}
                          className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-brand hover:underline"
                        >
                          <Download className="w-3 h-3" />
                          {h.document_original_name ?? 'Supporting document'}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          <footer className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-ink-100 dark:border-ink-800">
            <p className="text-[12px] text-ink-500">{blocker ?? 'Ready to save.'}</p>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost btn-sm" onClick={onClose}>Cancel</button>
              <button
                type="button"
                className="btn-primary btn-sm disabled:opacity-50"
                disabled={blocker !== null || save.isPending}
                onClick={() => save.mutate()}
              >
                {save.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {save.isPending ? 'Saving…' : 'Save status'}
              </button>
            </div>
          </footer>
        </div>
      </div>
    </ModalPortal>
  )
}

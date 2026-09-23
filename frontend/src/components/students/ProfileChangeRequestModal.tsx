import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Loader2, Upload, FileText, X, History, ShieldCheck } from 'lucide-react'
import ModalPortal from '@/components/ui/ModalPortal'
import { studentService, type ProfileChangeRequest } from '@/services/studentService'

/**
 * A student proposes a correction to their identity details.
 *
 * The August 2026 report asked that the student portal be able to change
 * "imyirondoro ye yose". Their contact details already save immediately; these
 * fields cannot, because they print on transcripts, certificates and the ID
 * card — a student who could rename themselves at will could rename themselves
 * on a degree. So they are proposed here, with evidence, and the registry
 * decides.
 *
 * The field list mirrors StudentController::CHANGE_REQUESTABLE. The server
 * re-whitelists on approval, so this list is a convenience for the user rather
 * than the thing that enforces policy.
 */

const FIELDS: ReadonlyArray<{ key: string; label: string; type?: string; hint?: string }> = [
  { key: 'fname',       label: 'First name' },
  { key: 'lname',       label: 'Surname' },
  { key: 'birthdate',   label: 'Date of birth', type: 'date' },
  { key: 'gender',      label: 'Gender' },
  { key: 'nationality', label: 'Nationality' },
  { key: 'country',     label: 'Country' },
  { key: 'id_card',     label: 'National ID' },
  { key: 'father',      label: "Father's name" },
  { key: 'mother',      label: "Mother's name" },
]

const fmtWhen = (v: string) =>
  new Date(v.replace(' ', 'T')).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

const STATUS_STYLE: Record<ProfileChangeRequest['status'], string> = {
  pending:  'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
  approved: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400',
  rejected: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400',
}

interface Props {
  student: Record<string, any>
  onClose: () => void
}

export default function ProfileChangeRequestModal({ student, onClose }: Props) {
  const qc = useQueryClient()
  const [values, setValues] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  const [file, setFile]     = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const historyQ = useQuery({
    queryKey: ['student', 'me', 'profile-change-requests'],
    queryFn:  ({ signal }) => studentService.myProfileChangeRequests(signal),
  })
  const history = (historyQ.data?.data ?? []) as ProfileChangeRequest[]
  const openRequest = history.find((h) => h.status === 'pending')

  const current = (key: string) => String(student?.[key] ?? '')

  // Only fields the student actually altered are sent, so the registry sees a
  // request about one correction rather than the whole form.
  const changed = useMemo(
    () => FIELDS.filter((f) => values[f.key] !== undefined && values[f.key].trim() !== current(f.key)),
    [values, student],
  )

  const save = useMutation({
    mutationFn: () => studentService.requestProfileChange({
      fields:   Object.fromEntries(changed.map((f) => [f.key, values[f.key].trim()])),
      reason:   reason.trim() || undefined,
      document: file,
    }),
    onSuccess: () => {
      toast.success('Sent to the registry for review.')
      qc.invalidateQueries({ queryKey: ['student', 'me', 'profile-change-requests'] })
      onClose()
    },
    onError: (e: any) => {
      const errs  = e?.response?.data?.errors as Record<string, string[]> | undefined
      const first = errs ? Object.values(errs)[0]?.[0] : undefined
      toast.error(first ?? e?.response?.data?.message ?? 'Could not send the request.')
    },
  })

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8">
        <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-ink-900 shadow-xl">
          <header className="flex items-start justify-between gap-4 px-5 py-4 border-b border-ink-100 dark:border-ink-800">
            <div>
              <h2 className="text-[15px] font-bold text-ink-900 dark:text-ink-50">Request a correction</h2>
              <p className="text-[12.5px] text-ink-500">
                These details appear on your transcript and certificates, so the registry reviews them before they change.
              </p>
            </div>
            <button type="button" onClick={onClose} className="btn-ghost btn-sm" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </header>

          <div className="px-5 py-4 space-y-4">
            {openRequest ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/15 px-4 py-3 text-[13px]">
                <p className="font-semibold text-amber-800 dark:text-amber-300">
                  You already have a request awaiting review.
                </p>
                <p className="text-amber-700 dark:text-amber-400 mt-0.5">
                  Sent {fmtWhen(openRequest.created_at)}. You can send another once the registry has decided this one.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {FIELDS.map((f) => (
                    <div key={f.key} className="space-y-1">
                      <label htmlFor={`pcr-${f.key}`} className="label">{f.label}</label>
                      <input
                        id={`pcr-${f.key}`}
                        type={f.type ?? 'text'}
                        className="input"
                        value={values[f.key] ?? current(f.key)}
                        onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="pcr-reason" className="label">Why is this wrong?</label>
                  <textarea
                    id="pcr-reason"
                    className="input min-h-[70px]"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. My surname is spelt differently on my national ID."
                  />
                </div>

                <div className="space-y-1.5">
                  <span className="label">
                    Supporting document <span className="text-ink-400 font-normal">(strongly recommended)</span>
                  </span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
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
                      <span className="text-[12px] text-ink-400">
                        A scan of your ID or birth certificate settles this fastest.
                      </span>
                    )}
                  </div>
                </div>

                {changed.length > 0 && (
                  <div className="rounded-lg border border-ink-100 dark:border-ink-800 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400 mb-1.5">
                      You are asking to change
                    </p>
                    <ul className="space-y-0.5 text-[13px]">
                      {changed.map((f) => (
                        <li key={f.key} className="text-ink-700 dark:text-ink-200">
                          <span className="font-medium">{f.label}:</span>{' '}
                          <span className="text-ink-400 line-through">{current(f.key) || '—'}</span>{' '}
                          → <span className="font-semibold">{values[f.key].trim()}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}

            {history.length > 0 && (
              <details className="rounded-lg border border-ink-100 dark:border-ink-800">
                <summary className="cursor-pointer px-3 py-2 text-[12.5px] font-semibold text-ink-600 dark:text-ink-300 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5" /> My requests ({history.length})
                </summary>
                <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                  {history.map((h) => (
                    <li key={h.id} className="px-3 py-2.5 text-[12.5px] space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${STATUS_STYLE[h.status]}`}>
                          {h.status}
                        </span>
                        <span className="text-ink-400 tabular-nums">{fmtWhen(h.created_at)}</span>
                        {h.reviewed_by_name && <span className="text-ink-400">· {h.reviewed_by_name}</span>}
                      </div>
                      <p className="text-ink-600 dark:text-ink-300">
                        {h.changes.map((c) => `${c.label}: ${c.from ?? '—'} → ${c.to ?? '—'}`).join('; ')}
                      </p>
                      {h.review_note && (
                        <p className="text-ink-500 italic">Registry: {h.review_note}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          <footer className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-ink-100 dark:border-ink-800">
            <p className="text-[12px] text-ink-500 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              {openRequest
                ? 'One request at a time.'
                : changed.length === 0
                  ? 'Edit a field above to request a correction.'
                  : `${changed.length} field${changed.length === 1 ? '' : 's'} will be sent for review.`}
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn-ghost btn-sm" onClick={onClose}>Cancel</button>
              <button
                type="button"
                className="btn-primary btn-sm disabled:opacity-50"
                disabled={!!openRequest || changed.length === 0 || save.isPending}
                onClick={() => save.mutate()}
              >
                {save.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {save.isPending ? 'Sending…' : 'Send request'}
              </button>
            </div>
          </footer>
        </div>
      </div>
    </ModalPortal>
  )
}

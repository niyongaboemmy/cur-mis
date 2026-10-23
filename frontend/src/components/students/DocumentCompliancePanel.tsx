import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  AlertCircle, AlertTriangle, Bell, CheckCircle2, ChevronDown, ChevronUp, Clock,
  Eye, History, Loader2, Mail, Send, ShieldCheck, ShieldX, Smartphone, XCircle, Settings2,
} from 'lucide-react'
import {
  studentService,
  type DocumentChecklist,
  type DocumentRequirementItem,
  type DocumentRequirementStatus,
  type MissingDocumentNotice,
  type NotifyMissingDocumentsResult,
} from '@/services/studentService'
import { PERMISSIONS } from '@/constants/permissions'
import { usePermission } from '@/utils/permissions'

/* ────────────────────────────────────────────────────────────────────────
 * Status presentation — one place so the tab, the modal and the notice
 * history all read the same way.
 * ──────────────────────────────────────────────────────────────────────── */
const STATUS_META: Record<DocumentRequirementStatus, {
  label: string
  Icon: typeof ShieldCheck
  chip: string
  bar: string
  row: string
}> = {
  verified: {
    label: 'Verified',
    Icon: ShieldCheck,
    chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    bar:  'bg-emerald-500',
    row:  'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-900/10',
  },
  pending: {
    label: 'Awaiting verification',
    Icon: Clock,
    chip: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    bar:  'bg-amber-400',
    row:  'border-amber-200 dark:border-amber-800/60 bg-amber-50/40 dark:bg-amber-900/10',
  },
  rejected: {
    label: 'Rejected — re-upload',
    Icon: ShieldX,
    chip: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    bar:  'bg-rose-500',
    row:  'border-rose-200 dark:border-rose-800/60 bg-rose-50/50 dark:bg-rose-900/10',
  },
  missing: {
    label: 'Not uploaded',
    Icon: XCircle,
    chip: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
    bar:  'bg-red-500',
    row:  'border-red-200 dark:border-red-800/60 bg-red-50/60 dark:bg-red-900/10',
  },
}

export function StatusChip({ status }: { status: DocumentRequirementStatus }) {
  const m = STATUS_META[status]
  return (
    <span className={`inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${m.chip}`}>
      <m.Icon className="w-3 h-3" />
      {m.label}
    </span>
  )
}

/* ────────────────────────────────────────────────────────────────────────
 * Summary banner — the one-glance answer: complete, or N outstanding.
 * ──────────────────────────────────────────────────────────────────────── */
export function ComplianceSummary({
  checklist,
  onOpenChecklist,
  onNotify,
  selfMode,
}: {
  checklist: DocumentChecklist
  onOpenChecklist?: () => void
  onNotify?: () => void
  selfMode?: boolean
}) {
  const canConfigure = usePermission(PERMISSIONS.MANAGE_ADMISSION_REQUIREMENTS)
  const s = checklist.summary
  const outstanding = checklist.outstanding.length

  if (!checklist.configured) {
    return (
      <div className="card p-4 border-l-4 border-ink-300 dark:border-ink-600 flex items-start gap-3">
        <Settings2 className="w-5 h-5 text-ink-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-ink-900 dark:text-white">
            No required-documents checklist for {checklist.programme_category_label} students
          </h3>
          <p className="text-xs text-ink-500 mt-0.5">
            {selfMode
              ? 'The registry has not published a list of required documents for your programme yet.'
              : 'Nothing can be reported as missing until the checklist is configured.'}
          </p>
        </div>
        {!selfMode && canConfigure && (
          <Link to="/admin/admissions/student-documents" className="btn-secondary btn-sm whitespace-nowrap">
            Configure
          </Link>
        )}
      </div>
    )
  }

  const complete = checklist.is_complete
  const tone = complete
    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/15'
    : outstanding > 0
      ? 'border-red-500 bg-red-50 dark:bg-red-900/10'
      : 'border-amber-500 bg-amber-50 dark:bg-amber-900/10'
  const Icon = complete ? CheckCircle2 : outstanding > 0 ? AlertCircle : Clock
  const iconTone = complete ? 'text-emerald-600' : outstanding > 0 ? 'text-red-600' : 'text-amber-600'

  const title = complete
    ? 'All required documents verified'
    : outstanding > 0
      ? `${outstanding} required document${outstanding === 1 ? '' : 's'} outstanding`
      : `${s.pending} document${s.pending === 1 ? '' : 's'} awaiting verification`

  const segments = (['verified', 'pending', 'rejected', 'missing'] as const)
    .map((k) => ({ k, n: s[k] }))
    .filter((x) => x.n > 0)

  return (
    <div className={`card p-4 border-l-4 ${tone}`}>
      <div className="flex items-start gap-3 flex-wrap">
        <Icon className={`w-6 h-6 shrink-0 mt-0.5 ${iconTone}`} />
        <div className="flex-1 min-w-[200px]">
          <h3 className="text-sm font-semibold text-ink-900 dark:text-white">{title}</h3>
          <p className="text-xs text-ink-600 dark:text-ink-300 mt-0.5">
            {checklist.programme_category_label} checklist · {s.verified}/{s.required_total} verified
            {s.pending > 0 && ` · ${s.pending} pending`}
            {s.rejected > 0 && ` · ${s.rejected} rejected`}
            {s.missing > 0 && ` · ${s.missing} not uploaded`}
          </p>
          {/* Stacked progress bar */}
          {s.required_total > 0 && (
            <div className="h-2 rounded-full bg-ink-200/70 dark:bg-ink-700 overflow-hidden flex mt-2.5 max-w-md">
              {segments.map(({ k, n }) => (
                <div
                  key={k}
                  className={`${STATUS_META[k].bar} h-full`}
                  style={{ width: `${(n / s.required_total) * 100}%` }}
                  title={`${STATUS_META[k].label}: ${n}`}
                />
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onOpenChecklist && (
            <button type="button" onClick={onOpenChecklist} className="btn-secondary btn-sm">
              <Eye className="w-3.5 h-3.5" /> Checklist
            </button>
          )}
          {!selfMode && onNotify && outstanding > 0 && (
            <button type="button" onClick={onNotify} className="btn-primary btn-sm">
              <Bell className="w-3.5 h-3.5" /> Notify student
            </button>
          )}
        </div>
      </div>
      {!selfMode && checklist.last_notice && outstanding > 0 && (
        <p className="text-[11.5px] text-ink-500 mt-2 flex items-center gap-1.5">
          <History className="w-3 h-3" />
          Last notified {formatWhen(checklist.last_notice.created_at)}
          {checklist.last_notice.sent_by_name && ` by ${checklist.last_notice.sent_by_name}`}
          {' · '}
          {deliveryLabel(checklist.last_notice)}
        </p>
      )}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────
 * Requirement list — every configured document with its detected status.
 * ──────────────────────────────────────────────────────────────────────── */
export function RequirementList({
  checklist,
  studentId,
  selfMode,
  compact,
}: {
  checklist: DocumentChecklist
  studentId?: number
  selfMode?: boolean
  compact?: boolean
}) {
  if (!checklist.configured) return null

  const viewUrl = (item: DocumentRequirementItem) => {
    if (!item.document_id) return null
    return selfMode || !studentId
      ? studentService.meDocumentDownloadUrl(item.document_id)
      : studentService.documentDownloadUrl(studentId, item.document_id)
  }

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      {checklist.requirements.map((item) => {
        const m = STATUS_META[item.status]
        const url = viewUrl(item)
        const effectiveRow = !item.is_required && item.status === 'missing'
          ? 'border-ink-200 dark:border-ink-700 bg-ink-50/40 dark:bg-ink-800/30'
          : m.row
        return (
          <div key={item.requirement_id} className={`rounded-lg border p-3 flex items-start gap-3 ${effectiveRow}`}>
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${m.chip}`}>
              <m.Icon className="w-3.5 h-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-[13px] font-semibold text-ink-900 dark:text-white">{item.name}</h4>
                {!item.is_required && (
                  <span className="text-[10.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-ink-100 text-ink-500 dark:bg-ink-700 dark:text-ink-300">
                    Optional
                  </span>
                )}
                <StatusChip status={item.status} />
              </div>
              {item.status === 'missing' ? (
                <p className="text-[12px] text-ink-500 mt-0.5">
                  {item.notes || item.description || (selfMode ? 'Please upload this document.' : 'Not uploaded yet.')}
                </p>
              ) : (
                <p className="text-[12px] text-ink-500 truncate mt-0.5">
                  {item.file_original_name ?? 'Uploaded'}
                  {item.uploaded_at && <span className="text-ink-400"> · uploaded {new Date(item.uploaded_at).toLocaleDateString()}</span>}
                  {item.status === 'verified' && item.verifier_name && (
                    <span className="text-ink-400"> · verified by {item.verifier_name}</span>
                  )}
                </p>
              )}
              {item.status === 'rejected' && item.verification_comment && (
                <p className="text-[11.5px] mt-1 italic text-rose-600 dark:text-rose-300">{item.verification_comment}</p>
              )}
              {item.status !== 'missing' && item.notes && (
                <p className="text-[11.5px] text-ink-400 mt-0.5">{item.notes}</p>
              )}
            </div>
            {url && (
              <a href={url} target="_blank" rel="noreferrer" className="btn-secondary btn-sm shrink-0" title="Open file">
                <Eye className="w-3.5 h-3.5" />
                {!compact && <span className="hidden sm:inline">View</span>}
              </a>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────
 * Notify panel — staff picks which outstanding documents to list, adds an
 * optional note, and sends. Reports exactly which channels delivered.
 * ──────────────────────────────────────────────────────────────────────── */
export function NotifyStudentPanel({
  studentId,
  checklist,
  contact,
  defaultOpen = false,
  onSent,
}: {
  studentId: number
  checklist: DocumentChecklist
  contact?: { email: string | null; has_portal_account: boolean }
  defaultOpen?: boolean
  onSent?: (r: NotifyMissingDocumentsResult) => void
}) {
  const qc = useQueryClient()
  const outstanding = checklist.outstanding
  const [open, setOpen] = useState(defaultOpen)
  const [message, setMessage] = useState('')
  const [selected, setSelected] = useState<number[]>(() => outstanding.map((d) => d.document_type_id))
  const [result, setResult] = useState<NotifyMissingDocumentsResult | null>(null)

  useEffect(() => { if (defaultOpen) setOpen(true) }, [defaultOpen])

  // Keep the selection in step with the server: a document that got uploaded
  // since must drop out, a newly rejected one should be offered.
  const outstandingKey = outstanding.map((d) => d.document_type_id).join(',')
  // Keyed on the joined ids rather than the array so a refetch returning an
  // equal list does not reset the selection. `outstanding` is deliberately not
  // a dependency; the disable directive that used to say so is gone because
  // the rule does not fire here and ESLint errors on unused directives.
  useEffect(() => {
    setSelected(outstanding.map((d) => d.document_type_id))
  }, [outstandingKey])

  const hasEmail  = !!contact?.email
  const hasPortal = !!contact?.has_portal_account
  const noChannel = contact !== undefined && !hasEmail && !hasPortal

  const send = useMutation({
    mutationFn: () =>
      studentService.notifyMissingDocuments(studentId, {
        message: message.trim() || undefined,
        document_type_ids: selected,
      }),
    onSuccess: (res) => {
      const r = res.data
      if (!r) return
      setResult(r)
      setMessage('')
      const delivered = r.in_app || r.email.sent
      ;(delivered ? toast.success : toast.error)(res.message ?? (delivered ? 'Student notified.' : 'Notice could not be delivered.'))
      qc.invalidateQueries({ queryKey: ['student-documents', studentId] })
      qc.invalidateQueries({ queryKey: ['student-missing-doc-notices', studentId] })
      onSent?.(r)
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to send the notice.'),
  })

  if (outstanding.length === 0) return null

  const toggle = (id: number) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  return (
    <div className="card border-l-4 border-amber-500 bg-amber-50/70 dark:bg-amber-900/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-amber-200/70 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
            <Bell className="w-[18px] h-[18px] text-amber-700 dark:text-amber-300" />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">Notify student</h4>
            <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-0.5">
              Sends a portal notification and an email listing the {outstanding.length} outstanding document{outstanding.length === 1 ? '' : 's'}.
            </p>
            {contact && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[11.5px]">
                <span className={`inline-flex items-center gap-1 ${hasPortal ? 'text-emerald-700 dark:text-emerald-300' : 'text-ink-500'}`}>
                  <Smartphone className="w-3 h-3" /> {hasPortal ? 'Portal account' : 'No portal account'}
                </span>
                <span className={`inline-flex items-center gap-1 ${hasEmail ? 'text-emerald-700 dark:text-emerald-300' : 'text-ink-500'}`}>
                  <Mail className="w-3 h-3" /> {hasEmail ? contact.email : 'No email on file'}
                </span>
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-xs font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 whitespace-nowrap px-2 py-1 rounded transition inline-flex items-center gap-1"
        >
          {open ? <><ChevronUp className="w-3.5 h-3.5" /> Hide</> : <><ChevronDown className="w-3.5 h-3.5" /> Compose</>}
        </button>
      </div>

      {noChannel && (
        <p className="mt-3 text-[12px] text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" />
          This student has neither a portal account nor an email address — the notice will only be recorded on file.
        </p>
      )}

      {open && (
        <div className="mt-3 space-y-3">
          <div>
            <p className="text-[11.5px] font-semibold uppercase tracking-wider text-amber-900/70 dark:text-amber-200/70 mb-1.5">
              Documents to list
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {outstanding.map((d) => (
                <label
                  key={d.document_type_id}
                  className="flex items-start gap-2 p-2 rounded-lg bg-white/70 dark:bg-ink-900/40 border border-amber-200/70 dark:border-amber-800/40 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    className="w-4 h-4 mt-0.5 rounded"
                    checked={selected.includes(d.document_type_id)}
                    onChange={() => toggle(d.document_type_id)}
                  />
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-medium text-ink-900 dark:text-white">{d.name}</span>
                    <span className="block text-[11px] text-ink-500">
                      {d.status === 'rejected' ? `Rejected${d.verification_comment ? `: ${d.verification_comment}` : ''}` : 'Not uploaded'}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11.5px] font-semibold uppercase tracking-wider text-amber-900/70 dark:text-amber-200/70 mb-1.5">
              Message <span className="normal-case tracking-normal font-normal">(optional — the document list is always included)</span>
            </p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
              placeholder="e.g. Please submit these before registration closes on 30 September. Scans or clear photos are fine."
              className="input w-full text-sm min-h-20 resize-y"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => send.mutate()}
              disabled={send.isPending || selected.length === 0}
              className="btn-primary btn-sm"
            >
              {send.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {send.isPending ? 'Sending…' : `Send notice (${selected.length})`}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary btn-sm">Cancel</button>
          </div>
        </div>
      )}

      {result && (
        <div className="mt-3 rounded-lg border border-ink-200 dark:border-ink-700 bg-white/80 dark:bg-ink-900/50 p-3 text-[12px] space-y-1">
          <p className="font-semibold text-ink-800 dark:text-ink-100">Delivery</p>
          <DeliveryLine ok={result.in_app} label="Portal notification" detail={result.in_app ? 'delivered' : result.has_portal_account ? 'failed' : 'student has no portal account'} />
          <DeliveryLine ok={result.email.sent} label="Email" detail={result.email.sent ? `sent to ${result.email.to}` : (result.email.error ?? 'not sent')} />
        </div>
      )}
    </div>
  )
}

function DeliveryLine({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <p className={`flex items-center gap-1.5 ${ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300'}`}>
      {ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
      <span className="font-medium">{label}:</span> {detail}
    </p>
  )
}

/* ────────────────────────────────────────────────────────────────────────
 * Notice history — what was sent, when, by whom, and whether it landed.
 * ──────────────────────────────────────────────────────────────────────── */
export function NoticeHistory({ studentId }: { studentId: number }) {
  const [open, setOpen] = useState(false)
  const q = useQuery({
    queryKey: ['student-missing-doc-notices', studentId],
    queryFn: () => studentService.missingDocumentNotices(studentId),
    enabled: open,
  })
  const notices = q.data?.data?.notices ?? []

  return (
    <div className="card p-0 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left text-[13px] font-semibold text-ink-700 dark:text-ink-200 hover:bg-ink-50 dark:hover:bg-ink-800/50"
      >
        <History className="w-4 h-4 text-ink-400" />
        Notices sent to this student
        <span className="flex-1" />
        {open ? <ChevronUp className="w-4 h-4 text-ink-400" /> : <ChevronDown className="w-4 h-4 text-ink-400" />}
      </button>
      {open && (
        <div className="border-t border-ink-100 dark:border-ink-800">
          {q.isLoading ? (
            <p className="p-4 text-center text-[12px] text-ink-500">Loading…</p>
          ) : notices.length === 0 ? (
            <p className="p-4 text-center text-[12px] text-ink-500">No notices have been sent yet.</p>
          ) : (
            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
              {notices.map((n) => <NoticeRow key={n.id} n={n} />)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function NoticeRow({ n }: { n: MissingDocumentNotice }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <li className="px-4 py-3 text-[12.5px]">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <p className="font-medium text-ink-900 dark:text-white">
            {n.document_types.map((d) => d.name).join(', ') || 'Notice'}
          </p>
          <p className="text-[11.5px] text-ink-500 mt-0.5">
            {formatWhen(n.created_at)}{n.sent_by_name && ` · ${n.sent_by_name}`} · {deliveryLabel(n)}
          </p>
        </div>
        <button type="button" onClick={() => setExpanded((e) => !e)} className="text-[11.5px] font-semibold text-brand hover:underline">
          {expanded ? 'Hide message' : 'Show message'}
        </button>
      </div>
      {expanded && (
        <pre className="mt-2 whitespace-pre-wrap font-sans text-[12px] text-ink-700 dark:text-ink-200 bg-ink-50 dark:bg-ink-900/60 rounded-lg p-3">
          {n.message}
        </pre>
      )}
    </li>
  )
}

function deliveryLabel(n: MissingDocumentNotice): string {
  const parts: string[] = []
  parts.push(n.in_app_sent ? 'portal ✓' : 'portal ✗')
  parts.push(n.email_sent ? `email ✓ ${n.email_to ?? ''}`.trim() : `email ✗${n.email_error ? ` (${n.email_error})` : ''}`)
  return parts.join(' · ')
}

function formatWhen(iso: string): string {
  const d = new Date(iso.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

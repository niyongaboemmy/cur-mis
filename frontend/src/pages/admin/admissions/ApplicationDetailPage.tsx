import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import toast from 'react-hot-toast'
import {
  ArrowLeft, ArrowRight, User, Mail, Phone, CalendarDays, MapPin, GraduationCap,
  Building2, FileText, Loader2, CheckCircle2, XCircle, Clock, MessageSquarePlus,
  ExternalLink, ChevronRight,
} from 'lucide-react'
import { applicationAdminService, verificationService } from '@/services/admissionService'
import type { ApplicationStatus } from '@/types/admission'

const STATUS_OPTIONS: ApplicationStatus[] = [
  'submitted', 'documents_under_review', 'documents_verified', 'documents_rejected',
  'merit_listed', 'offered', 'offer_accepted', 'offer_declined', 'enrolled', 'withdrawn',
]

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const appId   = Number(id)
  const qc      = useQueryClient()
  const navigate = useNavigate()

  const [noteInput,       setNoteInput]       = useState('')
  // Per-document rejection state: which doc id is open for rejection input
  const [rejectingDocId,  setRejectingDocId]  = useState<number | null>(null)
  const [rejectNotes,     setRejectNotes]     = useState('')

  const appQ = useQuery({
    queryKey: ['admin', 'applications', appId],
    queryFn:  () => applicationAdminService.show(appId),
    enabled:  !!appId,
  })

  // Fetch the pending verifications queue so we can navigate applicant-by-applicant
  const queueQ = useQuery({
    queryKey: ['admin', 'verifications'],
    queryFn:  () => verificationService.getPendingApplications(),
  })
  const queue    = queueQ.data?.data?.data ?? []
  const queueIdx = queue.findIndex((a: any) => a.id === appId)
  const prevApp  = queueIdx > 0               ? queue[queueIdx - 1] : null
  const nextApp  = queueIdx < queue.length - 1 ? queue[queueIdx + 1] : null

  const updateStatus = useMutation({
    mutationFn: (s: ApplicationStatus) => applicationAdminService.updateStatus(appId, { status: s }),
    onSuccess:  () => { toast.success('Status updated'); qc.invalidateQueries({ queryKey: ['admin', 'applications'] }) },
    onError:    (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  })

  const addNote = useMutation({
    mutationFn: (n: string) => applicationAdminService.addNote(appId, { notes: n }),
    onSuccess:  () => {
      toast.success('Note added'); setNoteInput('')
      qc.invalidateQueries({ queryKey: ['admin', 'applications', appId] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  })

  const verify = useMutation({
    mutationFn: (d: { documentId: number; status: 'verified' | 'rejected'; rejection_notes?: string }) =>
      verificationService.verifyDocument(appId, d.documentId, {
        verification_status: d.status,
        rejection_notes:     d.rejection_notes,
      }),
    onSuccess: () => {
      toast.success('Document updated')
      setRejectingDocId(null)
      setRejectNotes('')
      qc.invalidateQueries({ queryKey: ['admin', 'applications', appId] })
      qc.invalidateQueries({ queryKey: ['admin', 'verifications'] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  })

  const handleApprove = (docId: number) => {
    verify.mutate({ documentId: docId, status: 'verified' })
  }

  const handleOpenReject = (docId: number) => {
    setRejectingDocId(docId)
    setRejectNotes('')
  }

  const handleSubmitReject = () => {
    if (!rejectNotes.trim()) {
      toast.error('Please provide rejection notes for the applicant.')
      return
    }
    verify.mutate({ documentId: rejectingDocId!, status: 'rejected', rejection_notes: rejectNotes.trim() })
  }

  if (appQ.isLoading) return (
    <p className="text-ink-500 text-[13px] flex items-center gap-2 p-4">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading…
    </p>
  )
  if (!appQ.data?.data) return <p className="text-ink-500 text-[13px] p-4">Application not found.</p>

  const app       = appQ.data.data
  const docs      = app.documents  ?? []
  const statusLog = app.status_log ?? []

  const pendingDocs   = docs.filter((d: any) => d.verification_status === 'pending').length
  const verifiedDocs  = docs.filter((d: any) => d.verification_status === 'verified').length
  const rejectedDocs  = docs.filter((d: any) => d.verification_status === 'rejected').length

  return (
    <div className="space-y-4">
      {/* Breadcrumb + queue navigation */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Link to="/admin/admissions/verifications" className="inline-flex items-center gap-1 text-[12.5px] text-ink-500 hover:text-brand">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to queue
        </Link>

        {queue.length > 0 && (
          <div className="flex items-center gap-2 text-[12.5px] text-ink-500">
            <span className="text-ink-400">
              {queueIdx >= 0 ? `${queueIdx + 1} of ${queue.length} pending` : `${queue.length} pending`}
            </span>
            <button
              className="btn-secondary btn-sm"
              disabled={!prevApp}
              onClick={() => prevApp && navigate(`/admin/admissions/applications/${prevApp.id}`)}
            >
              <ArrowLeft className="w-3 h-3" /> Prev
            </button>
            <button
              className="btn-primary btn-sm"
              disabled={!nextApp}
              onClick={() => nextApp && navigate(`/admin/admissions/applications/${nextApp.id}`)}
            >
              Next <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Header */}
      <section className="card p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[11px] uppercase tracking-wider font-semibold text-ink-400">Application</p>
            <p className="text-[22px] font-semibold text-ink-900 dark:text-white font-mono">{app.application_number}</p>
            <p className="text-[13px] text-ink-600 mt-1">{app.first_name} {app.last_name}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="chip-primary">{app.status}</span>
            <select
              className="input w-52"
              value={app.status}
              onChange={(e) => updateStatus.mutate(e.target.value as ApplicationStatus)}
              disabled={updateStatus.isPending}
            >
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <div className="space-y-1.5 text-[13px]">
            <Row icon={User}         k="Gender"      v={app.gender} />
            <Row icon={CalendarDays} k="Birthdate"   v={app.birthdate} />
            <Row icon={Mail}         k="Email"        v={app.email} />
            <Row icon={Phone}        k="Phone"        v={app.phone} />
            <Row icon={MapPin}       k="Nationality"  v={app.nationality} />
            <Row icon={MapPin}       k="Address"      v={app.address || '—'} />
          </div>
          <div className="space-y-1.5 text-[13px]">
            <Row icon={Building2}     k="Faculty"       v={app.faculty_name    ?? `#${app.faculty_id}`} />
            <Row icon={GraduationCap} k="Department"    v={app.department_name ?? `#${app.department_id}`} />
            <Row icon={GraduationCap} k="Intake"        v={app.intake} />
            <Row icon={GraduationCap} k="Prev. school"  v={app.prev_school} />
            <Row icon={GraduationCap} k="Qualification" v={`${app.prev_qualification} · grade ${app.prev_grade}`} />
            <Row icon={GraduationCap} k="Sponsorship"   v={`${app.sponsorship}${app.sponsor_name ? ' — ' + app.sponsor_name : ''}`} />
          </div>
        </div>
      </section>

      {/* Documents + verification */}
      <section className="card p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="section-title">Documents</h3>
          {docs.length > 0 && (
            <div className="flex items-center gap-2 text-[12px]">
              {verifiedDocs > 0 && <span className="chip-success">{verifiedDocs} verified</span>}
              {rejectedDocs > 0 && <span className="chip-danger">{rejectedDocs} rejected</span>}
              {pendingDocs  > 0 && <span className="chip-warning">{pendingDocs} pending</span>}
            </div>
          )}
        </div>

        {docs.length === 0 ? (
          <p className="text-[13px] text-ink-500">No documents uploaded yet.</p>
        ) : (
          <ul className="space-y-3">
            {docs.map((d: any) => (
              <li key={d.id} className="rounded-lg border border-ink-100 dark:border-ink-700 bg-ink-50 dark:bg-ink-800/50 overflow-hidden">
                {/* Document row */}
                <div className="flex items-center justify-between gap-3 flex-wrap p-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileText className="w-4 h-4 text-ink-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-ink-800 dark:text-ink-100">
                        {d.document_type_name ?? `Type #${d.document_type_id}`}
                      </p>
                      <p className="text-[11.5px] text-ink-500 truncate">
                        {d.file_original_name}{d.file_size ? ` · ${Math.ceil(d.file_size / 1024)} KB` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <VerifChip s={d.verification_status} />
                    <a
                      href={verificationService.downloadUrl(app.id, d.id)}
                      target="_blank" rel="noreferrer"
                      className="btn-secondary btn-sm"
                    >
                      <ExternalLink className="w-3 h-3" /> Open
                    </a>
                    <button
                      className="btn-primary btn-sm"
                      onClick={() => handleApprove(d.id)}
                      disabled={verify.isPending || d.verification_status === 'verified'}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      {d.verification_status === 'verified' ? 'Approved' : 'Approve'}
                    </button>
                    <button
                      className="btn-secondary btn-sm text-red-600 hover:bg-red-50"
                      onClick={() => rejectingDocId === d.id ? setRejectingDocId(null) : handleOpenReject(d.id)}
                      disabled={verify.isPending}
                    >
                      <XCircle className="w-3 h-3" />
                      {rejectingDocId === d.id ? 'Cancel' : 'Reject'}
                    </button>
                  </div>
                </div>

                {/* Existing rejection note */}
                {d.rejection_notes && rejectingDocId !== d.id && (
                  <div className="px-3 pb-3">
                    <p className="text-[12px] text-red-700 bg-red-50 dark:bg-red-900/20 rounded-md p-2 border border-red-100 dark:border-red-800">
                      <span className="font-medium">Rejection note:</span> {d.rejection_notes}
                    </p>
                  </div>
                )}

                {/* Inline rejection form — shown only for the doc being rejected */}
                {rejectingDocId === d.id && (
                  <div className="px-3 pb-3 border-t border-red-100 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10 pt-3 space-y-2">
                    <p className="text-[12px] font-medium text-red-700 dark:text-red-400">
                      Rejection reason <span className="text-red-500">*</span>
                      <span className="font-normal text-ink-500 ml-1">(shown to the applicant)</span>
                    </p>
                    <textarea
                      className="input min-h-[72px] text-[13px] border-red-200 focus:border-red-400 focus:ring-red-100"
                      placeholder="Explain why this document is rejected so the applicant can re-upload correctly…"
                      value={rejectNotes}
                      onChange={(e) => setRejectNotes(e.target.value)}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => setRejectingDocId(null)}
                      >
                        Cancel
                      </button>
                      <button
                        className="btn-sm bg-red-600 text-white hover:bg-red-700 focus:ring-red-300"
                        disabled={verify.isPending || !rejectNotes.trim()}
                        onClick={handleSubmitReject}
                      >
                        {verify.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                        Confirm rejection
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Quick-navigate to next applicant after finishing all docs */}
        {docs.length > 0 && pendingDocs === 0 && nextApp && (
          <div className="mt-4 pt-4 border-t border-ink-100 dark:border-ink-700 flex items-center justify-between">
            <p className="text-[13px] text-ink-500">All documents reviewed. Ready for the next applicant?</p>
            <button
              className="btn-primary btn-sm"
              onClick={() => navigate(`/admin/admissions/applications/${nextApp.id}`)}
            >
              Next applicant <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </section>

      {/* Internal notes + status log */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-6">
          <h3 className="section-title mb-3 flex items-center gap-2">
            <MessageSquarePlus className="w-4 h-4 text-brand" /> Internal note
          </h3>
          <textarea
            className="input min-h-[90px]"
            placeholder="Admin-only notes — never shown to the applicant."
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
          />
          <div className="mt-2 flex justify-end">
            <button
              className="btn-primary btn-sm"
              onClick={() => noteInput.trim() && addNote.mutate(noteInput.trim())}
              disabled={!noteInput.trim() || addNote.isPending}
            >
              {addNote.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
              Save note
            </button>
          </div>
          {app.internal_notes && (
            <div className="mt-4 rounded-md bg-ink-50 dark:bg-ink-700/30 p-3 text-[12.5px] whitespace-pre-wrap text-ink-800 dark:text-ink-200">
              {app.internal_notes}
            </div>
          )}
        </div>

        <div className="card p-6">
          <h3 className="section-title mb-3">Status history</h3>
          {statusLog.length === 0 ? (
            <p className="text-[13px] text-ink-500">No transitions yet.</p>
          ) : (
            <ol className="space-y-2">
              {statusLog.map((l: any) => (
                <li key={l.id} className="flex items-start gap-3 text-[12.5px]">
                  <Clock className="w-3.5 h-3.5 text-ink-400 mt-0.5 shrink-0" />
                  <div>
                    <p>
                      <span className="font-semibold text-ink-800 dark:text-ink-100">{l.to_status.replace(/_/g, ' ')}</span>
                      <span className="text-ink-400"> · {l.actor_type}</span>
                    </p>
                    {l.notes && <p className="text-ink-500 mt-0.5">{l.notes}</p>}
                    <p className="text-ink-400 text-[11px]">{l.created_at}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </div>
  )
}

function Row({ icon: Icon, k, v }: { icon: any; k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="w-3.5 h-3.5 text-ink-400 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <span className="text-ink-500">{k}: </span>
        <span className="text-ink-800 dark:text-ink-100 font-medium break-words">{v || '—'}</span>
      </div>
    </div>
  )
}

function VerifChip({ s }: { s: 'pending' | 'verified' | 'rejected' }) {
  if (s === 'verified') return <span className="chip-success"><CheckCircle2 className="w-3 h-3" /> Verified</span>
  if (s === 'rejected') return <span className="chip-danger"><XCircle className="w-3 h-3" /> Rejected</span>
  return <span className="chip-warning"><Clock className="w-3 h-3" /> Pending</span>
}

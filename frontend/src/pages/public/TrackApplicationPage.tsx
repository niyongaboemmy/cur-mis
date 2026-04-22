import { useState, useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  AlertTriangle,
  Loader2,
  ArrowRight,
} from 'lucide-react'
import toast from 'react-hot-toast'
import Logo from '@/components/brand/Logo'
import { portalService } from '@/services/admissionService'
import type { ApplicationStatus } from '@/types/admission'

const STATUS_META: Record<ApplicationStatus, { label: string; tone: string; icon: any }> = {
  draft:                  { label: 'Draft',                     tone: 'chip-soft',    icon: FileText },
  submitted:              { label: 'Submitted',                 tone: 'chip-primary', icon: CheckCircle2 },
  documents_under_review: { label: 'Documents under review',    tone: 'chip-warning', icon: Clock },
  documents_verified:     { label: 'Documents verified',        tone: 'chip-success', icon: CheckCircle2 },
  documents_rejected:     { label: 'Documents rejected',        tone: 'chip-danger',  icon: XCircle },
  merit_listed:           { label: 'On merit list',             tone: 'chip-primary', icon: CheckCircle2 },
  offered:                { label: 'Admission offered',         tone: 'chip-success', icon: CheckCircle2 },
  offer_accepted:         { label: 'Offer accepted',            tone: 'chip-success', icon: CheckCircle2 },
  offer_declined:         { label: 'Offer declined',            tone: 'chip-soft',    icon: XCircle },
  enrolled:               { label: 'Enrolled',                  tone: 'chip-success', icon: CheckCircle2 },
  withdrawn:              { label: 'Withdrawn',                 tone: 'chip-soft',    icon: XCircle },
}

export default function TrackApplicationPage() {
  const [params, setParams] = useSearchParams()
  const [appNo, setAppNo] = useState(params.get('no') ?? '')
  const [queriedNo, setQueriedNo] = useState(params.get('no') ?? '')

  useEffect(() => { if (params.get('no')) setQueriedNo(params.get('no')!) }, [params])

  const q = useQuery({
    queryKey: ['portal', 'track', queriedNo],
    queryFn:  () => portalService.trackApplication(queriedNo),
    enabled:  !!queriedNo,
  })

  const respond = useMutation({
    mutationFn: (d: { response: 'accept' | 'decline'; notes?: string }) =>
      portalService.respondToOffer(queriedNo, d),
    onSuccess: (r) => {
      if (r.success) { toast.success('Response recorded'); q.refetch() }
      else toast.error(r.message || 'Failed')
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  })

  const app = q.data?.data
  const status = app?.status as ApplicationStatus | undefined
  const meta = status ? STATUS_META[status] : null
  const hasOffer = status === 'offered'

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!appNo.trim()) return
    setParams({ no: appNo.trim() })
    setQueriedNo(appNo.trim())
  }

  return (
    <div className="min-h-screen bg-[rgb(var(--bg-app))]">
      <header className="bg-white border-b border-ink-100 py-4">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between">
          <Logo />
          <Link to="/apply" className="text-[13px] text-ink-600 hover:text-brand">Apply now →</Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10">
        <div className="text-center mb-6">
          <h1 className="text-[28px] font-semibold text-ink-900 tracking-tight">Track your application</h1>
          <p className="text-ink-500 text-[14px] mt-1">
            Enter the application number you received when you submitted.
          </p>
        </div>

        <form onSubmit={onSubmit} className="card p-4 flex gap-2 mb-4">
          <input
            value={appNo}
            onChange={(e) => setAppNo(e.target.value)}
            placeholder="e.g. APP-2026-00042"
            className="input flex-1 font-mono uppercase"
          />
          <button className="btn-primary shrink-0" type="submit">
            <Search className="w-3.5 h-3.5" /> Track
          </button>
        </form>

        {!queriedNo ? (
          <div className="card p-8 text-center text-ink-500 text-[13px]">
            Enter your application number above.
          </div>
        ) : q.isLoading ? (
          <div className="card p-8 text-center text-ink-500 text-[13px] flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : q.isError || !app ? (
          <div className="card p-6 border-amber-200 bg-amber-50">
            <div className="flex items-start gap-3 text-amber-800">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Application not found</p>
                <p className="text-[13px]">Double-check the number and try again.</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary */}
            <div className="card p-6">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-ink-400">Application number</p>
                  <p className="text-[20px] font-mono font-bold text-brand">{app.application_number}</p>
                  <p className="mt-1 text-[13px] text-ink-700">
                    {app.first_name} {app.last_name} · <span className="text-ink-500">{app.email}</span>
                  </p>
                </div>
                {meta && (
                  <span className={`${meta.tone}`}>
                    <meta.icon className="w-3 h-3" /> {meta.label}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5 text-[13px]">
                <Info k="Faculty" v={app.faculty_name ?? `#${app.faculty_id}`} />
                <Info k="Program" v={app.program_name ?? `#${app.program_id}`} />
                <Info k="Intake"  v={app.intake} />
                <Info k="Sponsorship" v={app.sponsorship} />
              </div>
            </div>

            {/* Offer actions */}
            {hasOffer && (
              <div className="card p-6 border-emerald-200 bg-emerald-50">
                <h3 className="text-[15px] font-semibold text-emerald-900">🎓 You've been offered admission!</h3>
                <p className="text-[13px] text-emerald-800 mt-1">
                  Please respond to your admission offer below.
                </p>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => respond.mutate({ response: 'accept' })}
                    disabled={respond.isPending}
                    className="btn-primary"
                  >
                    {respond.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Accept offer
                  </button>
                  <button
                    onClick={() => {
                      const notes = window.prompt('Optional reason for declining (you can leave blank):') ?? ''
                      respond.mutate({ response: 'decline', notes })
                    }}
                    disabled={respond.isPending}
                    className="btn-secondary"
                  >
                    Decline
                  </button>
                </div>
              </div>
            )}

            {/* Documents */}
            <div className="card p-6">
              <h3 className="section-title mb-3">Documents</h3>
              {(app.documents ?? []).length === 0 ? (
                <p className="text-[13px] text-ink-500">
                  No documents uploaded yet. Use the upload below to attach each required document.
                </p>
              ) : (
                <ul className="space-y-2">
                  {(app.documents ?? []).map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 rounded-md border border-ink-100 bg-ink-50 p-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FileText className="w-4 h-4 text-ink-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-ink-800 truncate">
                            {d.document_type_name ?? `Type #${d.document_type_id}`}
                          </p>
                          <p className="text-[11.5px] text-ink-500 truncate">{d.file_original_name}</p>
                        </div>
                      </div>
                      <VerifStatusChip s={d.verification_status} />
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[12px] text-ink-500 mt-4">
                To upload more documents, sign in to your applicant portal or use the secure
                upload link emailed when you submitted.
              </p>
            </div>

            {/* Rejection reason if present */}
            {app.rejection_reason && (
              <div className="card p-5 border-red-200 bg-red-50">
                <p className="font-semibold text-red-900 text-[14px] flex items-center gap-2">
                  <XCircle className="w-4 h-4" /> Rejection reason
                </p>
                <p className="text-[13px] text-red-800 mt-1">{app.rejection_reason}</p>
              </div>
            )}

            {/* Continue CTA */}
            {status === 'submitted' && (
              <div className="text-center">
                <p className="text-[13px] text-ink-500 mb-2">Next step — upload your required documents.</p>
                <Link to="/applicant" className="btn-primary inline-flex">
                  Go to applicant portal <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

function Info({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="rounded-md bg-ink-50 px-3 py-2 min-w-0">
      <p className="text-[10.5px] uppercase tracking-wider font-semibold text-ink-400">{k}</p>
      <p className="text-ink-900 font-medium truncate">{v || '—'}</p>
    </div>
  )
}

function VerifStatusChip({ s }: { s: 'pending' | 'verified' | 'rejected' }) {
  if (s === 'verified') return <span className="chip-success"><CheckCircle2 className="w-3 h-3" /> Verified</span>
  if (s === 'rejected') return <span className="chip-danger"><XCircle className="w-3 h-3" /> Rejected</span>
  return <span className="chip-warning"><Clock className="w-3 h-3" /> Pending</span>
}

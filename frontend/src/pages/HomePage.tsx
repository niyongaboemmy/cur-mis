import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  GraduationCap,
  ArrowRight,
  Upload,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
  FileText,
  AlertCircle,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import AdminDashboardPage from '@/pages/admin/AdminDashboardPage'
import { applicantService } from '@/services/admissionService'
import type { ApplicationStatus } from '@/types/admission'

const STATUS_CHIP: Record<ApplicationStatus, { label: string; cls: string; icon: any }> = {
  draft:                  { label: 'Draft',             cls: 'chip-soft',    icon: FileText     },
  submitted:              { label: 'Submitted',         cls: 'chip-primary', icon: CheckCircle2 },
  documents_under_review: { label: 'Docs under review', cls: 'chip-warning', icon: Clock        },
  documents_verified:     { label: 'Docs verified',     cls: 'chip-success', icon: CheckCircle2 },
  documents_rejected:     { label: 'Docs rejected',     cls: 'chip-danger',  icon: XCircle      },
  merit_listed:           { label: 'Merit listed',      cls: 'chip-primary', icon: CheckCircle2 },
  offered:                { label: 'Offer received',    cls: 'chip-success', icon: CheckCircle2 },
  offer_accepted:         { label: 'Offer accepted',    cls: 'chip-success', icon: CheckCircle2 },
  offer_declined:         { label: 'Offer declined',    cls: 'chip-soft',    icon: XCircle      },
  enrolled:               { label: 'Enrolled',          cls: 'chip-success', icon: CheckCircle2 },
  withdrawn:              { label: 'Withdrawn',         cls: 'chip-soft',    icon: XCircle      },
  requested_changes:      { label: 'Changes requested', cls: 'chip-warning', icon: AlertCircle    },
}

function ApplicantDashboard() {
  const { user } = useAuthStore()
  const firstName = user?.full_name?.split(' ')[0] ?? 'Applicant'

  const appsQ = useQuery({
    queryKey: ['applicant', 'applications'],
    queryFn: () => applicantService.listApplications(),
  })
  const apps = appsQ.data?.data ?? []
  const app    = apps[0]
  const status = app?.status as ApplicationStatus | undefined
  const chip   = status ? STATUS_CHIP[status] : null

  if (appsQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-brand" />
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-[900px] mx-auto">
      {/* welcome */}
      <section className="card p-6">
        <h2 className="text-[22px] font-semibold text-ink-900 dark:text-white tracking-tight">
          Welcome back, {firstName}
        </h2>
        <p className="text-[13px] text-ink-500 mt-1">
          {app ? 'Here is the current status of your application.' : 'You have not started an application yet.'}
        </p>
      </section>

      {app ? (
        <>
          {/* application status */}
          <section className="card p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-ink-400">Application number</p>
                <p className="text-[22px] font-mono font-bold text-brand mt-0.5">{app.application_number}</p>
                <p className="text-[13px] text-ink-500 mt-1">
                  {app.department_name ?? app.faculty_name} · {app.intake}
                </p>
              </div>
              {chip && (
                <span className={`${chip.cls} text-[13px]`}>
                  <chip.icon className="w-3.5 h-3.5" />
                  {chip.label}
                </span>
              )}
            </div>
          </section>

          {/* quick actions */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <QuickLink to={`/apply/track?no=${app.application_number}`} icon={Search}        label="Track application" sub="See full status & history" />
            <QuickLink to="/applicant/documents"                         icon={Upload}        label="Upload documents"  sub="Manage required files"   />
            <QuickLink to="/applicant"                                   icon={GraduationCap} label="My application"    sub="View and edit details"   />
          </section>
        </>
      ) : (
        <section className="card p-10 text-center space-y-4">
          <GraduationCap className="w-12 h-12 text-brand mx-auto opacity-40" />
          <div>
            <p className="text-[16px] font-semibold text-ink-900 dark:text-white">No application yet</p>
            <p className="text-[13px] text-ink-500 mt-1">Start your application to begin the admission process.</p>
          </div>
          <Link to="/apply" className="btn-primary inline-flex">
            Start application <ArrowRight className="w-4 h-4" />
          </Link>
        </section>
      )}
    </div>
  )
}

function QuickLink({ to, icon: Icon, label, sub }: { to: string; icon: any; label: string; sub: string }) {
  return (
    <Link
      to={to}
      className="card p-4 flex items-center gap-3 hover:border-brand/40 hover:bg-brand/5 transition-all group"
    >
      <span className="w-10 h-10 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0 group-hover:bg-brand group-hover:text-white transition-colors">
        <Icon className="w-4.5 h-4.5" />
      </span>
      <div className="min-w-0">
        <p className="text-[13.5px] font-semibold text-ink-900 dark:text-white">{label}</p>
        <p className="text-[11.5px] text-ink-500 truncate">{sub}</p>
      </div>
      <ArrowRight className="w-3.5 h-3.5 text-ink-300 ml-auto group-hover:text-brand transition-colors" />
    </Link>
  )
}

export default function HomePage() {
  const { user } = useAuthStore()

  if (user?.role === 'applicant' || user?.is_applicant) {
    return <ApplicantDashboard />
  }

  return <AdminDashboardPage />
}

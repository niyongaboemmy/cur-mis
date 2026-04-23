import { useQuery } from '@tanstack/react-query'
import { 
  FileText, Clock, CheckCircle2, XCircle, Info, 
  MapPin, Phone, Mail, User, GraduationCap, Building2, Calendar,
  ExternalLink
} from 'lucide-react'
import { applicantService } from '@/services/admissionService'
import { Card, SectionHeader, fmt } from '@/components/applicant/ApplicantPortalShared'
import type { StudentApplication } from '@/types/admission'

interface ApplicationDetailsViewProps {
  application: StudentApplication
  onEdit?: () => void
}

export default function ApplicationDetailsView({ application, onEdit }: ApplicationDetailsViewProps) {
  const detailsQ = useQuery({
    queryKey: ['applicant', 'application', application.id],
    queryFn: () => applicantService.getApplicationDetails(application.id),
  })

  const details = detailsQ.data?.data

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <Card>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center text-primary-600 shrink-0">
              <FileText className="w-8 h-8" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-widest font-bold text-ink-400">Application Reference</p>
              <h2 className="text-[24px] font-mono font-black text-primary-600 dark:text-primary-400 leading-tight">
                {application.application_number}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <StatusPill status={application.status} />
                <span className="text-[13px] text-ink-500 font-medium">Submitted on {new Date(application.submitted_at!).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
          {onEdit && ['draft', 'submitted'].includes(application.status) && (
            <button onClick={onEdit} className="btn-secondary btn-sm">
              <PencilIcon className="w-3.5 h-3.5" /> Edit Application
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
          <DetailTile icon={Building2} label="Faculty" value={application.faculty_name} />
          <DetailTile icon={GraduationCap} label="Department" value={application.department_name} />
          <DetailTile icon={Calendar} label="Intake" value={`${application.intake} (${application.academic_year_label})`} />
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-6">
          {/* Personal Info */}
          <Card>
            <SectionHeader title="Personal Details" sub="Verification of your identity and contact info." icon={User} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6">
              <InfoGroup label="Full Name" value={`${application.first_name} ${application.last_name}`} />
              <InfoGroup label="Email" value={application.email} icon={Mail} />
              <InfoGroup label="Phone" value={application.phone} icon={Phone} />
              <InfoGroup label="Gender" value={application.gender} />
              <InfoGroup label="Nationality" value={application.nationality} />
              <InfoGroup label="Address" value={application.address || 'Not provided'} icon={MapPin} />
            </div>
          </Card>

          {/* Academic Background */}
          <Card>
            <SectionHeader title="Academic Background" sub="Previous education history provided during application." icon={GraduationCap} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6">
              <InfoGroup label="Previous School" value={application.prev_school} />
              <InfoGroup label="Qualification" value={application.prev_qualification} />
              <InfoGroup label="Mean Grade" value={application.prev_grade} />
              <InfoGroup label="Graduation Year" value={String(application.graduation_year)} />
            </div>
          </Card>

          {/* Document Checklist */}
          <Card>
            <SectionHeader title="Required Documents" sub="Status of your attachments for this application." icon={FileText} />
            <div className="mt-6 space-y-3">
              {details?.document_checklist?.map((item: any) => (
                <div key={item.document_type_id} className="p-3 rounded-xl border border-ink-100 dark:border-ink-800 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${item.uploaded ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600' : 'bg-ink-50 dark:bg-ink-800 text-ink-400'}`}>
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-ink-900 dark:text-white truncate flex items-center gap-2">
                        {item.document_type_name}
                        {item.is_required && <span className="text-[10px] text-red-500 font-bold uppercase tracking-widest">Required</span>}
                      </p>
                      {item.uploaded ? (
                        <p className="text-[11px] text-ink-500 truncate">{item.file_original_name}</p>
                      ) : (
                        <p className="text-[11px] text-amber-600 font-medium italic">Not uploaded yet</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {item.uploaded && (
                      <div className="flex items-center gap-2">
                         <StatusPillSmall status={item.verification_status} />
                         <a 
                          href={applicantService.downloadUrl(item.document_id)}
                          target="_blank"
                          className="p-1.5 rounded-lg hover:bg-ink-100 dark:hover:bg-ink-700 text-ink-500 transition-colors"
                         >
                           <ExternalLink className="w-3.5 h-3.5" />
                         </a>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {(!details?.document_checklist || details.document_checklist.length === 0) && (
                <p className="text-[12px] text-ink-400 text-center py-4">No documents required for this program.</p>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Status Timeline */}
          <Card>
            <SectionHeader title="Status History" sub="Progress tracking." />
            <div className="mt-6 space-y-4">
              {details?.status_log && details.status_log.length > 0 ? (
                <div className="relative pl-4 space-y-6 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:bg-ink-100 dark:before:bg-ink-800">
                  {details.status_log.map((log: any, idx: number) => (
                    <div key={idx} className="relative">
                      <div className="absolute -left-[19px] top-1.5 w-2.5 h-2.5 rounded-full bg-primary-500 ring-4 ring-white dark:ring-ink-900" />
                      <p className="text-[12.5px] font-bold text-ink-900 dark:text-white capitalize">
                        {log.to_status.replace(/_/g, ' ')}
                      </p>
                      <p className="text-[11px] text-ink-400 mt-0.5">{fmt(log.created_at)}</p>
                      {log.notes && <p className="text-[12px] text-ink-500 mt-1 italic">"{log.notes}"</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-ink-400 text-center py-4">No history available.</p>
              )}
            </div>
          </Card>

          {/* Financing */}
          <Card>
            <SectionHeader title="Financing" />
            <div className="mt-4 p-4 rounded-xl bg-ink-50 dark:bg-ink-800/40 border border-ink-100 dark:border-ink-700">
              <p className="text-[11px] uppercase tracking-wider text-ink-400 font-bold">Funding Source</p>
              <p className="text-[15px] font-bold text-ink-900 dark:text-white capitalize mt-0.5">{application.sponsorship}</p>
              {application.sponsor_name && (
                <p className="text-[13px] text-ink-600 dark:text-ink-300 mt-1">{application.sponsor_name}</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

function StatusPillSmall({ status }: { status: string }) {
  const configs = {
    verified: { class: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20', label: 'Verified' },
    rejected: { class: 'text-red-600 bg-red-50 dark:bg-red-900/20', label: 'Rejected' },
    pending:  { class: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20', label: 'Pending' }
  }
  const cfg = (configs as any)[status] || configs.pending
  return (
    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-tight ${cfg.class}`}>
      {cfg.label}
    </span>
  )
}

function StatusPill({ status }: { status: string }) {
  const isDraft = status === 'draft'
  const isOffer = status.includes('offer')
  return (
    <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-tight ${isDraft ? 'bg-ink-100 text-ink-500' : isOffer ? 'bg-emerald-100 text-emerald-700' : 'bg-primary-100 text-primary-700'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function DetailTile({ icon: Icon, label, value }: { icon: any, label: string, value: string }) {
  return (
    <div className="p-4 rounded-2xl bg-ink-50/50 dark:bg-ink-800/30 border border-ink-100 dark:border-ink-700/50 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-white dark:bg-ink-800 flex items-center justify-center text-primary-500 shadow-sm">
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-ink-400 font-bold">{label}</p>
        <p className="text-[13.5px] font-bold text-ink-800 dark:text-ink-100 truncate">{value}</p>
      </div>
    </div>
  )
}

function InfoGroup({ label, value, icon: Icon }: { label: string, value: string, icon?: any }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wider text-ink-400 font-bold mb-1">{label}</p>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-3.5 h-3.5 text-ink-300" />}
        <p className="text-[14px] text-ink-900 dark:text-white font-medium truncate">{value}</p>
      </div>
    </div>
  )
}

function PencilIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
  )
}

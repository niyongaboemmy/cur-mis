import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Mail,
  Phone,
  Calendar,
  BadgeCheck,
  Briefcase,
  Building2,
  User as UserIcon,
  Clock,
  ClipboardCheck,
  FileText,
  Loader2,
  Sparkles,
} from 'lucide-react'
import { hrService } from '@/services/hrService'
import type { HrEmployee } from '@/types/academic'

type Tab = 'overview' | 'attendance' | 'documents'

export default function StaffDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [tab, setTab] = useState<Tab>('overview')

  const empQ = useQuery({
    queryKey: ['hr-employee', id],
    queryFn:  () => hrService.showEmployee(id!),
    enabled:  !!id,
  })

  const employee: HrEmployee | undefined = empQ.data?.data ?? undefined

  if (empQ.isLoading) {
    return (
      <div className="max-w-[1200px] mx-auto">
        <div className="card p-10 flex items-center justify-center gap-2 text-ink-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading staff details…
        </div>
      </div>
    )
  }

  if (empQ.isError || !employee) {
    return (
      <div className="max-w-[1200px] mx-auto space-y-4">
        <Link to="/hr/staff" className="btn-secondary btn-sm w-fit">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to staff
        </Link>
        <div className="card p-10 text-center text-ink-500">Staff member not found.</div>
      </div>
    )
  }

  const initials = employee.full_name?.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase() || 'E'
  const isActive = (employee.status || '').toLowerCase() === 'active'

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <Link to="/hr/staff" className="inline-flex items-center gap-1 text-[13px] text-ink-500 hover:text-brand transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to staff directory
      </Link>

      {/* Profile header card */}
      <section className="card p-6">
        <div className="flex flex-col md:flex-row gap-5 md:items-center">
          <div className="h-20 w-20 rounded-xl bg-brand/10 text-brand dark:bg-brand/25 dark:text-gold-400 flex items-center justify-center font-semibold text-2xl shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[20px] font-semibold text-ink-900 dark:text-white truncate">
                {employee.full_name}
              </h1>
              {isActive
                ? <span className="chip-success"><BadgeCheck className="w-3 h-3" /> Active</span>
                : <span className="chip-soft">{employee.status || 'Unknown'}</span>}
            </div>
            <p className="text-[13px] text-ink-500 mt-1">
              {employee.position || '—'} · {employee.department || '—'}
            </p>
            <div className="flex flex-wrap gap-4 mt-3 text-[12.5px] text-ink-600 dark:text-ink-300">
              <span className="font-mono bg-ink-50 dark:bg-ink-700/40 px-2 py-1 rounded">
                {employee.emp_code}
              </span>
              {employee.email && (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" /> {employee.email}
                </span>
              )}
              {employee.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" /> {employee.phone}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Tabs */}
      <section className="card p-0 overflow-hidden">
        <div className="flex items-center gap-1 p-1.5 border-b border-ink-100 dark:border-ink-700 bg-ink-50/50 dark:bg-ink-700/20">
          <TabBtn active={tab === 'overview'}   icon={UserIcon}        label="Overview"   onClick={() => setTab('overview')} />
          <TabBtn active={tab === 'attendance'} icon={ClipboardCheck}  label="Attendance" onClick={() => setTab('attendance')} />
          <TabBtn active={tab === 'documents'}  icon={FileText}        label="Documents"  onClick={() => setTab('documents')} />
        </div>

        <div className="p-6">
          {tab === 'overview' && <OverviewTab e={employee} />}
          {tab === 'attendance' && <ComingSoon icon={ClipboardCheck} title="Attendance tracking" desc="Daily attendance, clock-in / clock-out, timesheets and monthly summaries." />}
          {tab === 'documents' && <ComingSoon icon={FileText} title="Staff documents" desc="Contracts, national IDs, qualifications, and HR uploads." />}
        </div>
      </section>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   Overview tab — all "needed" info
   ───────────────────────────────────────────────────────────── */
function OverviewTab({ e }: { e: HrEmployee }) {
  const joined = formatDate(e.start_date)
  const ends   = e.end_date ? formatDate(e.end_date) : 'Open-ended'
  const createdAt = e.created_at ? formatDate(e.created_at) : '—'
  const salary = e.salary ? `RWF ${Number(e.salary).toLocaleString()}` : '—'

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <InfoBlock title="Employment" icon={Briefcase}>
        <InfoRow label="Position"       value={e.position || '—'} />
        <InfoRow label="Department"     value={e.department || '—'} icon={Building2} />
        <InfoRow label="Contract type"  value={e.contract_type || '—'} />
        <InfoRow label="Salary"         value={salary} />
        <InfoRow label="Status"         value={e.status || '—'} />
      </InfoBlock>

      <InfoBlock title="Dates" icon={Calendar}>
        <InfoRow label="Time joined"    value={joined} icon={Clock} />
        <InfoRow label="Contract end"   value={ends} />
        <InfoRow label="Record created" value={createdAt} />
      </InfoBlock>

      <InfoBlock title="Personal" icon={UserIcon}>
        <InfoRow label="Full name"      value={e.full_name || '—'} />
        <InfoRow
          label="Gender"
          value={e.gender === 'M' ? 'Male' : e.gender === 'F' ? 'Female' : (e.gender as string) || '—'}
        />
        <InfoRow label="Employee code"  value={e.emp_code} mono />
        {e.staff_id && <InfoRow label="Linked staff ID" value={String(e.staff_id)} mono />}
      </InfoBlock>

      <InfoBlock title="Contacts" icon={Mail}>
        <InfoRow label="Email" value={e.email || '—'} icon={Mail} />
        <InfoRow label="Phone" value={e.phone || '—'} icon={Phone} />
      </InfoBlock>
    </div>
  )
}

function InfoBlock({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-ink-100 dark:border-ink-700 p-4 bg-white dark:bg-ink-800">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-ink-100 dark:border-ink-700">
        <Icon className="w-4 h-4 text-brand" />
        <h3 className="text-[13px] font-semibold text-ink-900 dark:text-white">{title}</h3>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function InfoRow({
  label,
  value,
  icon: Icon,
  mono,
}: {
  label: string
  value: string
  icon?: React.ComponentType<{ className?: string }>
  mono?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4 text-[12.5px]">
      <span className="text-ink-500 shrink-0">{label}</span>
      <span className={`text-right text-ink-800 dark:text-ink-100 inline-flex items-center gap-1.5 ${mono ? 'font-mono' : ''}`}>
        {Icon && <Icon className="w-3 h-3 text-ink-400" />}
        {value}
      </span>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   Coming-soon placeholder (attendance, documents)
   ───────────────────────────────────────────────────────────── */
function ComingSoon({
  icon: Icon,
  title,
  desc,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  desc: string
}) {
  return (
    <div className="py-10 flex flex-col items-center text-center gap-3">
      <div className="w-14 h-14 rounded-2xl bg-brand/10 text-brand flex items-center justify-center">
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <h3 className="text-[15px] font-semibold text-ink-900 dark:text-white">{title}</h3>
        <p className="text-[12.5px] text-ink-500 mt-1 max-w-sm">{desc}</p>
      </div>
      <span className="inline-flex items-center gap-1.5 chip-soft">
        <Sparkles className="w-3 h-3" /> Coming soon
      </span>
      <button disabled className="btn-secondary opacity-60 cursor-not-allowed mt-1">
        Open {title.toLowerCase()}
      </button>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────────────────────── */
function TabBtn({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-2 text-[13px] rounded-md transition-colors ${
        active
          ? 'bg-white dark:bg-ink-800 shadow-sm text-brand font-semibold'
          : 'text-ink-600 dark:text-ink-300 hover:text-ink-900 dark:hover:text-white'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  )
}

function formatDate(iso?: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

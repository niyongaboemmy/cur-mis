import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
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
  Pencil,
  X,
  Save,
  CreditCard,
} from 'lucide-react'
import { hrService, type HrEmployeePayload } from '@/services/hrService'
import { useAuthStore } from '@/store/authStore'
import { PERMISSIONS } from '@/constants'
import type { HrEmployee } from '@/types/academic'

type Tab = 'overview' | 'attendance' | 'documents'

export default function StaffDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [tab, setTab] = useState<Tab>('overview')
  const [editOpen, setEditOpen] = useState(false)

  const { user } = useAuthStore()
  const canManage = user?.role === 'superadmin' ||
    (user?.permissions || []).includes(PERMISSIONS.MANAGE_HR_EMPLOYEES) ||
    (user?.permissions || []).includes(PERMISSIONS.VIEW_HR_EMPLOYEES)

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
        <div className="flex flex-col md:flex-row gap-5 md:items-start">
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
          {canManage && (
            <button className="btn-primary btn-sm shrink-0" onClick={() => setEditOpen(true)}>
              <Pencil className="w-3.5 h-3.5" /> Edit staff
            </button>
          )}
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

      {editOpen && (
        <EditStaffModal
          employee={employee}
          onClose={() => setEditOpen(false)}
          onSaved={() => setEditOpen(false)}
        />
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   Edit Staff Modal
   ───────────────────────────────────────────────────────────── */
function EditStaffModal({
  employee, onClose, onSaved,
}: { employee: HrEmployee; onClose: () => void; onSaved: () => void }) {
  const qc = useQueryClient()

  const emp = employee as any
  const [form, setForm] = useState({
    emp_code:      emp.emp_code     ?? '',
    first_name:    emp.first_name   ?? emp.full_name?.split(' ')[0]              ?? '',
    last_name:     emp.last_name    ?? emp.full_name?.split(' ').slice(1).join(' ') ?? '',
    gender:        (emp.gender as 'M' | 'F') || 'M',
    department:    emp.department   ?? '',
    position:      emp.position     ?? '',
    contract_type: (emp.contract_type as HrEmployeePayload['contract_type']) || 'Permanent',
    start_date:    emp.start_date   ?? '',
    end_date:      emp.end_date     ?? '',
    salary:        emp.salary       ?? 0,
    phone:         emp.phone        ?? '',
    email:         emp.email        ?? '',
    status:        ((emp.status || 'Active') as HrEmployeePayload['status']),
    bank:          emp.bank         ?? '',
    bank_account:  emp.bank_account ?? '',
  })

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(prev => ({ ...prev, [k]: v }))

  const mut = useMutation({
    mutationFn: () => hrService.updateEmployee(employee.id, {
      ...form,
      salary:   Number(form.salary) || 0,
      end_date: form.end_date || null,
      phone:    form.phone   || null,
      email:    form.email   || null,
    } as any),
    onSuccess: () => {
      toast.success('Staff updated.')
      qc.invalidateQueries({ queryKey: ['hr-employee', String(employee.id)] })
      qc.invalidateQueries({ queryKey: ['hr-employees'] })
      qc.invalidateQueries({ queryKey: ['hr-stats'] })
      onSaved()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Save failed'),
  })

  const F = ({ label, required: req, children }: { label: string; required?: boolean; children: React.ReactNode }) => (
    <label className="block">
      <span className="text-[12px] font-medium text-ink-700 dark:text-ink-300 mb-1 block">
        {label} {req && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  )

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-ink-900/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-ink-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100 dark:border-ink-700">
          <div>
            <h3 className="text-[15px] font-semibold text-ink-900 dark:text-white">Edit staff — {employee.full_name}</h3>
            <p className="text-[12px] text-ink-500">Update information or change employment status</p>
          </div>
          <button onClick={onClose} className="icon-btn"><X className="w-4 h-4" /></button>
        </div>

        <form
          onSubmit={e => { e.preventDefault(); mut.mutate() }}
          className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <F label="Employee code" required><input required className="input" value={form.emp_code} onChange={e => set('emp_code', e.target.value)} /></F>
          <F label="Gender">
            <select className="input" value={form.gender} onChange={e => set('gender', e.target.value as 'M' | 'F')}>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </select>
          </F>
          <F label="First name (surname)" required><input required className="input" value={form.first_name} onChange={e => set('first_name', e.target.value)} /></F>
          <F label="Last name (given name)" required><input required className="input" value={form.last_name} onChange={e => set('last_name', e.target.value)} /></F>
          <F label="Department" required><input required className="input" value={form.department} onChange={e => set('department', e.target.value)} /></F>

          <F label="Position / Role" required><input required className="input" value={form.position} onChange={e => set('position', e.target.value)} /></F>
          <F label="Contract type">
            <select className="input" value={form.contract_type} onChange={e => set('contract_type', e.target.value as HrEmployeePayload['contract_type'])}>
              <option value="Permanent">Permanent</option>
              <option value="Temporal">Temporal</option>
              <option value="Part-time">Part-time</option>
            </select>
          </F>

          <F label="Start date"><input type="date" className="input" value={form.start_date} onChange={e => set('start_date', e.target.value)} /></F>
          <F label="End date"><input type="date" className="input" value={form.end_date || ''} onChange={e => set('end_date', e.target.value)} /></F>

          <F label="Salary (RWF)"><input type="number" min={0} className="input" value={form.salary} onChange={e => set('salary', Number(e.target.value))} /></F>
          <F label="Status">
            <select className="input" value={form.status} onChange={e => set('status', e.target.value as HrEmployeePayload['status'])}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Terminated">Terminated</option>
            </select>
          </F>

          <F label="Phone"><input className="input" placeholder="+250…" value={form.phone} onChange={e => set('phone', e.target.value)} /></F>
          <F label="Email"><input type="email" className="input" value={form.email} onChange={e => set('email', e.target.value)} /></F>

          {/* Bank info */}
          <div className="md:col-span-2 pt-2 border-t border-ink-100 dark:border-ink-700">
            <p className="text-[11px] font-semibold text-ink-500 uppercase tracking-wider flex items-center gap-1.5 mb-3">
              <CreditCard className="w-3.5 h-3.5" /> Bank / Payment Info
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <F label="Bank name"><input className="input" placeholder="e.g. Bank of Kigali" value={form.bank} onChange={e => set('bank', e.target.value)} /></F>
              <F label="Account number"><input className="input" placeholder="Account #" value={form.bank_account} onChange={e => set('bank_account', e.target.value)} /></F>
            </div>
          </div>

          <div className="md:col-span-2 flex justify-end gap-2 pt-2 border-t border-ink-100 dark:border-ink-700">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={mut.isPending} className="btn-primary">
              {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save changes
            </button>
          </div>
        </form>
      </div>
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

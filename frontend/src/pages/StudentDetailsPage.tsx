import { useParams, Link, useLocation } from 'react-router-dom'
import ModalPortal from '@/components/ui/ModalPortal'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { studentService } from '@/services/studentService'
import {
  moduleCatalogService,
  moduleRegistrationService,
  moduleScheduleService,
} from '@/services/modulesService'
import { marksService, type MyMarksRow, type MyMarksTotals } from '@/services/marksService'
import { attendanceService, type AttendanceStatus } from '@/services/attendanceService'
import { useSystemStore, selectActiveTerm } from '@/store/systemStore'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Loader2, User, Mail, Phone, Calendar,
  GraduationCap, Globe2, Building2, BookOpen,
  CheckCircle, Clock, FileText, BarChart, Edit, Save, X,
  Hash, Award, AlertTriangle, MapPin, Plus, Sparkles, Download, Percent,
  Eye, ShieldCheck, ShieldAlert, ShieldX
} from 'lucide-react'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

type Tab = 'overview' | 'attendance' | 'documents' | 'modules' | 'finance' | 'transcript'

export default function StudentDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const [tab, setTab] = useState<Tab>('overview')
  const [isEditing, setIsEditing] = useState(false)
  
  const fromSearch = location.state?.fromSearch
  const backUrl = fromSearch !== undefined ? `/students?${fromSearch}` : '/students?tab=all'

  const studentQ = useQuery({
    queryKey: ['student', id],
    queryFn: () => studentService.show(Number(id)),
    enabled: !!id,
  })

  const statsQ = useQuery({
    queryKey: ['student-stats'],
    queryFn: () => studentService.stats(),
    staleTime: 60_000,
  })

  const student = studentQ.data?.data
  const stats = statsQ.data?.data

  if (studentQ.isLoading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="w-6 h-6 text-brand animate-spin" />
      </div>
    )
  }

  if (studentQ.isError || !student) {
    return (
      <div className="max-w-[1000px] mx-auto p-6 text-center">
        <h2 className="text-lg font-semibold text-ink-900 mb-2">Student not found</h2>
        <Link to={backUrl} className="btn-secondary inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to students
        </Link>
      </div>
    )
  }

  const initials = [student.fname, student.lname].filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase() || '—'

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      {/* Header section */}
      <div className="flex items-center gap-4">
        <Link to={backUrl} className="btn-secondary p-2">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="w-16 h-16 rounded-xl bg-brand/10 text-brand flex items-center justify-center text-xl font-bold">
          {initials}
        </div>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-ink-900 dark:text-white">
              {student.fname} {student.lname}
            </h1>
            <button onClick={() => setIsEditing(true)} className="btn-secondary btn-sm flex items-center gap-1.5 h-7 px-2.5">
              <Edit className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
          </div>
          <p className="text-sm text-ink-500 mt-1 flex items-center gap-3">
            <span className="font-mono bg-ink-100 dark:bg-ink-800 px-2 py-0.5 rounded">
              {student.regnumber || student.index_number || 'No ID'}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
              student.student_state === 'active' ? 'bg-mint-100 text-mint-700' : 'bg-ink-100 text-ink-700'
            }`}>
              {String(student.student_state || 'Unknown').toUpperCase()}
            </span>
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 dark:border-ink-800">
        <TabButton active={tab === 'overview'}   onClick={() => setTab('overview')}   icon={User}       label="Overview & Stats" />
        <TabButton active={tab === 'attendance'} onClick={() => setTab('attendance')} icon={Clock}      label="Attendance" />
        <TabButton active={tab === 'documents'}  onClick={() => setTab('documents')}  icon={FileText}   label="Documents" />
        <TabButton active={tab === 'modules'}    onClick={() => setTab('modules')}    icon={BookOpen}   label="Modules" />
        <TabButton active={tab === 'finance'}    onClick={() => setTab('finance')}    icon={BarChart}   label="Finance" />
        <TabButton active={tab === 'transcript'} onClick={() => setTab('transcript')} icon={FileText}   label="Transcript" />
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {tab === 'overview' && <OverviewTab student={student} stats={stats} />}
        {tab === 'attendance' && <AttendanceTab student={student} />}
        {tab === 'documents' && <DocumentsTab student={student} />}
        {tab === 'modules' && <ModulesTab student={student} stats={stats} />}
        {tab === 'finance' && <PlaceholderTab icon={BarChart} title="Financial Overview" desc="Tuition fees, payments, and balances." />}
        {tab === 'transcript' && <TranscriptTab student={student} />}
      </div>

      {isEditing && <EditStudentModal student={student} stats={stats} onClose={() => setIsEditing(false)} />}
    </div>
  )
}

function OverviewTab({ student, stats }: { student: any, stats: any }) {
  const facultyName = stats?.facets?.faculty?.find((f: any) => String(f.value) === String(student.faculty))?.label || student.faculty
  const deptName = stats?.facets?.department?.find((f: any) => String(f.value) === String(student.department))?.label || student.department
  const levelName = stats?.facets?.current_level?.find((f: any) => String(f.value) === String(student.current_level))?.label || student.current_level

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="card p-5 space-y-4 md:col-span-1 h-max">
        <h3 className="font-semibold text-ink-900 dark:text-white border-b border-ink-100 dark:border-ink-800 pb-3">Personal Details</h3>
        <DetailRow icon={Mail} label="Email" value={student.email} />
        <DetailRow icon={Phone} label="Phone" value={student.phone} />
        <DetailRow icon={Globe2} label="Nationality" value={student.nationality} />
        <DetailRow icon={User} label="Gender" value={student.gender === 'M' ? 'Male' : student.gender === 'F' ? 'Female' : student.gender} />
        <DetailRow icon={Calendar} label="Birthdate" value={student.birthdate} />
      </div>

      <div className="card p-5 space-y-4 md:col-span-2">
        <h3 className="font-semibold text-ink-900 dark:text-white border-b border-ink-100 dark:border-ink-800 pb-3">Academic Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DetailRow icon={Building2} label="Faculty" value={facultyName} />
          <DetailRow icon={GraduationCap} label="Department" value={deptName} />
          <DetailRow icon={BookOpen} label="Program" value={student.program} />
          <DetailRow icon={CheckCircle} label="Current Level" value={levelName} />
          <DetailRow icon={Calendar} label="Registration Date" value={student.registration_date} />
          <DetailRow icon={Calendar} label="Academic Year" value={student.acc_year} />
        </div>

        <div className="mt-8">
          <h3 className="font-semibold text-ink-900 dark:text-white mb-4">Academic Progress</h3>
          <div className="bg-ink-50 dark:bg-ink-800 rounded-lg p-6 text-center text-ink-500 border border-dashed border-ink-200 dark:border-ink-700">
            <BarChart className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Comprehensive stats and GPA calculations are currently being processed.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function DetailRow({ icon: Icon, label, value }: { icon: any, label: string, value?: string | null }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 text-ink-400 mt-0.5" />
      <div>
        <p className="text-xs text-ink-500">{label}</p>
        <p className="text-sm font-medium text-ink-900 dark:text-ink-100">{value || '—'}</p>
      </div>
    </div>
  )
}

function TabButton({ active, icon: Icon, label, onClick }: { active: boolean, icon: any, label: string, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
        active 
          ? 'border-brand text-brand' 
          : 'border-transparent text-ink-500 hover:text-ink-900 dark:hover:text-ink-200 hover:border-ink-300'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  )
}

type ScheduleSlot = {
  module_id: number
  day_of_week: number
  start_time: string
  end_time: string
  room_name?: string
}

function timeOverlap(a: ScheduleSlot, b: ScheduleSlot): boolean {
  if (a.day_of_week !== b.day_of_week) return false
  return !(a.end_time <= b.start_time || a.start_time >= b.end_time)
}

function ModulesTab({ student, stats }: { student: any, stats: any }) {
  const qc = useQueryClient()
  const regnumber = student.regnumber || ''
  const activeTerm = useSystemStore(selectActiveTerm)
  const termId = activeTerm?.id ? Number(activeTerm.id) : null

  const facultyName = stats?.facets?.faculty?.find((f: any) => String(f.value) === String(student.faculty))?.label || student.faculty
  const deptName = stats?.facets?.department?.find((f: any) => String(f.value) === String(student.department))?.label || student.department
  const levelName = stats?.facets?.current_level?.find((f: any) => String(f.value) === String(student.current_level))?.label || student.current_level

  // Show modules from the student's department (the curriculum they're
  // enrolled in). If the department isn't set, fall back to "all modules" so
  // an admin can still enroll them — but warn in the UI.
  const studentDeptId = student?.department ? Number(student.department) : 0
  const canList = true

  const modulesQ = useQuery({
    queryKey: ['student-modules', studentDeptId || 'all'],
    queryFn: () => moduleCatalogService.list(
      studentDeptId > 0
        ? { per_page: 500, status: 'active', department: studentDeptId }
        : { per_page: 500, status: 'active' }
    ),
    enabled: canList,
  })

  const registrationsQ = useQuery({
    queryKey: ['student-registrations', regnumber],
    queryFn: () => moduleRegistrationService.list({ regnumber }),
    enabled: !!regnumber,
  })

  const schedulesQ = useQuery({
    queryKey: ['module-schedules', termId],
    queryFn: () => moduleScheduleService.list({ term_id: termId! }),
    enabled: !!termId,
  })

  const enrollM = useMutation({
    mutationFn: (moduleId: number) =>
      moduleRegistrationService.create({
        module_id: moduleId,
        student_regnumber: regnumber,
        academic_term_id: termId!,
        force: true,
      } as any),
    onSuccess: () => {
      toast.success('Student enrolled in module')
      qc.invalidateQueries({ queryKey: ['student-registrations', regnumber] })
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message || 'Could not enroll'),
  })

  const [bulkEnrolling, setBulkEnrolling] = useState(false)
  const enrollAllAvailable = async (ids: number[]) => {
    if (!termId || ids.length === 0) return
    setBulkEnrolling(true)
    let ok = 0, fail = 0, errMsg = ''
    for (const id of ids) {
      try {
        await moduleRegistrationService.create({ module_id: id, student_regnumber: regnumber, academic_term_id: termId, force: true } as any)
        ok++
      } catch (e: any) {
        fail++; errMsg = e?.response?.data?.message || errMsg
      }
    }
    qc.invalidateQueries({ queryKey: ['student-registrations', regnumber] })
    setBulkEnrolling(false)
    if (ok > 0) toast.success(`Enrolled in ${ok} module${ok === 1 ? '' : 's'}${fail ? ` · ${fail} skipped` : ''}`)
    else toast.error(`Could not enroll${errMsg ? ': ' + errMsg : ''}`)
  }

  if (!canList) {
    return (
      <div className="card p-12 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 mb-4">
          <BookOpen className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-semibold text-ink-900 dark:text-white">Cannot list modules</h3>
        <p className="text-ink-500 max-w-md mt-2">
          This student does not have a department or current level assigned.
        </p>
      </div>
    )
  }

  const isLoading = modulesQ.isLoading || registrationsQ.isLoading || (!!termId && schedulesQ.isLoading)
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="w-6 h-6 text-brand animate-spin" />
      </div>
    )
  }

  const rawModules: any[] = modulesQ.data?.data?.data ?? []
  const registrations: any[] = registrationsQ.data?.data ?? []
  const schedules: any[] = schedulesQ.data?.data ?? []

  // Deduplicate by trimmed/normalized code+name. The catalog has stale import
  // rows where the same module exists with a trailing tab (e.g. "CCU8111\t" vs
  // "CCU8111") — keep the lowest module_id as canonical.
  const seenKey = new Set<string>()
  const modules: any[] = []
  for (const m of [...rawModules].sort((a, b) => Number(a.module_id) - Number(b.module_id))) {
    const code = String(m.module_code ?? '').replace(/\s+/g, '').toLowerCase()
    const name = String(m.module_name ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
    const key  = `${code}|${name}|${m.level ?? ''}`
    if (seenKey.has(key)) continue
    seenKey.add(key)
    modules.push(m)
  }

  // Group schedules per module (only for active term)
  const schedulesByModule = new Map<number, ScheduleSlot[]>()
  for (const s of schedules) {
    const arr = schedulesByModule.get(Number(s.module_id)) ?? []
    arr.push({
      module_id: Number(s.module_id),
      day_of_week: Number(s.day_of_week),
      start_time: String(s.start_time).slice(0, 5),
      end_time: String(s.end_time).slice(0, 5),
      room_name: s.room_name,
    })
    schedulesByModule.set(Number(s.module_id), arr)
  }

  const completed = registrations.filter((r) => r.status === 'completed' || r.status === 'failed')
  const inProgress = registrations.filter((r) => r.status === 'registered' && (!termId || Number(r.academic_term_id) === termId))
  const registeredIds = new Set([
    ...inProgress.map((r) => Number(r.module_id)),
    ...completed.map((r) => Number(r.module_id)),
  ])

  // Schedule slots already locked in by in-progress registrations (used for clash detection)
  const lockedSlots: ScheduleSlot[] = inProgress.flatMap((r) =>
    schedulesByModule.get(Number(r.module_id)) ?? [],
  )

  const remaining = modules.filter((m) => !registeredIds.has(Number(m.module_id)))
  const available = remaining.filter((m) => (schedulesByModule.get(Number(m.module_id)) ?? []).length > 0)
  const unscheduled = remaining.filter((m) => (schedulesByModule.get(Number(m.module_id)) ?? []).length === 0)

  const findConflict = (slots: ScheduleSlot[]): ScheduleSlot | null => {
    for (const s of slots) {
      const clash = lockedSlots.find((l) => timeOverlap(s, l))
      if (clash) return clash
    }
    return null
  }

  const moduleNameById = (id: number) =>
    modules.find((m) => Number(m.module_id) === id)?.module_name
    || registrations.find((r) => Number(r.module_id) === id)?.module_name
    || `Module #${id}`

  return (
    <div className="space-y-6">
      {/* Hero summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard tone="emerald" icon={CheckCircle} label="Completed" value={completed.filter(c => c.status === 'completed').length} />
        <SummaryCard tone="brand" icon={Sparkles} label="In Progress" value={inProgress.length} />
        <SummaryCard tone="amber" icon={Clock} label="Available" value={available.length} />
        <SummaryCard tone="ink" icon={BookOpen} label="Catalog Total" value={modules.length} />
      </div>

      <div className="card p-4 flex flex-wrap items-center gap-2 text-[13px]">
        <span className="text-ink-500">Filtered by</span>
        <FilterPill icon={Building2} value={facultyName} />
        <FilterPill icon={GraduationCap} value={deptName} />
        <FilterPill icon={Award} value={levelName ? `Level ${levelName}` : '—'} />
        <span className="ml-auto text-ink-500 font-medium">
          {activeTerm?.label ? `Term: ${activeTerm.label}` : 'No active term'}
        </span>
      </div>

      {/* In Progress */}
      {inProgress.length > 0 && (
        <SectionHeader icon={Sparkles} tone="brand" title="In Progress" count={inProgress.length} hint="Currently registered for the active term." />
      )}
      {inProgress.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {inProgress.map((r) => (
            <ModuleCard
              key={r.id}
              code={r.module_code}
              name={r.module_name}
              credits={r.module_credits}
              tone="brand"
              badge={{ label: 'Registered', tone: 'brand' }}
              schedule={schedulesByModule.get(Number(r.module_id)) ?? []}
            />
          ))}
        </div>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <SectionHeader icon={CheckCircle} tone="emerald" title="Completed Modules" count={completed.length} hint="Past results from previous terms." />
      )}
      {completed.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {completed.map((r) => (
            <ModuleCard
              key={r.id}
              code={r.module_code}
              name={r.module_name}
              credits={r.module_credits}
              tone={r.status === 'completed' ? 'emerald' : 'rose'}
              badge={{
                label: r.status === 'completed' ? `Grade ${r.grade ?? '—'}` : 'Failed',
                tone: r.status === 'completed' ? 'emerald' : 'rose',
              }}
              footer={
                <span className="text-[11px] text-ink-500 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {r.term_label ? r.term_label + ' · ' : ''}
                  {r.dropped_at ? `Closed ${new Date(r.dropped_at).toLocaleDateString()}` :
                   r.registered_at ? new Date(r.registered_at).toLocaleDateString() : '—'}
                </span>
              }
            />
          ))}
        </div>
      )}

      {/* Available to Enroll */}
      <SectionHeader
        icon={Plus}
        tone="amber"
        title="Available to Enroll"
        count={available.length}
        hint={termId ? 'Modules with a schedule for the current term.' : 'Set an active term to enable enrollment.'}
        action={
          (() => {
            const enrollable = available
              .filter((m) => !findConflict(schedulesByModule.get(Number(m.module_id)) ?? []))
              .map((m) => Number(m.module_id))
            if (!termId || enrollable.length === 0) return null
            return (
              <button
                type="button"
                disabled={bulkEnrolling}
                onClick={() => {
                  if (confirm(`Enroll this student in all ${enrollable.length} available module${enrollable.length === 1 ? '' : 's'} (skipping any with schedule conflicts)?`)) {
                    enrollAllAvailable(enrollable)
                  }
                }}
                className="btn-primary btn-sm flex items-center gap-1.5"
              >
                {bulkEnrolling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Enroll in all {enrollable.length}
              </button>
            )
          })()
        }
      />
      {available.length === 0 ? (
        <EmptyState icon={BookOpen} title="Nothing schedulable yet" desc="No catalog modules at this department/level are scheduled in the current term." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {available.map((m) => {
            const slots = schedulesByModule.get(Number(m.module_id)) ?? []
            const conflict = findConflict(slots)
            const enrolling = enrollM.isPending && enrollM.variables === Number(m.module_id)
            return (
              <ModuleCard
                key={m.module_id}
                code={m.module_code}
                name={m.module_name}
                credits={m.module_credits}
                tone="amber"
                schedule={slots}
                footer={
                  conflict ? (
                    <div className="flex items-start gap-2 text-[11.5px] text-rose-600 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-900/40 rounded-md px-2 py-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>
                        Conflicts with <strong>{moduleNameById(conflict.module_id)}</strong> on {DAY_NAMES[conflict.day_of_week - 1]} {conflict.start_time}–{conflict.end_time}
                      </span>
                    </div>
                  ) : null
                }
                action={
                  <button
                    type="button"
                    onClick={() => enrollM.mutate(Number(m.module_id))}
                    disabled={!termId || !!conflict || enrolling}
                    className={`btn-primary btn-sm flex items-center gap-1.5 ${(!termId || conflict) ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {enrolling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Enroll
                  </button>
                }
              />
            )
          })}
        </div>
      )}

      {/* Unscheduled / Remaining */}
      {unscheduled.length > 0 && (
        <SectionHeader icon={Clock} tone="ink" title="Not Yet Scheduled" count={unscheduled.length} hint="Catalog modules without a schedule in the active term." />
      )}
      {unscheduled.length > 0 && (
        <div className="card divide-y divide-ink-100 dark:divide-ink-800 overflow-hidden">
          {unscheduled.map((m) => (
            <Link
              key={m.module_id}
              to={`/modules/${m.module_id}`}
              className="flex items-center gap-4 p-3 hover:bg-ink-50 dark:hover:bg-ink-800/50 transition-colors"
            >
              <div className="w-9 h-9 rounded-lg bg-ink-100 dark:bg-ink-800 text-ink-600 flex items-center justify-center shrink-0">
                <BookOpen className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10.5px] bg-ink-100 dark:bg-ink-800 text-ink-700 dark:text-ink-200 px-1.5 py-0.5 rounded">{m.module_code}</span>
                  <span className="text-[10px] text-ink-400">L{m.level} · {m.module_credits} cr</span>
                </div>
                <h4 className="text-[13px] font-semibold text-ink-900 dark:text-white truncate mt-0.5">{m.module_name}</h4>
              </div>
              <span className="text-[10.5px] uppercase tracking-wider text-ink-400 font-semibold shrink-0">No schedule</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function SectionHeader({ icon: Icon, tone, title, count, hint, action }: {
  icon: any; tone: 'brand' | 'emerald' | 'amber' | 'ink'; title: string; count: number; hint?: string; action?: React.ReactNode
}) {
  const toneClass = {
    brand: 'bg-brand/10 text-brand',
    emerald: 'bg-mint-100 text-mint-700',
    amber: 'bg-amber-100 text-amber-700',
    ink: 'bg-ink-100 text-ink-600',
  }[tone]
  return (
    <div className="flex items-center gap-3 pt-2">
      <div className={`w-8 h-8 rounded-lg ${toneClass} flex items-center justify-center`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-[14px] font-bold text-ink-900 dark:text-white flex items-center gap-2">
          {title}
          <span className="text-[11px] font-semibold text-ink-400 bg-ink-100 dark:bg-ink-800 px-1.5 py-0.5 rounded-full">
            {count}
          </span>
        </h3>
        {hint && <p className="text-[12px] text-ink-500 mt-0.5">{hint}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

function ModuleCard({ code, name, credits, tone, badge, schedule, footer, action }: {
  code?: string; name?: string; credits?: number | string;
  tone: 'brand' | 'emerald' | 'amber' | 'rose'
  badge?: { label: string; tone: 'brand' | 'emerald' | 'amber' | 'rose' }
  schedule?: ScheduleSlot[]; footer?: React.ReactNode; action?: React.ReactNode
}) {
  const accent = {
    brand: 'border-brand/20 bg-brand/[0.02]',
    emerald: 'border-mint-200 bg-mint-50/50 dark:bg-mint-900/10',
    amber: 'border-amber-200 bg-amber-50/40 dark:bg-amber-900/10',
    rose: 'border-rose-200 bg-rose-50/40 dark:bg-rose-900/10',
  }[tone]
  const badgeTone = badge ? {
    brand: 'bg-brand/10 text-brand',
    emerald: 'bg-mint-100 text-mint-700',
    amber: 'bg-amber-100 text-amber-700',
    rose: 'bg-rose-100 text-rose-700',
  }[badge.tone] : ''

  return (
    <div className={`card p-4 flex flex-col gap-3 border ${accent} hover:shadow-md transition-shadow`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-mono text-[11px] bg-ink-100 dark:bg-ink-800 text-ink-700 dark:text-ink-200 px-1.5 py-0.5 rounded">
              {code || '—'}
            </span>
            <span className="text-[11px] text-ink-400">
              <Hash className="w-3 h-3 inline mr-0.5" />{credits ?? '—'} cr
            </span>
          </div>
          <h4 className="text-[14px] font-semibold text-ink-900 dark:text-white leading-snug">{name || 'Untitled module'}</h4>
        </div>
        {badge && (
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full shrink-0 ${badgeTone}`}>
            {badge.label}
          </span>
        )}
      </div>

      {schedule && schedule.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {schedule.map((s, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-[11px] bg-ink-50 dark:bg-ink-800 text-ink-700 dark:text-ink-200 border border-ink-100 dark:border-ink-700 px-2 py-1 rounded-md">
              <Clock className="w-3 h-3 text-ink-400" />
              <strong>{DAY_NAMES[s.day_of_week - 1]}</strong> {s.start_time}–{s.end_time}
              {s.room_name && (
                <>
                  <span className="text-ink-300 mx-0.5">·</span>
                  <MapPin className="w-3 h-3 text-ink-400" />{s.room_name}
                </>
              )}
            </span>
          ))}
        </div>
      )}

      {footer}

      {action && (
        <div className="flex justify-end pt-1 border-t border-ink-100 dark:border-ink-800 -mx-4 px-4 -mb-1 pb-0">
          <div className="pt-3">{action}</div>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ tone, icon: Icon, label, value }: {
  tone: 'brand' | 'emerald' | 'amber' | 'ink'; icon: any; label: string; value: number
}) {
  const cls = {
    brand: 'bg-brand/10 text-brand',
    emerald: 'bg-mint-100 text-mint-700',
    amber: 'bg-amber-100 text-amber-700',
    ink: 'bg-ink-100 text-ink-600',
  }[tone]
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${cls}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wider text-ink-500 font-semibold">{label}</p>
        <p className="text-xl font-bold text-ink-900 dark:text-white">{value}</p>
      </div>
    </div>
  )
}

function EmptyState({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="card p-8 flex flex-col items-center justify-center text-center">
      <div className="w-12 h-12 rounded-full bg-ink-100 dark:bg-ink-800 flex items-center justify-center text-ink-400 mb-3">
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="text-[13.5px] font-semibold text-ink-900 dark:text-white">{title}</h3>
      <p className="text-[12px] text-ink-500 max-w-md mt-1">{desc}</p>
    </div>
  )
}

function FilterPill({ icon: Icon, value }: { icon: any, value?: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-ink-100 dark:bg-ink-800 text-ink-700 dark:text-ink-200 text-[12px] font-medium">
      <Icon className="w-3.5 h-3.5" />
      {value || '—'}
    </span>
  )
}

function AttendanceTab({ student }: { student: any }) {
  const reg = student?.regnumber as string | undefined

  const summaryQ = useQuery({
    queryKey: ['student-attendance', reg],
    queryFn: () => attendanceService.studentSummary(reg as string),
    enabled: !!reg,
  })

  if (!reg) {
    return (
      <PlaceholderTab
        icon={Clock}
        title="No Registration Number"
        desc="This student doesn't have a registration number yet, so attendance records cannot be loaded."
      />
    )
  }

  if (summaryQ.isLoading) {
    return (
      <div className="card p-12 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-brand animate-spin" />
      </div>
    )
  }

  if (summaryQ.isError) {
    return (
      <PlaceholderTab
        icon={Clock}
        title="Failed to load attendance"
        desc={(summaryQ.error as any)?.response?.data?.message ?? 'An error occurred while loading attendance records.'}
      />
    )
  }

  const data = summaryQ.data?.data
  const totals = data?.totals
  const byModule = data?.by_module ?? []
  const records = data?.recent ?? []

  const statusBadge = (s: AttendanceStatus) => {
    const map: Record<AttendanceStatus, string> = {
      present: 'bg-mint-100 text-mint-700',
      late:    'bg-amber-100 text-amber-700',
      absent:  'bg-red-100 text-red-700',
      excused: 'bg-ink-100 text-ink-700',
    }
    return (
      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase ${map[s] || 'bg-ink-100 text-ink-700'}`}>
        {s}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Total Records" value={totals?.records ?? 0} />
        <KpiCard label="Present" value={totals?.present ?? 0} accent="text-mint-700" />
        <KpiCard label="Late" value={totals?.late ?? 0} accent="text-amber-700" />
        <KpiCard label="Absent" value={totals?.absent ?? 0} accent="text-red-700" />
        <KpiCard label="Attendance %" value={`${totals?.attendance_pct ?? 0}%`} accent="text-brand" />
      </div>

      {/* Per-module breakdown */}
      {byModule.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-ink-100 dark:border-ink-800 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-brand" />
            <h3 className="text-sm font-semibold text-ink-900 dark:text-white">By Module</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-ink-50 dark:bg-ink-900/40">
                <tr className="text-ink-500">
                  <th className="px-4 py-2 font-semibold">Code</th>
                  <th className="px-4 py-2 font-semibold">Module</th>
                  <th className="px-4 py-2 font-semibold text-right">Records</th>
                  <th className="px-4 py-2 font-semibold text-right">Present-like</th>
                  <th className="px-4 py-2 font-semibold text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {byModule.map((m) => (
                  <tr key={m.module_id} className="border-t border-ink-100 dark:border-ink-800">
                    <td className="px-4 py-2 font-mono text-ink-700 dark:text-ink-200">{m.module_code}</td>
                    <td className="px-4 py-2 text-ink-900 dark:text-white">{m.module_name}</td>
                    <td className="px-4 py-2 text-right">{m.records}</td>
                    <td className="px-4 py-2 text-right">{m.present_like}</td>
                    <td className="px-4 py-2 text-right font-semibold">{m.attendance_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* All records */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-ink-100 dark:border-ink-800 flex items-center gap-2">
          <Clock className="w-4 h-4 text-brand" />
          <h3 className="text-sm font-semibold text-ink-900 dark:text-white">
            All Recorded Attendance ({records.length})
          </h3>
        </div>
        {records.length === 0 ? (
          <div className="p-12 text-center text-ink-500 text-[13px]">
            No attendance records yet for this student.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-ink-50 dark:bg-ink-900/40">
                <tr className="text-ink-500">
                  <th className="px-4 py-2 font-semibold">Date</th>
                  <th className="px-4 py-2 font-semibold">Module</th>
                  <th className="px-4 py-2 font-semibold">Type</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold">Recorded At</th>
                  <th className="px-4 py-2 font-semibold">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={`${r.session_date}-${r.module_code}-${i}`} className="border-t border-ink-100 dark:border-ink-800">
                    <td className="px-4 py-2 text-ink-900 dark:text-white">{r.session_date}</td>
                    <td className="px-4 py-2">
                      <div className="font-mono text-ink-700 dark:text-ink-200">{r.module_code}</div>
                      <div className="text-[11px] text-ink-500">{r.module_name}</div>
                    </td>
                    <td className="px-4 py-2 capitalize text-ink-700 dark:text-ink-200">{r.session_type}</td>
                    <td className="px-4 py-2">{statusBadge(r.status)}</td>
                    <td className="px-4 py-2 text-ink-500">{r.recorded_at ? new Date(r.recorded_at).toLocaleString() : '—'}</td>
                    <td className="px-4 py-2 text-ink-500">{r.remarks || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function KpiCard({ label, value, accent }: { label: string, value: string | number, accent?: string }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-wide text-ink-500 font-semibold">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${accent ?? 'text-ink-900 dark:text-white'}`}>{value}</div>
    </div>
  )
}

function DocumentsTab({ student }: { student: any }) {
  const studentId = student.id

  const docsQ = useQuery({
    queryKey: ['student-documents', studentId],
    queryFn: () => studentService.listDocuments(studentId),
    enabled: !!studentId,
  })

  if (docsQ.isLoading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="w-6 h-6 text-brand animate-spin" />
      </div>
    )
  }

  if (docsQ.isError) {
    return (
      <div className="card p-8 text-center text-rose-600">
        Could not load documents.
      </div>
    )
  }

  const applicationId = docsQ.data?.data?.application_id ?? null
  const documents = docsQ.data?.data?.documents ?? []

  if (!applicationId) {
    return (
      <div className="card p-12 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-full bg-ink-100 dark:bg-ink-800 flex items-center justify-center text-ink-400 mb-4">
          <FileText className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-semibold text-ink-900 dark:text-white">No application on file</h3>
        <p className="text-ink-500 max-w-md mt-2">
          This student was not enrolled through the admissions portal, so there are no uploaded documents to display.
        </p>
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <div className="card p-12 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-full bg-ink-100 dark:bg-ink-800 flex items-center justify-center text-ink-400 mb-4">
          <FileText className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-semibold text-ink-900 dark:text-white">No documents uploaded</h3>
        <p className="text-ink-500 max-w-md mt-2">
          This student's admission application does not have any documents attached.
        </p>
      </div>
    )
  }

  const counts = documents.reduce(
    (acc: any, d: any) => {
      const s = String(d.verification_status || 'pending').toLowerCase()
      acc[s] = (acc[s] ?? 0) + 1
      return acc
    },
    { verified: 0, pending: 0, rejected: 0 } as Record<string, number>,
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard tone="ink"     icon={FileText}     label="Total"    value={documents.length} />
        <SummaryCard tone="emerald" icon={ShieldCheck}  label="Verified" value={counts.verified ?? 0} />
        <SummaryCard tone="amber"   icon={ShieldAlert}  label="Pending"  value={counts.pending ?? 0} />
        <SummaryCard tone="brand"   icon={ShieldX}      label="Rejected" value={counts.rejected ?? 0} />
      </div>

      <div className="card divide-y divide-ink-100 dark:divide-ink-800 overflow-hidden">
        {documents.map((d: any) => (
          <DocumentRow key={d.id} doc={d} studentId={studentId} />
        ))}
      </div>
    </div>
  )
}

function DocumentRow({ doc, studentId }: { doc: any; studentId: number }) {
  const status = String(doc.verification_status || 'pending').toLowerCase()
  const typeName = doc.type_name || doc.document_type_name || 'Document'
  const fileName = doc.file_original_name || '—'
  const hasFile = !!doc.file_server_id
  const url = hasFile ? studentService.documentDownloadUrl(studentId, doc.id) : null

  const sizeKb = doc.file_size ? Math.max(1, Math.round(Number(doc.file_size) / 1024)) : null
  const sizeLabel = sizeKb
    ? sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`
    : null

  const statusTone =
    status === 'verified' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
    : status === 'rejected' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
    : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'

  const StatusIcon = status === 'verified' ? ShieldCheck : status === 'rejected' ? ShieldX : ShieldAlert

  return (
    <div className="flex items-center gap-4 p-4 hover:bg-ink-50/60 dark:hover:bg-ink-800/40 transition-colors">
      <div className="w-10 h-10 rounded-lg bg-brand/10 text-brand flex items-center justify-center shrink-0">
        <FileText className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="text-[13.5px] font-semibold text-ink-900 dark:text-white truncate">{typeName}</h4>
          <span className={`inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${statusTone}`}>
            <StatusIcon className="w-3 h-3" />
            {status}
          </span>
        </div>
        <p className="text-[12px] text-ink-500 truncate mt-0.5">
          {fileName}
          {sizeLabel && <span className="text-ink-400"> · {sizeLabel}</span>}
          {doc.uploaded_at && <span className="text-ink-400"> · Uploaded {new Date(doc.uploaded_at).toLocaleDateString()}</span>}
        </p>
        {doc.verification_comment && (
          <p className="text-[11.5px] text-rose-600 mt-1 italic">"{doc.verification_comment}"</p>
        )}
      </div>
      {url && (
        <div className="flex items-center gap-2 shrink-0">
          <a href={url} target="_blank" rel="noreferrer" className="btn-secondary btn-sm flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5" /> View
          </a>
          <a href={url} download={fileName} className="btn-primary btn-sm flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" /> Download
          </a>
        </div>
      )}
    </div>
  )
}

function PlaceholderTab({ icon: Icon, title, desc }: { icon: any, title: string, desc: string }) {
  return (
    <div className="card p-12 flex flex-col items-center justify-center text-center">
      <div className="w-16 h-16 rounded-full bg-brand/5 flex items-center justify-center text-brand mb-4">
        <Icon className="w-8 h-8" />
      </div>
      <h3 className="text-lg font-semibold text-ink-900 dark:text-white">{title}</h3>
      <p className="text-ink-500 max-w-md mt-2">{desc}</p>
    </div>
  )
}

function EditStudentModal({ student, stats, onClose }: { student: any, stats: any, onClose: () => void }) {
  const qc = useQueryClient()
  const { register, handleSubmit } = useForm({
    defaultValues: {
      fname: student.fname,
      lname: student.lname,
      email: student.email || '',
      phone: student.phone || '',
      gender: student.gender || '',
      nationality: student.nationality || '',
      faculty: student.faculty || '',
      department: student.department || '',
      program: student.program || '',
      current_level: student.current_level || '',
      student_state: student.student_state || 'active',
      birthdate: student.birthdate || '',
      regnumber: student.regnumber || '',
      acc_year: student.acc_year || '',
    }
  })

  const mut = useMutation({
    mutationFn: (data: any) => studentService.update(student.id, data),
    onSuccess: () => {
      toast.success('Student updated successfully!')
      qc.invalidateQueries({ queryKey: ['student', String(student.id)] })
      qc.invalidateQueries({ queryKey: ['students'] })
      onClose()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || 'Failed to update student. Please check all required fields.'
      toast.error(msg)
    }
  })

  const onSubmit = (data: any) => {
    // Clean up empty strings to null for the backend
    const payload = { ...data }
    Object.keys(payload).forEach(key => {
      if (payload[key] === '') payload[key] = null
    })
    mut.mutate(payload)
  }

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white dark:bg-ink-900 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-ink-100 dark:border-ink-800 flex justify-between items-center bg-ink-50 dark:bg-ink-900/50">
          <h2 className="text-lg font-bold text-ink-900 dark:text-white flex items-center gap-2">
            <Edit className="w-4 h-4 text-brand" /> Edit Student Details
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-ink-400 hover:bg-ink-200 dark:hover:bg-ink-800 hover:text-ink-900 dark:hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          <form id="edit-student" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">First Name <span className="text-red-500">*</span></label>
                <input {...register('fname')} className="input w-full" required />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">Last Name <span className="text-red-500">*</span></label>
                <input {...register('lname')} className="input w-full" required />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">Email</label>
                <input {...register('email')} type="email" className="input w-full" />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">Phone</label>
                <input {...register('phone')} className="input w-full" />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">Gender</label>
                <select {...register('gender')} className="input w-full cursor-pointer bg-white dark:bg-ink-900">
                  <option value="">Select...</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">Nationality</label>
                <input {...register('nationality')} className="input w-full" />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">Reg Number</label>
                <input {...register('regnumber')} className="input w-full" />
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">Birthdate</label>
                <input {...register('birthdate')} type="date" className="input w-full" />
              </div>
              
              <div className="sm:col-span-2 pt-2 pb-1">
                <div className="border-b border-ink-100 dark:border-ink-800" />
              </div>

              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">Status</label>
                <select {...register('student_state')} className="input w-full cursor-pointer bg-white dark:bg-ink-900">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="graduated">Graduated</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">Faculty <span className="text-red-500">*</span></label>
                <select {...register('faculty')} className="input w-full cursor-pointer bg-white dark:bg-ink-900" required>
                  <option value="">Select Faculty...</option>
                  {stats?.facets?.faculty?.map((f: any) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">Department</label>
                <select {...register('department')} className="input w-full cursor-pointer bg-white dark:bg-ink-900">
                  <option value="">Select Department...</option>
                  {stats?.facets?.department?.map((f: any) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">Current Level</label>
                <select {...register('current_level')} className="input w-full cursor-pointer bg-white dark:bg-ink-900">
                  <option value="">Select Level...</option>
                  {stats?.facets?.current_level?.map((f: any) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">Program</label>
                <select {...register('program')} className="input w-full cursor-pointer bg-white dark:bg-ink-900">
                  <option value="">Select Program...</option>
                  {stats?.facets?.program?.map((f: any) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">Academic Year</label>
                <select {...register('acc_year')} className="input w-full cursor-pointer bg-white dark:bg-ink-900">
                  <option value="">Select Year...</option>
                  {stats?.facets?.acc_year?.map((f: any) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </form>
        </div>
        <div className="p-4 border-t border-ink-100 dark:border-ink-800 flex justify-end gap-3 bg-ink-50 dark:bg-ink-900/50">
          <button type="button" onClick={onClose} className="btn-secondary px-5">Cancel</button>
          <button type="submit" form="edit-student" disabled={mut.isPending} className="btn-primary px-5">
            {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

/* ─── Transcript tab ───────────────────────────────────────────────── */

function TranscriptTab({ student }: { student: any }) {
  const regnumber: string = student?.regnumber ?? ''

  const marksQ = useQuery({
    queryKey: ['student-marks', regnumber],
    queryFn: () => marksService.studentMarks(regnumber),
    enabled: !!regnumber,
  })

  const download = useMutation({
    mutationFn: () => marksService.downloadStudentTranscript(regnumber),
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not download transcript'),
  })

  if (!regnumber) {
    return (
      <div className="card p-8 text-center text-ink-400">
        This student has no registration number, so a transcript cannot be generated.
      </div>
    )
  }

  if (marksQ.isLoading) {
    return <div className="card p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-brand" /></div>
  }

  const data = marksQ.data?.data
  const rows: MyMarksRow[] = data?.rows ?? []
  const totals: MyMarksTotals | undefined = data?.totals

  if (rows.length === 0) {
    return (
      <div className="card p-8 text-center text-ink-400">
        No marks have been recorded for this student yet. Once a lecturer or admin records marks under
        <span className="font-mono mx-1">Modules → Marks</span>, they will appear here.
      </div>
    )
  }

  const byYear = new Map<string, MyMarksRow[]>()
  for (const r of rows) {
    const k = r.year_label ?? '—'
    if (!byYear.has(k)) byYear.set(k, [])
    byYear.get(k)!.push(r)
  }

  return (
    <div className="space-y-4">
      {/* Summary + download */}
      <div className="card p-4 flex flex-wrap items-center gap-5">
        <TStat icon={<BookOpen className="w-4 h-4" />}     label="Modules"          value={totals?.modules ?? 0} />
        <TStat icon={<Award className="w-4 h-4" />}        label="Total credits"    value={totals?.total_credits ?? 0} />
        <TStat icon={<Percent className="w-4 h-4" />}      label="Weighted avg"     value={totals?.weighted_average != null ? `${totals.weighted_average}%` : '—'} highlight />
        <TStat icon={<GraduationCap className="w-4 h-4" />} label="Overall grade"    value={totals?.overall_grade ?? '—'} />
        <TStat icon={<CheckCircle className="w-4 h-4" />}  label="Decision"         value={totals?.decision ?? '—'} tone={totals?.decision === 'Promoted' ? 'good' : totals?.decision === 'Repeat' ? 'bad' : undefined} />

        <button
          className="btn-primary btn-sm ml-auto"
          disabled={download.isPending}
          onClick={() => download.mutate()}
        >
          {download.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          {download.isPending ? 'Preparing…' : 'Download transcript (PDF)'}
        </button>
      </div>

      {/* Per-year tables */}
      {Array.from(byYear.entries()).map(([year, list]) => (
        <div key={year} className="card overflow-hidden">
          <div className="px-4 py-2 border-b border-ink-100 dark:border-ink-700 bg-ink-50 dark:bg-ink-800/40 text-[12px] font-semibold text-ink-700 dark:text-ink-200">
            Academic year: <span className="font-mono">{year}</span>
          </div>
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="bg-ink-50/60 dark:bg-ink-800/30 border-b border-ink-100 dark:border-ink-700">
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase">#</th>
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase">Code</th>
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase">Module</th>
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase">Term</th>
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase text-center">Credits</th>
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase text-center">CAT</th>
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase text-center">Assg</th>
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase text-center">Exam</th>
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase text-center">Marks/100</th>
                <th className="px-3 py-2 font-bold text-ink-400 text-[10px] uppercase text-center">Grade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
              {list.map((r, i) => (
                <tr key={r.id} className="hover:bg-ink-50/50 dark:hover:bg-ink-700/20">
                  <td className="px-3 py-2 text-ink-500">{i + 1}</td>
                  <td className="px-3 py-2 font-mono">{r.module_code}</td>
                  <td className="px-3 py-2">{r.module_name}</td>
                  <td className="px-3 py-2 text-ink-500">{r.term_label}</td>
                  <td className="px-3 py-2 text-center">{r.module_credits}</td>
                  <td className="px-3 py-2 text-center">{tFmt(r.cat_marks)}<span className="text-ink-400 text-[11px]">/{Number(r.cat_max) || '—'}</span></td>
                  <td className="px-3 py-2 text-center">{tFmt(r.assignment_marks)}<span className="text-ink-400 text-[11px]">/{Number(r.assignment_max) || '—'}</span></td>
                  <td className="px-3 py-2 text-center">{tFmt(r.exam_marks)}<span className="text-ink-400 text-[11px]">/{Number(r.exam_max) || '—'}</span></td>
                  <td className="px-3 py-2 text-center font-semibold">
                    {r.percentage != null ? Math.round(Number(r.percentage)) : '—'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {r.grade ? <TGradePill grade={r.grade} /> : <span className="text-ink-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

function TStat({ icon, label, value, highlight, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; highlight?: boolean; tone?: 'good' | 'bad' }) {
  const valueCls =
    tone === 'good' ? 'text-emerald-600' :
    tone === 'bad'  ? 'text-red-600' :
    highlight       ? 'text-brand dark:text-gold-400' : 'text-ink-900 dark:text-white'
  return (
    <div className="flex items-center gap-2">
      <div className="w-8 h-8 rounded-md bg-brand/10 text-brand dark:bg-brand/20 dark:text-gold-400 flex items-center justify-center">
        {icon}
      </div>
      <div>
        <div className="text-[10px] uppercase font-bold text-ink-400">{label}</div>
        <div className={`text-base font-bold leading-tight ${valueCls}`}>{value}</div>
      </div>
    </div>
  )
}

function TGradePill({ grade }: { grade: string }) {
  const tone =
    grade === 'A' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
    : grade === 'B' ? 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300'
    : grade === 'C' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
    : grade === 'D' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
    : 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${tone}`}>{grade}</span>
}

function tFmt(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—'
  const n = Number(v)
  return Number.isFinite(n) ? String(n) : '—'
}

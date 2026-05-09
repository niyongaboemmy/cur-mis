import { useParams, Link, useLocation } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { studentService } from '@/services/studentService'
import { marksService, type MyMarksRow, type MyMarksTotals } from '@/services/marksService'
import { academicService } from '@/services/academicService'
import { attendanceService, type AttendanceStatus } from '@/services/attendanceService'
import { useAuthStore } from '@/store/authStore'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Loader2, User, Mail, Phone, Calendar,
  GraduationCap, Globe2, Building2, BookOpen,
  CheckCircle, Clock, FileText, BarChart, Edit, Save, X,
  Award, AlertTriangle, Download, Percent,
  Eye, ShieldCheck, ShieldAlert, ShieldX,
  Sparkles, Trash2, MapPin, CreditCard, CalendarDays,
  Heart, Accessibility, Users as UsersIcon,
  CalendarClock, CalendarOff, Camera,
  PlusCircle, MinusCircle,
} from 'lucide-react'

type Tab = 'overview' | 'attendance' | 'documents' | 'curriculum' | 'finance' | 'transcript'

interface StudentDetailsPageProps {
  /**
   * When true, the page renders the authenticated user's own student record
   * via `/api/students/me`. Admin-only actions (edit, photo upload, exemption
   * controls, registry back-link) are hidden, and tabs that depend on
   * VIEW_STUDENTS endpoints are replaced with friendly placeholders.
   */
  selfMode?: boolean
}

export default function StudentDetailsPage({ selfMode = false }: StudentDetailsPageProps = {}) {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const [tab, setTab] = useState<Tab>('overview')
  const [isEditing, setIsEditing] = useState(false)

  const fromSearch = location.state?.fromSearch
  const backUrl = fromSearch !== undefined ? `/students?${fromSearch}` : '/students?tab=all'

  const studentQ = useQuery({
    queryKey: selfMode ? ['student', 'me'] : ['student', id],
    queryFn: () => (selfMode ? studentService.me() : studentService.show(Number(id))),
    enabled: selfMode || !!id,
  })

  const statsQ = useQuery({
    queryKey: ['student-stats'],
    queryFn: () => studentService.stats(),
    staleTime: 60_000,
    // Stats requires VIEW_STUDENTS — students hitting their own profile get a
    // 403 here. Skip the call entirely in self mode; the overview tab falls
    // back to raw values from the student record.
    enabled: !selfMode,
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
    if (selfMode) {
      return (
        <div className="max-w-[1000px] mx-auto p-6 text-center">
          <h2 className="text-lg font-semibold text-ink-900 mb-2">No student record on file</h2>
          <p className="text-ink-500 max-w-md mx-auto">
            We couldn't find a student record linked to your account. If you've just been
            enrolled, please sign out and back in. Otherwise, contact the registrar's office.
          </p>
        </div>
      )
    }

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
        {!selfMode && (
          <Link to={backUrl} className="btn-secondary p-2">
            <ArrowLeft className="w-5 h-5" />
          </Link>
        )}
        <StudentAvatar student={student} initials={initials} readOnly={selfMode} />
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-ink-900 dark:text-white">
              {student.fname} {student.lname}
            </h1>
            {!selfMode && (
              <button onClick={() => setIsEditing(true)} className="btn-secondary btn-sm flex items-center gap-1.5 h-7 px-2.5">
                <Edit className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
            )}
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
        {!selfMode && (
          <>
            <TabButton active={tab === 'documents'}  onClick={() => setTab('documents')}  icon={FileText}   label="Documents" />
            <TabButton active={tab === 'curriculum'} onClick={() => setTab('curriculum')} icon={BookOpen}   label="Program & Marks" />
          </>
        )}
        <TabButton active={tab === 'finance'}    onClick={() => setTab('finance')}    icon={BarChart}   label="Finance" />
        <TabButton active={tab === 'transcript'} onClick={() => setTab('transcript')} icon={FileText}   label="Transcript" />
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {tab === 'overview' && <OverviewTab student={student} stats={stats} />}
        {tab === 'attendance' && <AttendanceTab student={student} />}
        {!selfMode && tab === 'documents' && <DocumentsTab student={student} />}
        {!selfMode && tab === 'curriculum' && <ProgramCurriculumTab student={student} />}
        {tab === 'finance' && <PlaceholderTab icon={BarChart} title="Financial Overview" desc="Tuition fees, payments, and balances." />}
        {tab === 'transcript' && <TranscriptTab student={student} />}
      </div>

      {!selfMode && isEditing && <EditStudentModal student={student} stats={stats} onClose={() => setIsEditing(false)} />}
    </div>
  )
}

function OverviewTab({ student, stats }: { student: any, stats: any }) {
  const app = student?.application ?? null

  // Prefer the live student record, but fall back to the application for fields
  // we never copied onto students (father, mother, residency, secondary school…).
  const pick = (...vals: any[]) =>
    vals.find(v => v !== undefined && v !== null && v !== '') ?? null

  const facultyName = stats?.facets?.faculty?.find((f: any) => String(f.value) === String(student.faculty))?.label
                   ?? app?.faculty_name ?? student.faculty
  const deptName    = stats?.facets?.department?.find((f: any) => String(f.value) === String(student.department))?.label
                   ?? app?.department_name ?? student.department
  const levelName   = stats?.facets?.current_level?.find((f: any) => String(f.value) === String(student.current_level))?.label
                   ?? student.current_level
  const programName = stats?.facets?.options?.find((o: any) => String(o.value) === String(student.std_option))?.label
                   ?? app?.program_name ?? student.program

  const fullName = `${student.fname ?? ''} ${student.lname ?? ''}`.trim() || '—'
  const genderRaw = pick(student.gender, app?.gender)
  const genderLabel = genderRaw === 'M' ? 'Male' : genderRaw === 'F' ? 'Female' : (genderRaw || null)

  return (
    <div className="space-y-6">
      {/* Personal Details */}
      <section className="card p-6">
        <SectionHeader
          title="Personal Details"
          sub="Identity and parental information."
          icon={User}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5 mt-6">
          <InfoGroup label="Full Name" value={fullName} icon={User} />
          <InfoGroup label="Father's Name" value={pick(student.father, app?.father)} icon={UsersIcon} />
          <InfoGroup label="Mother's Name" value={pick(student.mother, app?.mother)} icon={UsersIcon} />
          <InfoGroup label="Gender" value={genderLabel} />
          <InfoGroup label="Date of Birth" value={pick(student.birthdate, app?.birthdate)} icon={CalendarDays} />
          <InfoGroup label="Marital Status" value={cap(pick(app?.marital_status))} icon={Heart} />
          <InfoGroup label="National ID / Passport" value={pick(student.id_card, app?.national_id)} icon={CreditCard} />
          <InfoGroup label="Nationality" value={pick(student.nationality, app?.nationality)} icon={Globe2} />
          <InfoGroup label="Country of Residence" value={pick(app?.country_of_residence)} icon={MapPin} />
          <InfoGroup label="Disability" value={pick(app?.disability) ?? 'None'} icon={Accessibility} />
        </div>
      </section>

      {/* Contact */}
      <section className="card p-6">
        <SectionHeader
          title="Contact"
          sub="How we reach the student."
          icon={Phone}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5 mt-6">
          <InfoGroup label="Phone" value={pick(student.phone, app?.phone)} icon={Phone} />
          <InfoGroup label="Reference Person Phone" value={pick(app?.reference_phone)} icon={Phone} />
          <InfoGroup label="Email" value={pick(student.email, app?.email)} icon={Mail} />
        </div>
      </section>

      {/* Residency — only shown when we actually have any address data */}
      {app && (app.province || app.district || app.sector || app.residence_district || app.address) && (
        <section className="card p-6">
          <SectionHeader
            title="Residency"
            sub="Where the student lives."
            icon={MapPin}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5 mt-6">
            <InfoGroup label="Province" value={pick(app?.province)} />
            <InfoGroup label="District" value={pick(app?.district)} />
            <InfoGroup label="Sector" value={pick(app?.sector)} />
            <InfoGroup label="Residence District" value={pick(app?.residence_district)} />
            <div className="sm:col-span-2 lg:col-span-3">
              <InfoGroup label="Address" value={pick(app?.address) ?? 'Not provided'} icon={MapPin} />
            </div>
          </div>
        </section>
      )}

      {/* Academic Background — captured at application time */}
      {app && (
        <section className="card p-6">
          <SectionHeader
            title="Academic Background"
            sub="Secondary school transcript provided during application."
            icon={GraduationCap}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5 mt-6">
            <InfoGroup label="Attended Secondary School" value={pick(app?.prev_school)} />
            <InfoGroup label="Combination / Section" value={pick(app?.combination)} />
            <InfoGroup label="A2 Grades" value={pick(app?.a2_grades)} />
            <InfoGroup label="Principal Passes" value={app?.principal_passes != null ? String(app.principal_passes) : null} />
            <InfoGroup label="Completion Year" value={app?.graduation_year ? String(app.graduation_year) : null} />
            <InfoGroup label="Serial Number" value={pick(app?.serial_number)} />
            <InfoGroup label="Qualification" value={pick(app?.prev_qualification)} />
            <InfoGroup label="Mean Grade" value={pick(app?.prev_grade)} />
          </div>
        </section>
      )}

      {/* Programme Selection — current academic placement */}
      <section className="card p-6">
        <SectionHeader
          title="Programme Selection"
          sub="Faculty, department, programme and academic year."
          icon={BookOpen}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5 mt-6">
          <InfoGroup label="Program" value={programName} icon={BookOpen} />
          <InfoGroup label="Faculty" value={facultyName} icon={Building2} />
          <InfoGroup label="Department" value={deptName} icon={GraduationCap} />
          <InfoGroup label="Current Level" value={levelName} icon={CheckCircle} />
          <InfoGroup label="Campus" value={pick(app?.campus_name)} icon={Building2} />
          <InfoGroup label="Mode of Study" value={cap(pick(app?.mode_of_study))} />
          <InfoGroup label="Intake" value={pick(app?.intake)} icon={Calendar} />
          <InfoGroup label="Academic Year" value={pick(student.acc_year, app?.academic_year_label)} icon={Calendar} />
          <InfoGroup label="Registration Date" value={pick(student.registration_date)} icon={Calendar} />
        </div>
      </section>

      {/* Academic Progress placeholder */}
      <section className="card p-6">
        <SectionHeader title="Academic Progress" sub="GPA and term-by-term performance." icon={BarChart} />
        <div className="mt-6 bg-ink-50 dark:bg-ink-800 rounded-lg p-6 text-center text-ink-500 border border-dashed border-ink-200 dark:border-ink-700">
          <BarChart className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Comprehensive stats and GPA calculations are currently being processed.</p>
        </div>
      </section>
    </div>
  )
}

function SectionHeader({ title, sub, icon: Icon }: { title: string; sub?: string; icon?: any }) {
  return (
    <div className="flex items-center gap-3">
      {Icon && (
        <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center text-brand shrink-0">
          <Icon className="w-4 h-4" />
        </div>
      )}
      <div className="min-w-0">
        <h3 className="text-[15px] font-bold text-ink-900 dark:text-white leading-tight">{title}</h3>
        {sub && <p className="text-[12px] text-ink-500 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  )
}

function InfoGroup({ label, value, icon: Icon }: { label: string; value?: string | null; icon?: any }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wider text-ink-400 font-bold mb-1">{label}</p>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-3.5 h-3.5 text-ink-300 shrink-0" />}
        <p className="text-[14px] text-ink-900 dark:text-white font-medium truncate" title={value || ''}>
          {value || '—'}
        </p>
      </div>
    </div>
  )
}

function cap(s?: string | null): string | null {
  if (!s) return null
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function StudentAvatar({ student, initials, readOnly = false }: { student: any; initials: string; readOnly?: boolean }) {
  const qc       = useQueryClient()
  const fileRef  = useRef<HTMLInputElement | null>(null)
  // Bumped after a successful upload so the cached <img> reloads even when
  // the file_server_id stays in transit before the student query refetches.
  const [v, setV] = useState(0)

  const upload = useMutation({
    mutationFn: (f: File) => studentService.uploadPhoto(student.id, f),
    onSuccess: () => {
      toast.success('Profile photo updated.')
      setV(n => n + 1)
      qc.invalidateQueries({ queryKey: ['student', String(student.id)] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to upload photo'),
  })

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''  // allow re-selecting the same file
    if (!f) return
    if (f.size > 5 * 1024 * 1024) {
      toast.error('Photo must be 5 MB or smaller.')
      return
    }
    upload.mutate(f)
  }

  const photoSrc = student.photo
    ? studentService.photoUrl(student.id, `${student.photo}-${v}`)
    : null

  if (readOnly) {
    return (
      <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-brand/10 text-brand flex items-center justify-center text-xl font-bold shrink-0">
        {photoSrc ? (
          <img
            src={photoSrc}
            alt={`${student.fname ?? ''} ${student.lname ?? ''}`.trim() || 'Student photo'}
            className="w-full h-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <span>{initials}</span>
        )}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => !upload.isPending && fileRef.current?.click()}
      className="group relative w-16 h-16 rounded-xl overflow-hidden bg-brand/10 text-brand flex items-center justify-center text-xl font-bold shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-brand"
      title="Change profile photo"
      disabled={upload.isPending}
    >
      {photoSrc ? (
        <img
          src={photoSrc}
          alt={`${student.fname ?? ''} ${student.lname ?? ''}`.trim() || 'Student photo'}
          className="w-full h-full object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
      ) : (
        <span>{initials}</span>
      )}

      <span className="absolute inset-0 bg-black/45 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        {upload.isPending
          ? <Loader2 className="w-5 h-5 animate-spin" />
          : <Camera  className="w-5 h-5" />}
      </span>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={onPick}
      />
    </button>
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

/**
 * Curriculum view: every module attached to the student's program (option),
 * grouped by level and ordered by module_order. Each module shows the
 * student's marks pulled from the latest term they sat the module. The
 * table can be downloaded as a CSV via the dedicated server endpoint —
 * format mirrors what's on screen so it's printable as-is.
 */
function ProgramCurriculumTab({ student }: { student: any }) {
  const studentId = student?.id
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const isAdmin = user?.role === 'superadmin' || user?.role === 'admin'
  const [exempting, setExempting] = useState<{ moduleId: number; moduleCode: string; moduleName: string } | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [enrollPending, setEnrollPending] = useState<number | null>(null)
  const [dropPending, setDropPending] = useState<number | null>(null)

  const dataQ = useQuery({
    queryKey: ['student-program-modules', studentId],
    queryFn: () => studentService.programModules(studentId),
    enabled: !!studentId,
  })

  const deleteExemption = useMutation({
    mutationFn: (markId: number) => studentService.deleteExemption(studentId, markId),
    onSuccess: () => {
      toast.success('Exemption removed.')
      qc.invalidateQueries({ queryKey: ['student-program-modules', studentId] })
      qc.invalidateQueries({ queryKey: ['student-marks', student?.regnumber] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to remove exemption'),
  })

  const enroll = useMutation({
    mutationFn: (moduleId: number) => studentService.enrollModule(studentId, { module_id: moduleId }),
    onMutate: (moduleId) => setEnrollPending(moduleId),
    onSuccess: () => {
      toast.success('Module enrolled.')
      qc.invalidateQueries({ queryKey: ['student-program-modules', studentId] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to enroll'),
    onSettled: () => setEnrollPending(null),
  })

  const drop = useMutation({
    mutationFn: (registrationId: number) => studentService.dropModule(studentId, registrationId),
    onMutate: (registrationId) => setDropPending(registrationId),
    onSuccess: () => {
      toast.success('Registration dropped.')
      qc.invalidateQueries({ queryKey: ['student-program-modules', studentId] })
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to drop registration'),
    onSettled: () => setDropPending(null),
  })

  if (dataQ.isLoading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="w-6 h-6 text-brand animate-spin" />
      </div>
    )
  }

  if (dataQ.isError) {
    return (
      <PlaceholderTab
        icon={BookOpen}
        title="Couldn't load curriculum"
        desc={(dataQ.error as any)?.response?.data?.message ?? 'An error occurred while loading the program curriculum.'}
      />
    )
  }

  const payload = dataQ.data?.data
  const program = payload?.program ?? null
  const groups  = payload?.groups ?? []

  if (!program) {
    return (
      <PlaceholderTab
        icon={BookOpen}
        title="No program assigned"
        desc="Assign this student to a program/option first — the curriculum will appear here once the link exists."
      />
    )
  }

  const totalModules = groups.reduce((acc, g) => acc + (g.modules?.length ?? 0), 0)
  const allModules   = groups.flatMap(g => g.modules)
  const completed    = allModules.filter(m => m.marks?.percentage != null && Number(m.marks.percentage) >= 50).length
  const failed       = allModules.filter(m => m.marks?.percentage != null && Number(m.marks.percentage) <  50).length
  const unmarked     = totalModules - completed - failed
  const scheduled    = allModules.filter(m => m.is_scheduled).length

  const downloadUrl = studentService.programModulesExportUrl(studentId)

  return (
    <div className="space-y-6">
      {/* Hero summary + download */}
      <div className="flex flex-wrap items-center gap-3">
        <SummaryCard tone="brand"   icon={BookOpen}      label="Modules"   value={totalModules} />
        <SummaryCard tone="indigo"  icon={CalendarClock} label="Scheduled" value={scheduled} />
        <SummaryCard tone="emerald" icon={CheckCircle}   label="Passed"    value={completed} />
        <SummaryCard tone="amber"   icon={AlertTriangle} label="Failed"    value={failed} />
        <SummaryCard tone="ink"     icon={Clock}         label="Unmarked"  value={unmarked} />
        <div className="ml-auto flex items-center gap-2">
          {isAdmin && (
            <button
              type="button"
              className="btn-secondary btn-sm flex items-center gap-1.5 border-violet-200 text-violet-700 hover:bg-violet-50 dark:border-violet-500/30 dark:text-violet-300 dark:hover:bg-violet-500/10"
              onClick={() => setPickerOpen(true)}
              title="Record an exemption mark on an unmarked module"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Exempt module
            </button>
          )}
          <a
            href={downloadUrl}
            className="btn-primary btn-sm flex items-center gap-1.5"
            target="_blank"
            rel="noreferrer"
          >
            <Download className="w-3.5 h-3.5" />
            Download CSV
          </a>
        </div>
      </div>

      {/* Program info pill */}
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-brand/10 text-brand flex items-center justify-center">
          <GraduationCap className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-ink-400 font-semibold">Program</p>
          <p className="text-[14px] font-bold text-ink-900 dark:text-white">{program.name}</p>
        </div>
        {program.code && (
          <span className="ml-2 font-mono text-[12px] bg-ink-100 dark:bg-ink-800 text-ink-700 dark:text-ink-200 px-2 py-1 rounded">
            {program.code}
          </span>
        )}
      </div>

      {/* Per-level tables */}
      {groups.length === 0 ? (
        <PlaceholderTab
          icon={BookOpen}
          title="Curriculum is empty"
          desc="No modules are mapped to this program yet. Once an admin imports them, they'll appear here."
        />
      ) : (
        groups.map((g) => (
          <div key={`${g.level_id ?? 'none'}-${g.level_name}`} className="card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-ink-100 dark:border-ink-700 bg-ink-50 dark:bg-ink-800/40 flex items-center gap-2">
              <span className="text-[12px] font-semibold text-ink-700 dark:text-ink-200">{g.level_name}</span>
              <span className="text-[11px] font-semibold text-ink-400 bg-ink-100 dark:bg-ink-800 px-1.5 py-0.5 rounded-full">
                {g.modules.length} module{g.modules.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-ink-50/60 dark:bg-ink-800/30 border-b border-ink-100 dark:border-ink-700">
                  <tr className="text-ink-400 text-[10px] uppercase">
                    <th className="px-3 py-2 font-bold w-[60px]">Order</th>
                    <th className="px-3 py-2 font-bold">Code</th>
                    <th className="px-3 py-2 font-bold">Module</th>
                    <th className="px-3 py-2 font-bold text-center">Credits</th>
                    <th className="px-3 py-2 font-bold text-center">CAT</th>
                    <th className="px-3 py-2 font-bold text-center">Assg</th>
                    <th className="px-3 py-2 font-bold text-center">Exam</th>
                    <th className="px-3 py-2 font-bold text-center">Marks/100</th>
                    <th className="px-3 py-2 font-bold text-center">Grade</th>
                    <th className="px-3 py-2 font-bold">Term</th>
                    <th className="px-3 py-2 font-bold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 dark:divide-ink-700">
                  {g.modules.map((m) => {
                    const isExempted   = !!m.marks?.is_exempted
                    const hasMarks     = !!m.marks
                    const isRegistered = m.registration?.status === 'registered'
                    return (
                    <tr
                      key={`${g.level_id ?? 'na'}-${m.module_id}`}
                      className={`hover:bg-ink-50/50 dark:hover:bg-ink-700/20 ${isExempted ? 'bg-violet-50/40 dark:bg-violet-500/5' : ''}`}
                    >
                      <td className="px-3 py-2 text-ink-500 tabular-nums">{m.module_order ?? '—'}</td>
                      <td className="px-3 py-2 font-mono">{m.module_code}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span>{m.module_name}</span>
                          {m.is_scheduled ? (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
                              title={[m.schedule?.modes, m.schedule?.semesters, m.schedule?.years].filter(Boolean).join(' · ') || 'Scheduled'}
                            >
                              <CalendarClock className="w-3 h-3" /> Scheduled
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-ink-100 text-ink-500 dark:bg-ink-700/40 dark:text-ink-300"
                              title="No offering scheduled for this module yet"
                            >
                              <CalendarOff className="w-3 h-3" /> Not scheduled
                            </span>
                          )}
                          {isRegistered && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                              title={`Registered${m.registration?.term_label ? ` · ${m.registration.term_label}` : ''}${m.registration?.year_label ? ` · ${m.registration.year_label}` : ''}`}
                            >
                              <CheckCircle className="w-3 h-3" /> Registered
                            </span>
                          )}
                          {isExempted && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
                              title={m.marks?.exemption_reason ?? 'Exempted'}
                            >
                              <Sparkles className="w-3 h-3" /> Exempted
                            </span>
                          )}
                        </div>
                        {m.is_scheduled && (m.schedule?.modes || m.schedule?.semesters || m.schedule?.years) && (
                          <p className="text-[11px] text-ink-400 mt-0.5">
                            {[m.schedule?.modes, m.schedule?.semesters, m.schedule?.years].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">{m.module_credits ?? '—'}</td>
                      <td className="px-3 py-2 text-center">
                        {isExempted ? <span className="text-ink-400">—</span> : (
                          <>
                            {tFmt(m.marks?.cat_marks)}
                            {m.marks?.cat_max != null && (
                              <span className="text-ink-400 text-[11px]">/{Number(m.marks.cat_max) || '—'}</span>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {isExempted ? <span className="text-ink-400">—</span> : (
                          <>
                            {tFmt(m.marks?.assignment_marks)}
                            {m.marks?.assignment_max != null && (
                              <span className="text-ink-400 text-[11px]">/{Number(m.marks.assignment_max) || '—'}</span>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {isExempted ? <span className="text-ink-400">—</span> : (
                          <>
                            {tFmt(m.marks?.exam_marks)}
                            {m.marks?.exam_max != null && (
                              <span className="text-ink-400 text-[11px]">/{Number(m.marks.exam_max) || '—'}</span>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center font-semibold">
                        {m.marks?.percentage != null ? Math.round(Number(m.marks.percentage)) : '—'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {m.marks?.grade ? <TGradePill grade={m.marks.grade} /> : <span className="text-ink-400">—</span>}
                      </td>
                      <td className="px-3 py-2 text-ink-500 text-[12px]">
                        {isExempted ? (
                          <span className="italic text-violet-700 dark:text-violet-300">
                            {m.marks?.exemption_reason || 'Exemption granted'}
                          </span>
                        ) : (
                          <>
                            {m.marks?.term_label ?? <span className="text-ink-400">—</span>}
                            {m.marks?.year_label && <span className="text-ink-400 ml-1">· {m.marks.year_label}</span>}
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {hasMarks ? (
                          isExempted && isAdmin ? (
                            <button
                              type="button"
                              className="btn-ghost btn-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                              disabled={deleteExemption.isPending}
                              onClick={() => {
                                if (!m.marks?.mark_id) return
                                if (!confirm(`Remove exemption for ${m.module_code}?`)) return
                                deleteExemption.mutate(m.marks.mark_id)
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Remove
                            </button>
                          ) : (
                            <span className="text-ink-300">—</span>
                          )
                        ) : isRegistered ? (
                          <button
                            type="button"
                            className="btn-ghost btn-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                            disabled={dropPending === m.registration!.id || drop.isPending}
                            onClick={() => {
                              if (!confirm(`Drop ${m.module_code} from this student's enrollments?`)) return
                              drop.mutate(m.registration!.id)
                            }}
                            title={`Registered${m.registration?.term_label ? ` · ${m.registration.term_label}` : ''}`}
                          >
                            {dropPending === m.registration!.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <MinusCircle className="w-3.5 h-3.5" />
                            )}
                            Drop
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={`btn-secondary btn-sm ${m.is_scheduled ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-500/10' : ''}`}
                            disabled={!m.is_scheduled || enrollPending === m.module_id || enroll.isPending}
                            onClick={() => enroll.mutate(m.module_id)}
                            title={m.is_scheduled
                              ? `Enroll into ${m.module_code}`
                              : 'This module has no scheduled offering yet — schedule it before enrolling.'}
                          >
                            {enrollPending === m.module_id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <PlusCircle className="w-3.5 h-3.5" />
                            )}
                            Enroll
                          </button>
                        )}
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {exempting && (
        <ExemptionModal
          studentId={studentId}
          studentRegnumber={student?.regnumber ?? ''}
          moduleId={exempting.moduleId}
          moduleCode={exempting.moduleCode}
          moduleName={exempting.moduleName}
          onClose={() => setExempting(null)}
        />
      )}

      {pickerOpen && (
        <ExemptionPickerModal
          studentId={studentId}
          studentRegnumber={student?.regnumber ?? ''}
          modules={allModules}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}

function ExemptionModal({
  studentId, studentRegnumber, moduleId, moduleCode, moduleName, onClose,
}: {
  studentId: number
  studentRegnumber: string
  moduleId: number
  moduleCode: string
  moduleName: string
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [percentage, setPercentage] = useState<string>('')
  const [reason, setReason] = useState<string>('')
  const [termId, setTermId] = useState<number>(0)

  const termsQ = useQuery({
    queryKey: ['academic', 'terms'],
    queryFn: () => academicService.listTerms(),
    staleTime: 60_000,
  })
  const terms = termsQ.data?.data ?? []
  // Pre-select the current term once the list arrives.
  useEffect(() => {
    if (!termId && terms.length) {
      const current = terms.find((t: any) => t.is_current) ?? terms[0]
      if (current?.id) setTermId(current.id)
    }
  }, [terms, termId])

  const create = useMutation({
    mutationFn: () => studentService.createExemption(studentId, {
      module_id:        moduleId,
      academic_term_id: termId,
      percentage:       Number(percentage),
      reason:           reason.trim() || null,
    }),
    onSuccess: () => {
      toast.success('Exemption recorded.')
      qc.invalidateQueries({ queryKey: ['student-program-modules', studentId] })
      qc.invalidateQueries({ queryKey: ['student-marks', studentRegnumber] })
      onClose()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to record exemption'),
  })

  const pctNum = Number(percentage)
  const valid  = termId > 0 && Number.isFinite(pctNum) && pctNum >= 0 && pctNum <= 100

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 pt-20">
      <div className="bg-white dark:bg-ink-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="p-5 border-b border-ink-100 dark:border-ink-800 flex justify-between items-center bg-violet-50 dark:bg-violet-500/10">
          <div>
            <h2 className="text-lg font-bold text-ink-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-600" /> Exempt module
            </h2>
            <p className="text-[12px] text-ink-500 mt-0.5">
              <span className="font-mono">{moduleCode}</span> · {moduleName}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          className="p-5 space-y-4"
          onSubmit={(e) => { e.preventDefault(); if (valid) create.mutate() }}
        >
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">
              Academic term <span className="text-red-500">*</span>
            </label>
            <select
              className="input w-full cursor-pointer bg-white dark:bg-ink-900"
              value={termId || ''}
              onChange={(e) => setTermId(Number(e.target.value))}
              required
            >
              <option value="" disabled>Select term…</option>
              {terms.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.label}{t.is_current ? ' (current)' : ''}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-ink-500 mt-1">
              The term the exemption is recorded against — usually the term the student would have sat the module.
            </p>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">
              Equivalence mark / 100 <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={percentage}
              onChange={(e) => setPercentage(e.target.value)}
              className="input w-full"
              placeholder="e.g. 75"
              required
            />
            <p className="text-[11px] text-ink-500 mt-1">
              Counts as the student's mark for this module on the transcript.
            </p>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">
              Reason
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input w-full"
              placeholder="e.g. Equivalence from prior institution; transferred credit."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-ink-100 dark:border-ink-800">
            <button type="button" onClick={onClose} className="btn-secondary px-4">Cancel</button>
            <button type="submit" disabled={!valid || create.isPending} className="btn-primary px-4">
              {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Record exemption
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}

/**
 * Toolbar-driven exemption picker. Lists every unmarked module in the
 * student's curriculum so the admin can pick one, enter an equivalence mark,
 * a reason, and confirm — all in one dialog. Reuses the same backend
 * exemption endpoint as the per-row flow, just with the module chosen here
 * instead of pre-selected by the row.
 */
function ExemptionPickerModal({
  studentId, studentRegnumber, modules, onClose,
}: {
  studentId: number
  studentRegnumber: string
  modules: import('@/services/studentService').ProgramModuleRow[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [moduleId, setModuleId] = useState<number>(0)
  const [percentage, setPercentage] = useState<string>('')
  const [reason, setReason] = useState<string>('')
  const [termId, setTermId] = useState<number>(0)

  const termsQ = useQuery({
    queryKey: ['academic', 'terms'],
    queryFn: () => academicService.listTerms(),
    staleTime: 60_000,
  })
  const terms = termsQ.data?.data ?? []
  useEffect(() => {
    if (!termId && terms.length) {
      const current = terms.find((t: any) => t.is_current) ?? terms[0]
      if (current?.id) setTermId(current.id)
    }
  }, [terms, termId])

  // Only modules with no marks at all can be exempted — exempting one that
  // already has a real grade would clobber it.
  const unmarked = useMemo(() => modules.filter(m => !m.marks), [modules])
  const selected = unmarked.find(m => m.module_id === moduleId) ?? null

  const create = useMutation({
    mutationFn: () => studentService.createExemption(studentId, {
      module_id:        moduleId,
      academic_term_id: termId,
      percentage:       Number(percentage),
      reason:           reason.trim() || null,
    }),
    onSuccess: () => {
      toast.success('Exemption recorded.')
      qc.invalidateQueries({ queryKey: ['student-program-modules', studentId] })
      qc.invalidateQueries({ queryKey: ['student-marks', studentRegnumber] })
      onClose()
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to record exemption'),
  })

  const pctNum = Number(percentage)
  const valid  = moduleId > 0
                 && termId > 0
                 && Number.isFinite(pctNum) && pctNum >= 0 && pctNum <= 100
                 && reason.trim().length > 0

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 pt-20">
      <div className="bg-white dark:bg-ink-900 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="p-5 border-b border-ink-100 dark:border-ink-800 flex justify-between items-center bg-violet-50 dark:bg-violet-500/10">
          <div>
            <h2 className="text-lg font-bold text-ink-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-600" /> Exempt a module
            </h2>
            <p className="text-[12px] text-ink-500 mt-0.5">
              Pick an unmarked module and record an equivalence mark. The student's transcript will reflect it as if they sat the module.
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          className="p-5 space-y-4"
          onSubmit={(e) => { e.preventDefault(); if (valid) create.mutate() }}
        >
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">
              Module <span className="text-red-500">*</span>
            </label>
            {unmarked.length === 0 ? (
              <div className="text-[12px] text-ink-500 p-3 rounded-md border border-dashed border-ink-200 dark:border-ink-700">
                Every module in the curriculum already has a mark — there's nothing left to exempt.
              </div>
            ) : (
              <select
                className="input w-full cursor-pointer bg-white dark:bg-ink-900"
                value={moduleId || ''}
                onChange={(e) => setModuleId(Number(e.target.value))}
                required
              >
                <option value="" disabled>Select an unmarked module…</option>
                {unmarked.map((m) => (
                  <option key={m.module_id} value={m.module_id}>
                    {m.module_code} — {m.module_name}
                  </option>
                ))}
              </select>
            )}
            {selected && (
              <p className="text-[11px] text-ink-500 mt-1">
                {selected.module_credits ?? '—'} credits
                {selected.is_scheduled ? ' · currently scheduled' : ' · not currently scheduled'}
              </p>
            )}
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">
              Academic term <span className="text-red-500">*</span>
            </label>
            <select
              className="input w-full cursor-pointer bg-white dark:bg-ink-900"
              value={termId || ''}
              onChange={(e) => setTermId(Number(e.target.value))}
              required
            >
              <option value="" disabled>Select term…</option>
              {terms.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.label}{t.is_current ? ' (current)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">
              Equivalence mark / 100 <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={percentage}
              onChange={(e) => setPercentage(e.target.value)}
              className="input w-full"
              placeholder="e.g. 75"
              required
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input w-full"
              placeholder="e.g. Equivalence from prior institution; transferred credit."
              required
            />
            <p className="text-[11px] text-ink-500 mt-1">
              A reason is required so the audit log explains why this module was exempted.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-ink-100 dark:border-ink-800">
            <button type="button" onClick={onClose} className="btn-secondary px-4">Cancel</button>
            <button type="submit" disabled={!valid || create.isPending} className="btn-primary px-4">
              {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Confirm exemption
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}


function SummaryCard({ tone, icon: Icon, label, value }: {
  tone: 'brand' | 'emerald' | 'amber' | 'ink' | 'indigo'; icon: any; label: string; value: number
}) {
  const cls = {
    brand: 'bg-brand/10 text-brand',
    emerald: 'bg-mint-100 text-mint-700',
    amber: 'bg-amber-100 text-amber-700',
    ink: 'bg-ink-100 text-ink-600',
    indigo: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
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
  const { register, handleSubmit, watch, setValue } = useForm({
    defaultValues: {
      fname: student.fname,
      lname: student.lname,
      email: student.email || '',
      phone: student.phone || '',
      gender: student.gender || '',
      nationality: student.nationality || '',
      // Catalog program (options.id) — the new authoritative academic link.
      std_option: student.std_option ? String(student.std_option) : '',
      current_level: student.current_level || '',
      student_state: student.student_state || 'active',
      birthdate: student.birthdate || '',
      regnumber: student.regnumber || '',
      acc_year: student.acc_year || '',
    }
  })

  // Surface the auto-derived faculty/department so the user knows which
  // home faculty the program belongs to before they save.
  const optionFacets = (stats?.facets?.options ?? []) as Array<{
    value: string; label: string; department_id: number | null; faculty_id: number | null
  }>
  const watchedOption = watch('std_option')
  const selectedOption = optionFacets.find(o => String(o.value) === String(watchedOption)) ?? null
  const facultyName    = stats?.facets?.faculty?.find((f: any) => String(f.value) === String(selectedOption?.faculty_id))?.label
                       ?? (selectedOption?.faculty_id ? `Faculty #${selectedOption.faculty_id}` : '')
  const departmentName = stats?.facets?.department?.find((f: any) => String(f.value) === String(selectedOption?.department_id))?.label
                       ?? (selectedOption?.department_id ? `Department #${selectedOption.department_id}` : '')

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
  // Suppress "unused" warning for the helper React Hook Form gives us — we use it
  // implicitly via {...register(...)} on the std_option select.
  void setValue

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 pt-10 overflow-y-auto animate-in fade-in duration-200">
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
              <div className="sm:col-span-2">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5 block">
                  Program / Option <span className="text-red-500">*</span>
                </label>
                <select {...register('std_option')} className="input w-full cursor-pointer bg-white dark:bg-ink-900" required>
                  <option value="">Select Program...</option>
                  {optionFacets.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {selectedOption && (
                  <p className="text-[11px] text-ink-500 mt-1.5">
                    Faculty/department auto-derived:
                    {facultyName    ? <> <span className="font-semibold">{facultyName}</span></>    : null}
                    {departmentName ? <> · <span className="font-semibold">{departmentName}</span></> : null}
                  </p>
                )}
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
    </div>,
    document.body
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

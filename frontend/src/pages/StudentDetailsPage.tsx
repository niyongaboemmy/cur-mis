import { useParams, Link, useLocation } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { studentService } from '@/services/studentService'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Loader2, User, Mail, Phone, Calendar,
  GraduationCap, Globe2, Building2, BookOpen,
  CheckCircle, Clock, FileText, BarChart, Edit, Save, X
} from 'lucide-react'

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
        {tab === 'attendance' && <PlaceholderTab icon={Clock} title="Attendance Records" desc="Student attendance logs and summaries will appear here." />}
        {tab === 'documents' && <PlaceholderTab icon={FileText} title="Student Documents" desc="Uploaded requirements, transcripts, and ID copies." />}
        {tab === 'modules' && <PlaceholderTab icon={BookOpen} title="Registered Modules" desc="Current and past course enrollments and grades." />}
        {tab === 'finance' && <PlaceholderTab icon={BarChart} title="Financial Overview" desc="Tuition fees, payments, and balances." />}
        {tab === 'transcript' && <PlaceholderTab icon={FileText} title="Academic Transcript" desc="Detailed grades and academic history across all levels." />}
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
    </div>,
    document.body
  )
}

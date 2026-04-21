import {
  BookMarked,
  Building2,
  Bus,
  CalendarDays,
  ClipboardCheck,
  LayoutGrid,
  Megaphone,
  BookOpen,
  Users,
  GraduationCap,
  UserPlus,
  Receipt,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useLocation } from 'react-router-dom'
import ModulePreview from '@/components/layout/ModulePreview'

type Meta = {
  icon:     LucideIcon
  title:    string
  subtitle: string
  tone:     'lilac' | 'sky' | 'peach' | 'mint'
  features: { label: string; status: 'done' | 'soon' | 'planned' }[]
}

const ROUTE_META: Record<string, Meta> = {
  '/library': {
    icon: BookMarked, tone: 'mint',
    title: 'Library',
    subtitle: 'Books, journals and digital resources for students and staff.',
    features: [
      { label: 'Catalogue search',      status: 'soon' },
      { label: 'Loan management',       status: 'planned' },
      { label: 'Digital reading rooms', status: 'planned' },
      { label: 'Overdue reminders',     status: 'planned' },
    ],
  },
  '/class': {
    icon: LayoutGrid, tone: 'lilac',
    title: 'Classes',
    subtitle: 'Class rooms, groups and assignment of teachers to sections.',
    features: [
      { label: 'Class directory',     status: 'soon' },
      { label: 'Section management',  status: 'planned' },
      { label: 'Room allocation',     status: 'planned' },
    ],
  },
  '/subject': {
    icon: BookOpen, tone: 'sky',
    title: 'Subjects',
    subtitle: 'All academic subjects taught across CUR programs.',
    features: [
      { label: 'Subject catalogue', status: 'soon' },
      { label: 'Credits & hours',   status: 'planned' },
      { label: 'Syllabus docs',     status: 'planned' },
    ],
  },
  '/routine': {
    icon: CalendarDays, tone: 'peach',
    title: 'Class Routine',
    subtitle: 'Weekly class schedule — who teaches what, where and when.',
    features: [
      { label: 'Weekly timetable', status: 'soon' },
      { label: 'Teacher view',     status: 'planned' },
      { label: 'Student view',     status: 'planned' },
    ],
  },
  '/attendance': {
    icon: ClipboardCheck, tone: 'mint',
    title: 'Attendance',
    subtitle: 'Track student and staff attendance across all sessions.',
    features: [
      { label: 'Daily roll-call',    status: 'soon' },
      { label: 'Monthly reports',    status: 'planned' },
      { label: 'Leave requests',     status: 'planned' },
    ],
  },
  '/notice': {
    icon: Megaphone, tone: 'peach',
    title: 'Notice Board',
    subtitle: 'University-wide announcements, circulars and alerts.',
    features: [
      { label: 'Create & publish',   status: 'soon' },
      { label: 'Audience targeting', status: 'planned' },
      { label: 'Pin & archive',      status: 'planned' },
    ],
  },
  '/transport': {
    icon: Bus, tone: 'sky',
    title: 'Transport',
    subtitle: 'Routes, vehicles and driver assignments for CUR shuttles.',
    features: [
      { label: 'Fleet list',        status: 'soon' },
      { label: 'Route planning',    status: 'planned' },
      { label: 'Driver schedules',  status: 'planned' },
    ],
  },
  '/hostel': {
    icon: Building2, tone: 'lilac',
    title: 'Hostel',
    subtitle: 'Student accommodation — rooms, occupancy and maintenance.',
    features: [
      { label: 'Room inventory',       status: 'soon' },
      { label: 'Booking & allocation', status: 'planned' },
      { label: 'Maintenance tickets',  status: 'planned' },
    ],
  },
  '/teachers': {
    icon: Users, tone: 'sky',
    title: 'Teachers',
    subtitle: 'The CUR faculty — lecturers, professors and support staff.',
    features: [
      { label: 'Staff directory',       status: 'soon' },
      { label: 'Department assignment', status: 'planned' },
      { label: 'Qualifications',        status: 'planned' },
    ],
  },
  '/teachers/schedules': {
    icon: CalendarDays, tone: 'peach',
    title: 'Teacher Schedules',
    subtitle: 'Weekly teaching assignments for every faculty member.',
    features: [
      { label: 'Schedule view',     status: 'soon' },
      { label: 'Conflict detection', status: 'planned' },
    ],
  },
  '/students/new': {
    icon: UserPlus, tone: 'mint',
    title: 'Admissions',
    subtitle: 'Incoming student applications for the next intake.',
    features: [
      { label: 'Application form',    status: 'soon' },
      { label: 'Review & decisions',  status: 'planned' },
      { label: 'Offer letters',       status: 'planned' },
    ],
  },
  '/students/alumni': {
    icon: GraduationCap, tone: 'lilac',
    title: 'Alumni',
    subtitle: 'CUR alumni directory, reunions and contributions.',
    features: [
      { label: 'Alumni directory',   status: 'soon' },
      { label: 'Engagement events',  status: 'planned' },
    ],
  },
  '/account/billing': {
    icon: Receipt, tone: 'peach',
    title: 'Billing',
    subtitle: 'Invoices, statements and payment history.',
    features: [
      { label: 'Invoice generation', status: 'soon' },
      { label: 'Statements export',  status: 'planned' },
    ],
  },
  '/account/salaries': {
    icon: Wallet, tone: 'mint',
    title: 'Salaries',
    subtitle: 'Monthly payroll for faculty and staff.',
    features: [
      { label: 'Payroll runs',      status: 'soon' },
      { label: 'Tax calculations',  status: 'planned' },
      { label: 'Payslip delivery',  status: 'planned' },
    ],
  },
  '/exams/results': {
    icon: BookOpen, tone: 'lilac',
    title: 'Exam Results',
    subtitle: 'All examination results by session, program and student.',
    features: [
      { label: 'Results entry',        status: 'soon' },
      { label: 'Transcript builder',   status: 'planned' },
      { label: 'Grade analytics',      status: 'planned' },
    ],
  },
}

const DEFAULT: Meta = {
  icon: LayoutGrid, tone: 'lilac',
  title: 'Coming soon',
  subtitle: 'This module is still being built.',
  features: [{ label: 'Module placeholder', status: 'planned' }],
}

export default function ComingSoonPage() {
  const { pathname } = useLocation()
  const meta = ROUTE_META[pathname] ?? DEFAULT

  return (
    <ModulePreview
      icon={meta.icon}
      title={meta.title}
      subtitle={meta.subtitle}
      tone={meta.tone}
      features={meta.features}
    />
  )
}

import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  GraduationCap,
  LayoutDashboard,
  Users,
  FileText,
  BookOpen,
  Upload,
  Search,
  ShieldCheck,
  CalendarDays,
  Wallet,
  ClipboardList,
  Briefcase,
  Sparkles,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { PERMISSIONS } from '@/constants'

/* ─── animation variants ─────────────────────────────────────────── */
const fadeUp = {
  hidden:  { opacity: 0, y: 20 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.45, ease: 'easeOut' } }),
}

/* ─── helpers ────────────────────────────────────────────────────── */
function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function formatNow(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
}

/* ─── quick-action cards ─────────────────────────────────────────── */
/**
 * Each card declares which roles or permissions unlock it. The visible list
 * is derived from the signed-in user — no hardcoded "everyone in group X
 * sees the same thing" buckets.
 *
 *   - `roles`        → only these exact roles see the card (overrides perms)
 *   - `permissions`  → ANY of these RBAC slugs grants access
 *   - `hideForRoles` → explicit denylist for product-level decisions
 *   - both undefined → visible to every authenticated user
 */
interface QA {
  to: string
  icon: React.ElementType
  label: string
  sub: string
  accent: string
  roles?: string[]
  permissions?: string[]
  hideForRoles?: string[]
}

const QUICK_ACTIONS: QA[] = [
  // Universal — every signed-in user
  {
    to: '/dashboard',
    icon: LayoutDashboard,
    label: 'Dashboard',
    sub: 'Overview & key metrics',
    accent: 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300',
  },

  // Applicant-only
  {
    to: '/applicant',
    icon: ClipboardList,
    label: 'My Application',
    sub: 'View & edit details',
    accent: 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300',
    roles: ['applicant'],
  },
  {
    to: '/applicant/documents',
    icon: Upload,
    label: 'Documents',
    sub: 'Upload required files',
    accent: 'bg-accent-sky text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
    roles: ['applicant'],
  },
  {
    to: '/apply/track',
    icon: Search,
    label: 'Track Status',
    sub: 'Check your progress',
    accent: 'bg-accent-mint text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    roles: ['applicant'],
  },
  {
    to: '/apply',
    icon: FileText,
    label: 'New Application',
    sub: 'Start fresh application',
    accent: 'bg-accent-peach text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    roles: ['applicant'],
  },

  // Admissions admins
  {
    to: '/admin/admissions',
    icon: GraduationCap,
    label: 'Admissions',
    sub: 'Manage applications',
    accent: 'bg-accent-sky text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
    permissions: [
      PERMISSIONS.MANAGE_STUDENT_APPLICATIONS,
      PERMISSIONS.VERIFY_DOCUMENTS,
      PERMISSIONS.MANAGE_ADMISSIONS,
      PERMISSIONS.MANAGE_ADMISSION_REQUIREMENTS,
    ],
  },

  // System admins
  {
    to: '/users',
    icon: Users,
    label: 'Users',
    sub: 'Manage system users',
    accent: 'bg-accent-peach text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    permissions: [PERMISSIONS.MANAGE_USERS],
  },
  {
    to: '/roles',
    icon: ShieldCheck,
    label: 'Roles',
    sub: 'Permissions & access',
    accent: 'bg-gold-50 text-gold-700 dark:bg-yellow-900/30 dark:text-yellow-300',
    permissions: [PERMISSIONS.MANAGE_ROLES],
  },

  // Academics — hidden from hr_manager (mirrors sidebar policy)
  {
    to: '/academic/management',
    icon: BookOpen,
    label: 'Academics',
    sub: 'Degrees, programs & more',
    accent: 'bg-accent-mint text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    hideForRoles: ['hr_manager'],
    permissions: [
      PERMISSIONS.MANAGE_ACADEMICS,
      PERMISSIONS.MANAGE_DEGREES,
      PERMISSIONS.MANAGE_FACILITIES,
      PERMISSIONS.MANAGE_DEPARTMENTS,
      PERMISSIONS.MANAGE_OPTIONS,
      PERMISSIONS.MANAGE_LEVELS,
      PERMISSIONS.MANAGE_SCHOOLS,
      PERMISSIONS.MANAGE_ACADEMIC_YEARS,
      PERMISSIONS.MANAGE_ACADEMIC_TERMS,
    ],
  },

  // Students registry
  {
    to: '/students',
    icon: GraduationCap,
    label: 'Students',
    sub: 'Student registry',
    accent: 'bg-accent-sky text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
    permissions: [PERMISSIONS.VIEW_STUDENTS],
  },

  // Modules — anyone holding any module-level perm
  {
    to: '/modules',
    icon: BookOpen,
    label: 'Modules',
    sub: 'Courses & scheduling',
    accent: 'bg-accent-mint text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    permissions: [
      PERMISSIONS.MANAGE_MODULES,
      PERMISSIONS.MANAGE_MODULE_SCHEDULES,
      PERMISSIONS.MANAGE_MODULE_ASSIGNMENTS,
      PERMISSIONS.MANAGE_MODULE_REGISTRATIONS,
      PERMISSIONS.VIEW_MY_MODULES,
    ],
  },

  // Calendar / academic terms (still useful as a shortcut for staff who set
  // up year + term boundaries)
  {
    to: '/academic/settings',
    icon: CalendarDays,
    label: 'Academic settings',
    sub: 'Years & terms',
    accent: 'bg-accent-lilac text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    permissions: [
      PERMISSIONS.MANAGE_ACADEMIC_YEARS,
      PERMISSIONS.MANAGE_ACADEMIC_TERMS,
      PERMISSIONS.VIEW_SYSTEM_BASICS,
    ],
  },

  // HR
  {
    to: '/hr/staff',
    icon: Briefcase,
    label: 'HR',
    sub: 'Staff & payroll',
    accent: 'bg-accent-peach text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    permissions: [PERMISSIONS.VIEW_HR_EMPLOYEES, PERMISSIONS.MANAGE_HR_EMPLOYEES],
  },

  // Finance
  {
    to: '/finance',
    icon: Wallet,
    label: 'Finance',
    sub: 'Fees & billing',
    accent: 'bg-accent-lilac text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    permissions: [PERMISSIONS.VIEW_FINANCE, PERMISSIONS.MANAGE_FINANCE],
  },
]

/* ─── quick-action card ──────────────────────────────────────────── */
function ActionCard({ qa, index }: { qa: QA; index: number }) {
  return (
    <motion.div custom={index + 4} variants={fadeUp} initial="hidden" animate="visible">
      <Link
        to={qa.to}
        className="group card p-4 flex items-center gap-3.5 hover:border-brand/40 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
      >
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${qa.accent} transition-all group-hover:scale-110`}>
          <qa.icon className="w-[18px] h-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold text-ink-900 dark:text-white leading-tight">{qa.label}</p>
          <p className="text-[11.5px] text-ink-500 truncate mt-0.5">{qa.sub}</p>
        </div>
        <ArrowRight className="w-3.5 h-3.5 text-ink-300 shrink-0 group-hover:text-brand group-hover:translate-x-0.5 transition-all" />
      </Link>
    </motion.div>
  )
}

/* ─── main component ─────────────────────────────────────────────── */
export default function WelcomePage() {
  const { user } = useAuthStore()

  const role        = user?.role ?? ''
  const userPerms   = user?.permissions ?? []
  const isApplicant = role === 'applicant' || user?.is_applicant
  const isSuperadmin = role === 'superadmin'

  const firstName = useMemo(() => user?.full_name?.split(' ')[0] ?? 'there', [user])
  const roleLabel = useMemo(() => {
    if (isApplicant) return 'Applicant'
    return user?.role_name ?? role ?? 'Staff'
  }, [user, isApplicant, role])

  // Per-role filter — same model as the sidebar in MainLayout.
  const actions = useMemo(() => {
    return QUICK_ACTIONS.filter((qa) => {
      if (qa.hideForRoles?.includes(role)) return false
      if (qa.roles && qa.roles.length > 0)  return qa.roles.includes(role)
      // No permission requirement → universally visible
      if (!qa.permissions || qa.permissions.length === 0) return true
      // Superadmin sees every permission-gated card; everyone else needs a match
      if (isSuperadmin) return true
      return qa.permissions.some((p) => userPerms.includes(p))
    })
  }, [role, userPerms, isSuperadmin])

  const dashLink  = isApplicant ? '/applicant' : '/dashboard'
  const greeting  = getGreeting()
  const dateLabel = formatNow()

  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col">

      {/* ── hero banner ─────────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary-800 via-primary-700 to-primary-900 dark:from-ink-900 dark:via-primary-950 dark:to-ink-900">

        {/* decorative orbs */}
        <div className="pointer-events-none absolute -top-20 -right-20 w-80 h-80 rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 w-72 h-72 rounded-full bg-gold-400/10 blur-3xl" />
        <div className="pointer-events-none absolute top-1/2 right-1/4 w-40 h-40 rounded-full bg-primary-400/10 blur-2xl" />

        <div className="relative max-w-[1200px] mx-auto px-6 py-14 md:py-20">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8">

            {/* left — greeting */}
            <div className="max-w-xl">
              {/* role badge */}
              <motion.div
                custom={0} variants={fadeUp} initial="hidden" animate="visible"
                className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/20 px-3 py-1 mb-5"
              >
                <Sparkles className="w-3 h-3 text-gold-300" />
                <span className="text-[11.5px] font-medium text-white/80 uppercase tracking-wider">{roleLabel}</span>
              </motion.div>

              <motion.h1
                custom={1} variants={fadeUp} initial="hidden" animate="visible"
                className="text-[32px] md:text-[40px] font-semibold text-white tracking-tight leading-tight"
              >
                {greeting},<br />
                <span className="text-gold-300">{firstName}.</span>
              </motion.h1>

              <motion.p
                custom={2} variants={fadeUp} initial="hidden" animate="visible"
                className="mt-3 text-[14px] text-white/60 flex items-center gap-2"
              >
                <CalendarDays className="w-4 h-4 text-white/40 shrink-0" />
                {dateLabel}
              </motion.p>

              <motion.p
                custom={3} variants={fadeUp} initial="hidden" animate="visible"
                className="mt-4 text-[14px] text-white/70 leading-relaxed max-w-sm"
              >
                You are now signed in to <span className="text-white font-medium">CUR-MIS</span>.
                Use the shortcuts below or navigate to your dashboard to get started.
              </motion.p>
            </div>

            {/* right — primary CTA */}
            <motion.div
              custom={3} variants={fadeUp} initial="hidden" animate="visible"
              className="flex flex-col items-start md:items-end gap-3"
            >
              <Link
                to={dashLink}
                className="inline-flex items-center gap-2.5 rounded-xl bg-gold-400 hover:bg-gold-300 text-primary-900 font-semibold text-[14px] px-7 py-3.5 shadow-lg shadow-gold-400/30 hover:shadow-gold-400/50 transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
              >
                <LayoutDashboard className="w-4.5 h-4.5" />
                Go to Dashboard
                <ArrowRight className="w-4 h-4" />
              </Link>
              <p className="text-[11.5px] text-white/40">
                {isApplicant ? 'Track your application' : 'View metrics and overview'}
              </p>
            </motion.div>

          </div>
        </div>
      </div>

      {/* ── quick actions ────────────────────────────────────────────── */}
      <div className="flex-1 bg-[rgb(var(--bg-app))] px-6 py-10">
        <div className="max-w-[1200px] mx-auto space-y-8">

          {/* section header */}
          <motion.div custom={4} variants={fadeUp} initial="hidden" animate="visible">
            <h2 className="text-[15px] font-semibold text-ink-900 dark:text-white">Quick navigation</h2>
            <p className="text-[12.5px] text-ink-500 mt-0.5">Jump straight to where you need to be</p>
          </motion.div>

          {/* cards grid */}
          {actions.length === 0 ? (
            <p className="text-[13px] text-ink-500">
              No shortcuts are configured for your role yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {actions.map((qa, i) => (
                <ActionCard key={qa.to} qa={qa} index={i} />
              ))}
            </div>
          )}

          {/* bottom strip */}
          <motion.div
            custom={actions.length + 5} variants={fadeUp} initial="hidden" animate="visible"
            className="pt-4 border-t border-ink-100 dark:border-ink-800 flex items-center justify-between flex-wrap gap-4"
          >
            <p className="text-[12.5px] text-ink-400">
              Signed in as <span className="font-medium text-ink-600 dark:text-ink-300">{user?.email}</span>
            </p>
            <Link
              to={dashLink}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand hover:text-brand/80 transition-colors"
            >
              Continue to dashboard <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </motion.div>

        </div>
      </div>
    </div>
  )
}

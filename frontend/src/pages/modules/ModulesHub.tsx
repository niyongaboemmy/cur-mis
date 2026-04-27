import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { BookOpen, CalendarDays, Users, GraduationCap, ClipboardList } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { PERMISSIONS } from '@/constants'

const TABS = [
  { to: '/modules/catalog',       label: 'Catalog',       icon: BookOpen,       permissions: [PERMISSIONS.MANAGE_MODULES] },
  { to: '/modules/scheduling',    label: 'Scheduling',    icon: CalendarDays,   permissions: [PERMISSIONS.MANAGE_MODULE_SCHEDULES] },
  { to: '/modules/assignments',   label: 'Assignments',   icon: Users,          permissions: [PERMISSIONS.MANAGE_MODULE_ASSIGNMENTS] },
  { to: '/modules/registrations', label: 'Registrations', icon: GraduationCap,  permissions: [PERMISSIONS.MANAGE_MODULE_REGISTRATIONS] },
  { to: '/modules/marks',         label: 'Marks',         icon: ClipboardList,  permissions: [
    PERMISSIONS.RECORD_MODULE_MARKS,
    PERMISSIONS.MANAGE_MODULE_MARKS,
    PERMISSIONS.VIEW_MODULE_MARKS,
  ] },
]

export default function ModulesHub() {
  const loc = useLocation()
  const user = useAuthStore((s) => s.user)
  const atIndex = loc.pathname === '/modules'

  const visible = TABS.filter((t) => {
    if (user?.role === 'superadmin') return true
    const userPerms = user?.permissions ?? []
    return t.permissions.some((p) => userPerms.includes(p))
  })

  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      <section className="card p-2">
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {visible.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                `inline-flex items-center gap-1.5 px-3 py-2 text-[13px] rounded-md whitespace-nowrap transition-colors ${
                  isActive || (atIndex && t.to.endsWith('/catalog'))
                    ? 'bg-brand/10 text-brand dark:bg-brand/25 dark:text-gold-400 font-semibold'
                    : 'text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-700/50'
                }`
              }
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </NavLink>
          ))}
        </div>
      </section>

      <Outlet />
    </div>
  )
}

import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Files, Handshake, ListChecks, Layers, Calendar } from 'lucide-react'

const TABS = [
  { to: '/admin/admissions/applications',   label: 'Applications',   icon: Files      },
  { to: '/admin/admissions/offers',         label: 'Offers',         icon: Handshake  },
  { to: '/admin/admissions/requirements',   label: 'Requirements',   icon: ListChecks },
  { to: '/admin/admissions/document-types', label: 'Document types', icon: Layers     },
  { to: '/admin/admissions/intakes',        label: 'Intakes',        icon: Calendar   },
]

export default function AdmissionsHub() {
  const loc    = useLocation()
  const atRoot = loc.pathname === '/admin/admissions'

  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      <section className="card p-2">
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                `inline-flex items-center gap-1.5 px-3 py-2 text-[13px] rounded-md whitespace-nowrap transition-colors ${
                  isActive || (atRoot && t.to.endsWith('/applications'))
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

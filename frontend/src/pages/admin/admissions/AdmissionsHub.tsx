import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Files, FileCheck2, Award, Handshake, ListChecks, Layers, Calendar } from 'lucide-react'
import { verificationService } from '@/services/admissionService'

const TABS = [
  { to: '/admin/admissions/applications',  label: 'Applications',   icon: Files,       badge: false },
  { to: '/admin/admissions/verifications', label: 'Verifications',  icon: FileCheck2,  badge: true  },
  { to: '/admin/admissions/merit',         label: 'Merit lists',    icon: Award,       badge: false },
  { to: '/admin/admissions/offers',        label: 'Offers',         icon: Handshake,   badge: false },
  { to: '/admin/admissions/requirements',  label: 'Requirements',   icon: ListChecks,  badge: false },
  { to: '/admin/admissions/document-types',label: 'Document types', icon: Layers,      badge: false },
  { to: '/admin/admissions/intakes',       label: 'Intakes',        icon: Calendar,    badge: false },
]

export default function AdmissionsHub() {
  const loc = useLocation()
  const atIndex = loc.pathname === '/admin/admissions'

  const pendingQ = useQuery({
    queryKey: ['admin', 'verifications', 'pending-count'],
    queryFn: () => verificationService.getPendingApplications(),
    refetchInterval: 30_000,
  })
  const pendingCount = pendingQ.data?.data?.total ?? 0

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
                  isActive || (atIndex && t.to.endsWith('/applications'))
                    ? 'bg-brand/10 text-brand dark:bg-brand/25 dark:text-gold-400 font-semibold'
                    : 'text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-700/50'
                }`
              }
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
              {t.badge && pendingCount > 0 && (
                <span className="ml-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </section>

      <Outlet />
    </div>
  )
}

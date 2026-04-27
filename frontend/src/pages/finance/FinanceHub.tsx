import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard, BookOpenCheck, Settings2, Award, BarChart3,
  Receipt, ShieldCheck, Wallet,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { PERMISSIONS } from '@/constants'
import { useQuery } from '@tanstack/react-query'
import { paymentService } from '@/services/financeService'

const TABS = [
  { to: '/finance',           label: 'Overview',   icon: LayoutDashboard, end: true,  permissions: [PERMISSIONS.VIEW_FINANCE, PERMISSIONS.MANAGE_FINANCE] },
  { to: '/finance/billing',   label: 'Billing',    icon: BookOpenCheck,   end: false, permissions: [PERMISSIONS.VIEW_FINANCE, PERMISSIONS.MANAGE_FINANCE] },
  { to: '/finance/approvals', label: 'Approvals',  icon: ShieldCheck,     end: false, permissions: [PERMISSIONS.MANAGE_FINANCE] },
  { to: '/finance/structures',label: 'Fee Rates',  icon: Settings2,       end: false, permissions: [PERMISSIONS.MANAGE_FINANCE] },
  { to: '/finance/bursaries', label: 'Bursaries',  icon: Award,           end: false, permissions: [PERMISSIONS.MANAGE_FINANCE] },
  { to: '/finance/expenses',  label: 'Expenses',   icon: Receipt,         end: false, permissions: [PERMISSIONS.MANAGE_FINANCE] },
  { to: '/finance/balance',   label: 'Balance',    icon: Wallet,          end: false, permissions: [PERMISSIONS.VIEW_FINANCE, PERMISSIONS.MANAGE_FINANCE] },
  { to: '/finance/clearance', label: 'Clearance',  icon: ShieldCheck,     end: false, permissions: [PERMISSIONS.VIEW_FINANCE, PERMISSIONS.MANAGE_FINANCE] },
  { to: '/finance/reports',   label: 'Reports',    icon: BarChart3,       end: false, permissions: [PERMISSIONS.VIEW_FINANCE, PERMISSIONS.MANAGE_FINANCE] },
]

export default function FinanceHub() {
  const user  = useAuthStore(s => s.user)
  const perms = user?.permissions ?? []
  const isSuper = user?.role === 'superadmin'

  const visible = TABS.filter(t =>
    isSuper || t.permissions.some(p => perms.includes(p))
  )

  // Poll pending payment count for the notification badge
  const pendingQ = useQuery({
    queryKey: ['finance', 'payments', 'pending-count'],
    queryFn: () => paymentService.getPendingCount(),
    refetchInterval: 30_000,
  })
  const pendingCount = pendingQ.data?.data?.count ?? 0

  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      <section className="card p-2">
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {visible.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `inline-flex items-center gap-1.5 px-3 py-2 text-[13px] rounded-md whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-brand/10 text-brand dark:bg-brand/25 dark:text-gold-400 font-semibold'
                    : 'text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-700/50'
                }`
              }
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
              {t.to === '/finance/approvals' && pendingCount > 0 && (
                <span className="ml-0.5 inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold bg-red-500 text-white rounded-full animate-pulse">
                  {pendingCount > 9 ? '9+' : pendingCount}
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

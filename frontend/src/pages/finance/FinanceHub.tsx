import { Outlet } from "react-router-dom";
import ResponsiveTabBar from "@/components/ui/ResponsiveTabBar";
import {
  LayoutDashboard,
  BookOpenCheck,
  Settings2,
  Award,
  BarChart3,
  Receipt,
  ShieldCheck,
  Wallet,
  Tag,
  GitMerge,
  FileText,
  CalendarClock,
  PiggyBank,
  LineChart,
  GraduationCap,
  Users,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useQuery } from "@tanstack/react-query";
import { paymentService } from "@/services/financeService";
import { PERMISSIONS } from "@/constants/permissions";
import { isSuperadmin } from "@/utils/permissions";

const TABS = [
  {
    to: "/finance",
    label: "Overview",
    icon: LayoutDashboard,
    end: true,
    permissions: [PERMISSIONS.VIEW_FINANCE_OVERVIEW],
  },
  {
    to: "/finance/billing",
    label: "Billing",
    icon: BookOpenCheck,
    end: false,
    permissions: [PERMISSIONS.VIEW_FINANCE_BILLING],
  },
  {
    to: "/finance/approvals",
    label: "Approvals",
    icon: ShieldCheck,
    end: false,
    permissions: [PERMISSIONS.VIEW_FINANCE_APPROVALS],
  },
  {
    to: "/finance/structures",
    label: "Fee Rates",
    icon: Settings2,
    end: false,
    permissions: [PERMISSIONS.VIEW_FINANCE_STRUCTURES],
  },
  {
    to: "/finance/pg-intl-structures",
    label: "PG/Intl Fees",
    icon: GraduationCap,
    end: false,
    permissions: [PERMISSIONS.VIEW_FINANCE_STRUCTURES],
  },
  {
    to: "/finance/students",
    label: "Student Directory",
    icon: Users,
    end: false,
    permissions: [PERMISSIONS.VIEW_STUDENT_DIRECTORY_FINANCE],
  },
  {
    to: "/finance/fee-types",
    label: "Fee Types",
    icon: Tag,
    end: false,
    permissions: [PERMISSIONS.MANAGE_FINANCE],
  },
  {
    to: "/finance/per-credit-rates",
    label: "Per-Credit Rates",
    icon: Settings2,
    end: false,
    permissions: [PERMISSIONS.MANAGE_FINANCE],
  },
  {
    to: "/finance/bursaries",
    label: "Bursaries",
    icon: Award,
    end: false,
    permissions: [PERMISSIONS.VIEW_FINANCE_BURSARIES],
  },
  {
    to: "/finance/sponsors",
    label: "Sponsors",
    icon: ShieldCheck,
    end: false,
    permissions: [PERMISSIONS.VIEW_FINANCE_SPONSORS],
  },
  {
    to: "/finance/expenses",
    label: "Expenses",
    icon: Receipt,
    end: false,
    permissions: [PERMISSIONS.VIEW_FINANCE_EXPENSES],
  },
  {
    to: "/finance/refunds",
    label: "Refunds",
    icon: Wallet,
    end: false,
    permissions: [PERMISSIONS.VIEW_FINANCE_REFUNDS],
  },
  {
    to: "/finance/balance",
    label: "Balance",
    icon: Wallet,
    end: false,
    permissions: [PERMISSIONS.VIEW_FINANCE_BALANCE],
  },
  {
    to: "/finance/clearance",
    label: "Clearance",
    icon: ShieldCheck,
    end: false,
    permissions: [PERMISSIONS.VIEW_FINANCE_CLEARANCE],
  },
  {
    to: "/finance/reports",
    label: "Reports",
    icon: BarChart3,
    end: false,
    permissions: [PERMISSIONS.VIEW_FINANCE_REPORTS],
  },
  {
    to: "/finance/online-payments",
    label: "Online Payments",
    icon: Receipt,
    end: false,
    permissions: [PERMISSIONS.VIEW_ONLINE_PAYMENTS_HISTORY],
  },
  {
    to: "/finance/app-fee-reconciliation",
    label: "App Fee Reconciliation",
    icon: GitMerge,
    end: false,
    permissions: [PERMISSIONS.MANAGE_FINANCE],
  },
  {
    to: "/finance/documents",
    label: "Documents",
    icon: FileText,
    end: false,
    permissions: [PERMISSIONS.VIEW_FINANCE],
  },
  {
    to: "/finance/payment-calendar",
    label: "Payment Calendar",
    icon: CalendarClock,
    end: false,
    permissions: [PERMISSIONS.VIEW_PAYMENT_CALENDAR, PERMISSIONS.MANAGE_PAYMENT_CALENDAR],
  },
  {
    to: "/finance/budget-execution",
    label: "Budget Execution",
    icon: PiggyBank,
    end: false,
    permissions: [PERMISSIONS.VIEW_BUDGET_EXECUTION, PERMISSIONS.MANAGE_BUDGET_EXECUTION],
  },
  {
    to: "/finance/financial-plan",
    label: "Financial Plan",
    icon: LineChart,
    end: false,
    permissions: [PERMISSIONS.VIEW_BUDGET_EXECUTION, PERMISSIONS.MANAGE_BUDGET_EXECUTION],
  },
];

export default function FinanceHub() {
  const user = useAuthStore((s) => s.user);
  const perms = user?.permissions ?? [];
  const isSuper = isSuperadmin(user);

  const visible = TABS.filter(
    (t) => isSuper || t.permissions.some((p) => perms.includes(p)),
  );

  const pendingQ = useQuery({
    queryKey: ["finance", "payments", "pending-count"],
    queryFn: () => paymentService.getPendingCount(),
    refetchInterval: 30_000,
  });
  const pendingCount = pendingQ.data?.data?.count ?? 0;

  const tabsWithBadges = visible.map((t) => ({
    ...t,
    badge:
      t.to === "/finance/approvals" && pendingCount > 0 ? (
        <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold bg-red-500 text-white rounded-full animate-pulse">
          {pendingCount > 9 ? "9+" : pendingCount}
        </span>
      ) : t.to === "/finance/documents" ? (
        <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold bg-blue-500 text-white rounded-full">
          📄
        </span>
      ) : null,
  }));

  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      <section className="card p-1.5">
        <ResponsiveTabBar tabs={tabsWithBadges} />
      </section>

      <Outlet />
    </div>
  );
}

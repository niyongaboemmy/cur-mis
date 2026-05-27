import { NavLink, Outlet } from "react-router-dom";
import { useRef, useState, useEffect, useCallback } from "react";
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
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useQuery } from "@tanstack/react-query";
import { paymentService } from "@/services/financeService";
import { PERMISSIONS } from "@/constants/permissions";

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
    to: "/finance/fee-types",
    label: "Fee Types",
    icon: Tag,
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
];

export default function FinanceHub() {
  const user = useAuthStore((s) => s.user);
  const perms = user?.permissions ?? [];
  const isSuper = user?.role === "superadmin";

  const visible = TABS.filter(
    (t) => isSuper || t.permissions.some((p) => perms.includes(p)),
  );

  const pendingQ = useQuery({
    queryKey: ["finance", "payments", "pending-count"],
    queryFn: () => paymentService.getPendingCount(),
    refetchInterval: 30_000,
  });
  const pendingCount = pendingQ.data?.data?.count ?? 0;

  // ── Scroll state ──────────────────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft]   = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener("scroll", checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      ro.disconnect();
    };
  }, [checkScroll]);

  const scrollBy = (dir: "left" | "right") => {
    scrollRef.current?.scrollBy({
      left: dir === "left" ? -200 : 200,
      behavior: "smooth",
    });
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      <section className="card p-1.5">
        {/* Scroll container with arrow buttons */}
        <div className="relative flex items-center">

          {/* Left fade + arrow */}
          <div
            className={`absolute left-0 top-0 bottom-0 z-10 flex items-center transition-opacity duration-200 ${
              canScrollLeft ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
            }`}
          >
            <div className="absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-white dark:from-ink-900 to-transparent rounded-l-lg" />
            <button
              onClick={() => scrollBy("left")}
              className="relative z-10 ml-0.5 p-1 rounded-md bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 shadow-sm text-ink-500 hover:text-ink-800 dark:hover:text-ink-100 hover:bg-ink-50 dark:hover:bg-ink-700 transition-colors"
              aria-label="Scroll left"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Tab list */}
          <div
            ref={scrollRef}
            className="flex gap-0.5 overflow-x-auto no-scrollbar px-1 py-0.5 scroll-smooth"
          >
            {visible.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  `inline-flex items-center gap-1.5 px-3 py-2 text-[13px] rounded-md whitespace-nowrap transition-all duration-150 select-none ${
                    isActive
                      ? "bg-brand/10 text-brand dark:bg-brand/25 dark:text-gold-400 font-semibold shadow-sm"
                      : "text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-700/60 hover:text-ink-900 dark:hover:text-ink-100"
                  }`
                }
              >
                <t.icon className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{t.label}</span>
                {t.to === "/finance/approvals" && pendingCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold bg-red-500 text-white rounded-full animate-pulse">
                    {pendingCount > 9 ? "9+" : pendingCount}
                  </span>
                )}
              </NavLink>
            ))}
          </div>

          {/* Right fade + arrow */}
          <div
            className={`absolute right-0 top-0 bottom-0 z-10 flex items-center transition-opacity duration-200 ${
              canScrollRight ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
            }`}
          >
            <div className="absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white dark:from-ink-900 to-transparent rounded-r-lg" />
            <button
              onClick={() => scrollBy("right")}
              className="relative z-10 mr-0.5 p-1 rounded-md bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 shadow-sm text-ink-500 hover:text-ink-800 dark:hover:text-ink-100 hover:bg-ink-50 dark:hover:bg-ink-700 transition-colors"
              aria-label="Scroll right"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Scroll hint — only shown when there is overflow, fades out after first interaction */}
        {canScrollRight && (
          <p className="text-[10px] text-center text-ink-400 dark:text-ink-500 pt-1 pb-0.5 select-none">
            Scroll or use arrows to see all tabs
          </p>
        )}
      </section>

      <Outlet />
    </div>
  );
}

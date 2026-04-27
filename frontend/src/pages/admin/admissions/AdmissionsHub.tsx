import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Files,
  FileCheck2,
  Award,
  Handshake,
  ListChecks,
  Layers,
  Calendar,
} from "lucide-react";
import { verificationService } from "@/services/admissionService";
import { useAuthStore } from "@/store/authStore";
import { PERMISSIONS } from "@/constants";

const TABS = [
  {
    to: "/admin/admissions/applications",
    label: "Applications",
    icon: Files,
    badge: false,
    permission: PERMISSIONS.MANAGE_STUDENT_APPLICATIONS,
  },
  {
    to: "/admin/admissions/verifications",
    label: "Verifications",
    icon: FileCheck2,
    badge: true,
    permission: PERMISSIONS.VERIFY_DOCUMENTS,
  },
  {
    to: "/admin/admissions/merit",
    label: "Merit lists",
    icon: Award,
    badge: false,
    permission: PERMISSIONS.MANAGE_ADMISSIONS,
  },
  {
    to: "/admin/admissions/offers",
    label: "Offers",
    icon: Handshake,
    badge: false,
    permission: PERMISSIONS.MANAGE_ADMISSIONS,
  },
  {
    to: "/admin/admissions/requirements",
    label: "Requirements",
    icon: ListChecks,
    badge: false,
    permission: PERMISSIONS.MANAGE_ADMISSION_REQUIREMENTS,
  },
  {
    to: "/admin/admissions/document-types",
    label: "Document types",
    icon: Layers,
    badge: false,
    permission: PERMISSIONS.MANAGE_ADMISSION_REQUIREMENTS,
  },
  {
    to: "/admin/admissions/intakes",
    label: "Intakes",
    icon: Calendar,
    badge: false,
    permission: PERMISSIONS.MANAGE_ADMISSIONS,
  },
];

export default function AdmissionsHub() {
  const loc = useLocation();
  const atRoot = loc.pathname === "/admin/admissions";
  const user = useAuthStore((s) => s.user);

  const visible = TABS.filter((t) => {
    if (user?.role === "superadmin") return true;
    return (user?.permissions ?? []).includes(t.permission);
  });

  const pendingQ = useQuery({
    queryKey: ["admin", "verifications", "pending-count"],
    queryFn: () => verificationService.getPendingApplications(),
    refetchInterval: 30_000,
    enabled: visible.some((t) => t.to.endsWith("/verifications")),
  });
  const pendingCount = pendingQ.data?.data?.total ?? 0;

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
                  isActive || (atRoot && t.to.endsWith("/applications"))
                    ? "bg-brand/10 text-brand dark:bg-brand/25 dark:text-gold-400 font-semibold"
                    : "text-ink-600 hover:bg-ink-50 dark:text-ink-300 dark:hover:bg-ink-700/50"
                }`
              }
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
              {t.badge && pendingCount > 0 && (
                <span className="ml-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand px-1 text-[9px] font-black text-white ring-2 ring-white dark:ring-ink-900">
                  {pendingCount}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </section>

      <Outlet />
    </div>
  );
}

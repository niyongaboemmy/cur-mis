import { useAuthStore } from "@/store/authStore";
import AdminDashboardPage from "@/pages/admin/AdminDashboardPage";
import ApplicantOverviewPage from "@/pages/applicant/ApplicantOverviewPage";
import TeacherDashboardPage from "@/pages/teacher/TeacherDashboardPage";
import { PERMISSIONS } from "@/constants/permissions";

export default function HomePage() {
  const { user } = useAuthStore();

  if (user?.role === "applicant" || user?.is_applicant) {
    return <ApplicantOverviewPage />;
  }

  // Teaching staff land on their own workspace instead of the institution-wide
  // admin metrics, which are not scoped to them and which they cannot act on.
  //
  // NOTE: this deliberately reads `user.permissions` directly rather than using
  // useAnyPermission(), because that helper bypasses for superadmin — which
  // would send every superadmin to the teacher dashboard. ACCESS_TEACHER_PORTAL
  // is granted only to `lecturer` and `HOD` (migration 2026_08_09_120), so the
  // raw check is both correct and role-accurate.
  if (user?.permissions?.includes(PERMISSIONS.ACCESS_TEACHER_PORTAL)) {
    return <TeacherDashboardPage />;
  }

  return <AdminDashboardPage />;
}

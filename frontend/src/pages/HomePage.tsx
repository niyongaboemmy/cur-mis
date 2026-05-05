import { useAuthStore } from "@/store/authStore";
import AdminDashboardPage from "@/pages/admin/AdminDashboardPage";
import ApplicantOverviewPage from "@/pages/applicant/ApplicantOverviewPage";

export default function HomePage() {
  const { user } = useAuthStore();

  if (user?.role === "applicant" || user?.is_applicant) {
    return <ApplicantOverviewPage />;
  }

  return <AdminDashboardPage />;
}

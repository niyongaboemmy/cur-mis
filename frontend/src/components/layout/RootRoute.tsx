import { useAuthStore } from "@/store/authStore";
import { useAcademicScope } from "@/hooks/useAcademicScope";
import { PERMISSIONS } from "@/constants/permissions";
import { isSuperadmin } from "@/utils/permissions";
import HomePage from "@/pages/HomePage";
import WelcomePage from "@/pages/WelcomePage";

/**
 * "/" — Dean, HOD, secretary and lecturer accounts open their dashboard straight
 * away. Other accounts keep the welcome screen, which links to the dashboard.
 */
export default function RootRoute() {
  const { user } = useAuthStore();
  const { scope } = useAcademicScope();

  const isApplicant = user?.role === "applicant" || !!user?.is_applicant;
  const isWorkspaceUser =
    !isSuperadmin(user) &&
    !isApplicant &&
    (scope.scoped || !!user?.permissions?.includes(PERMISSIONS.ACCESS_TEACHER_PORTAL));

  return isWorkspaceUser ? <HomePage /> : <WelcomePage />;
}

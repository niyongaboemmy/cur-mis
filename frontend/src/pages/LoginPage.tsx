import { GraduationCap, PlayCircle } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import AuthLayout from "@/components/auth/AuthLayout";
import LoginForm from "@/components/auth/LoginForm";
import { useQuery } from "@tanstack/react-query";
import { portalService } from "@/services/admissionService";
import { systemService } from "@/services/systemService";
import { useAuthStore } from "@/store/authStore";

export default function LoginPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const { data: intakes } = useQuery({
    queryKey: ['portal-intakes'],
    queryFn: () => portalService.getIntakes(),
    staleTime: 1000 * 60 * 10, // 10 mins
    enabled: !isAuthenticated,
  });

  const { data: videos } = useQuery({
    queryKey: ['portal', 'guidance-videos'],
    queryFn: () => systemService.getGuidanceVideos(),
    staleTime: 1000 * 60 * 10,
    enabled: !isAuthenticated,
  })
  const loginVideoUrl = videos?.data?.video_login_guide_url ?? ''

  if (isAuthenticated) return <Navigate to="/" replace />

  const hasActiveIntake = (intakes?.data?.length ?? 0) > 0;

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your CUR-MIS account to continue.">
      <LoginForm />

      {loginVideoUrl && (
        <p className="mt-4 text-center text-xs text-ink-500">
          New here?{' '}
          <a
            href={loginVideoUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-brand font-medium hover:underline"
          >
            <PlayCircle className="w-3.5 h-3.5" />
            Watch: How to log in &amp; reset your password
          </a>
        </p>
      )}

      {hasActiveIntake ? (
        <div className="mt-8 rounded-xl bg-primary-50/50 p-5 border border-primary-100">
          <div className="flex gap-4">
            <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-primary-900 mb-1">
                Prospective Student?
              </h3>
              <p className="text-xs text-primary-700/80 mb-3 leading-relaxed">
                Admissions for the upcoming academic year are now open.
              </p>
              <Link 
                to="/apply" 
                className="inline-flex items-center text-xs font-semibold text-primary-700 hover:text-primary-800 transition-colors group"
              >
                Apply now 
                <span className="ml-1 inline-block transition-transform group-hover:translate-x-1">→</span>
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800 text-center">
          <p className="text-sm text-gray-500">
            Don't have an account? Contact the system administrator.
          </p>
        </div>
      )}
    </AuthLayout>
  );
}

import { GraduationCap, PlayCircle, FileText } from "lucide-react";
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
        <div className="mt-8 rounded-xl bg-primary-50/50 dark:bg-primary-900/10 p-5 border border-primary-100 dark:border-primary-900/40">
          <div className="flex gap-4">
            <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-primary-900 dark:text-primary-200 mb-1">
                Prospective Student?
              </h3>
              <p className="text-xs text-primary-700/80 dark:text-primary-300/80 mb-3 leading-relaxed">
                Admissions for the upcoming academic year are now open.
              </p>
              <Link
                to="/apply"
                className="inline-flex items-center text-xs font-semibold text-primary-700 dark:text-primary-300 hover:text-primary-800 dark:hover:text-primary-200 transition-colors group"
              >
                Apply now 
                <span className="ml-1 inline-block transition-transform group-hover:translate-x-1">→</span>
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Don't have an account? Contact the system administrator.
          </p>
        </div>
      )}

      <div className="mt-4 rounded-xl bg-gray-50 dark:bg-gray-800/40 p-5 border border-gray-100 dark:border-gray-800">
        <div className="flex gap-4">
          <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
              Need a document or service?
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 leading-relaxed">
              Browse and request transcripts, enrollment letters, and other services — no login required to browse.
            </p>
            <Link
              to="/services"
              className="inline-flex items-center text-xs font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors group"
            >
              Browse services
              <span className="ml-1 inline-block transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}

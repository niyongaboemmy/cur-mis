import { Routes, Route } from 'react-router-dom'
import { useEffect, Suspense, lazy } from 'react'
import MainLayout           from '@/layouts/MainLayout'
import ProtectedRoute       from '@/components/layout/ProtectedRoute'
import ErrorBoundary        from '@/components/layout/ErrorBoundary'
import { useThemeStore }    from '@/store/themeStore'
import { PERMISSIONS }      from '@/constants'

// Lazy loaded pages
const HomePage             = lazy(() => import('@/pages/HomePage'))
const LoginPage            = lazy(() => import('@/pages/LoginPage'))
const VerifyOtpPage        = lazy(() => import('@/pages/VerifyOtpPage'))
const ForgotPasswordPage   = lazy(() => import('@/pages/ForgotPasswordPage'))
const NotFoundPage         = lazy(() => import('@/pages/NotFoundPage'))
const RolesManagementPage  = lazy(() => import('@/pages/admin/RolesManagementPage'))
const PermissionsManagementPage = lazy(() => import('@/pages/admin/PermissionsManagementPage'))
const UsersManagementPage = lazy(() => import('@/pages/admin/UsersManagementPage'))

// University Modules (Placeholders)
const StudentsPage = lazy(() => import('@/pages/placeholders/StudentsPage'))
const ProgramsPage = lazy(() => import('@/pages/placeholders/ProgramsPage'))
const FinancePage  = lazy(() => import('@/pages/placeholders/FinancePage'))
const ExamsPage    = lazy(() => import('@/pages/placeholders/ExamsPage'))
const LogsPage     = lazy(() => import('@/pages/placeholders/LogsPage'))

// A graceful loading fallback for route transitions
const CustomLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 transition-colors">
    <div className="flex flex-col items-center gap-4">
      <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
      <p className="text-gray-500 font-medium animate-pulse">Loading...</p>
    </div>
  </div>
)

function App() {
  const initTheme = useThemeStore((state) => state.initTheme)

  useEffect(() => {
    initTheme()
  }, [initTheme])

  return (
    <ErrorBoundary>
      <Suspense fallback={<CustomLoader />}>
        <Routes>
          {/* Public */}
          <Route path="/login"           element={<LoginPage />} />
          <Route path="/verify-otp"      element={<VerifyOtpPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />

          {/* Protected — requires valid JWT in Zustand store */}
          <Route element={<ProtectedRoute />}>
            <Route element={<MainLayout />}>
              <Route path="/"  element={<HomePage />} />
              
              {/* Admin Routes with Permissions Protection */}
              <Route element={<ProtectedRoute requiredPermissions={PERMISSIONS.MANAGE_ROLES} />}>
                <Route path="/roles" element={<RolesManagementPage />} />
              </Route>
              
              <Route element={<ProtectedRoute requiredPermissions={PERMISSIONS.MANAGE_PERMISSIONS} />}>
                <Route path="/permissions" element={<PermissionsManagementPage />} />
              </Route>

              <Route element={<ProtectedRoute requiredPermissions={PERMISSIONS.MANAGE_USERS} />}>
                <Route path="/users" element={<UsersManagementPage />} />
              </Route>

              {/* University Modules */}
              <Route element={<ProtectedRoute requiredPermissions={PERMISSIONS.VIEW_STUDENTS} />}>
                <Route path="/students" element={<StudentsPage />} />
              </Route>
              
              <Route element={<ProtectedRoute requiredPermissions={PERMISSIONS.MANAGE_ACADEMICS} />}>
                <Route path="/programs" element={<ProgramsPage />} />
              </Route>

              <Route element={<ProtectedRoute requiredPermissions={PERMISSIONS.MANAGE_FINANCE} />}>
                <Route path="/finance" element={<FinancePage />} />
              </Route>

              <Route element={<ProtectedRoute requiredPermissions={PERMISSIONS.MANAGE_EXAMS} />}>
                <Route path="/exams" element={<ExamsPage />} />
              </Route>

              <Route element={<ProtectedRoute requiredPermissions={PERMISSIONS.VIEW_SYSTEM_LOGS} />}>
                <Route path="/logs" element={<LogsPage />} />
              </Route>
            </Route>
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}

export default App

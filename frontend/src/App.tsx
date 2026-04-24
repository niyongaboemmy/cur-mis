import { Routes, Route } from 'react-router-dom'
import { useEffect, Suspense, lazy } from 'react'
import MainLayout           from '@/layouts/MainLayout'
import ProtectedRoute       from '@/components/layout/ProtectedRoute'
import ErrorBoundary        from '@/components/layout/ErrorBoundary'
import { useThemeStore }    from '@/store/themeStore'
import { PERMISSIONS }      from '@/constants'

// Lazy loaded pages
const WelcomePage          = lazy(() => import('@/pages/WelcomePage'))
const HomePage             = lazy(() => import('@/pages/HomePage'))
const AdminDashboardPage   = lazy(() => import('@/pages/admin/AdminDashboardPage'))
const ProfilePage          = lazy(() => import('@/pages/ProfilePage'))
const LoginPage            = lazy(() => import('@/pages/LoginPage'))
const RegisterPage         = lazy(() => import('@/pages/RegisterPage'))
const VerifyOtpPage        = lazy(() => import('@/pages/VerifyOtpPage'))
const ForgotPasswordPage   = lazy(() => import('@/pages/ForgotPasswordPage'))
const NotFoundPage         = lazy(() => import('@/pages/NotFoundPage'))
const RolesManagementPage  = lazy(() => import('@/pages/admin/RolesManagementPage'))
const PermissionsManagementPage = lazy(() => import('@/pages/admin/PermissionsManagementPage'))
const UsersManagementPage = lazy(() => import('@/pages/admin/UsersManagementPage'))

// University Modules
const StudentsPage              = lazy(() => import('@/pages/StudentsPage'))
const AcademicSettingsPage      = lazy(() => import('@/pages/academic/AcademicSettingsPage'))
const AcademicsManagementPage   = lazy(() => import('@/pages/academic/AcademicsManagementPage'))

// Admissions / Student Management Module
const ApplyPage                 = lazy(() => import('@/pages/public/ApplyPage'))
const TrackApplicationPage      = lazy(() => import('@/pages/public/TrackApplicationPage'))
const AdmissionsHub             = lazy(() => import('@/pages/admin/admissions/AdmissionsHub'))
const ApplicationsListPage      = lazy(() => import('@/pages/admin/admissions/ApplicationsListPage'))
const ApplicationDetailPage     = lazy(() => import('@/pages/admin/admissions/ApplicationDetailPage'))
const VerificationsPage         = lazy(() => import('@/pages/admin/admissions/VerificationsPage'))
const DocumentValidationCarousel = lazy(() => import('@/pages/admin/admissions/DocumentValidationCarousel'))
const MeritPage                 = lazy(() => import('@/pages/admin/admissions/MeritPage'))
const OffersPage                = lazy(() => import('@/pages/admin/admissions/OffersPage'))
const RequirementsPage          = lazy(() => import('@/pages/admin/admissions/RequirementsPage'))
const DocumentTypesPage         = lazy(() => import('@/pages/admin/admissions/DocumentTypesPage'))
const IntakesManagementPage     = lazy(() => import('@/pages/admin/admissions/IntakesManagementPage'))
const ApplicantOverviewPage   = lazy(() => import('@/pages/applicant/ApplicantOverviewPage'))
const ApplicantDocumentsPage  = lazy(() => import('@/pages/applicant/ApplicantDocumentsPage'))

// Modules Management Module
const ModulesHub                   = lazy(() => import('@/pages/modules/ModulesHub'))
const ModulesCatalogPage           = lazy(() => import('@/pages/modules/ModulesCatalogPage'))
const ModulesSchedulePage          = lazy(() => import('@/pages/modules/ModulesSchedulePage'))
const ModulesAssignmentsPage       = lazy(() => import('@/pages/modules/ModulesAssignmentsPage'))
const ModulesRegistrationAdminPage = lazy(() => import('@/pages/modules/ModulesRegistrationAdminPage'))
const MyRegistrationsPage          = lazy(() => import('@/pages/modules/MyRegistrationsPage'))

// Placeholders still in use for modules not yet wired up
const ProgramsPage   = lazy(() => import('@/pages/placeholders/ProgramsPage'))
const FinancePage    = lazy(() => import('@/pages/placeholders/FinancePage'))
const ExamsPage      = lazy(() => import('@/pages/placeholders/ExamsPage'))
const LogsPage       = lazy(() => import('@/pages/placeholders/LogsPage'))
const ComingSoonPage = lazy(() => import('@/pages/placeholders/ComingSoonPage'))

// A graceful loading fallback for route transitions
const CustomLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-[rgb(var(--bg-app))] dark:bg-ink-900 transition-colors">
    <div className="flex flex-col items-center gap-4">
      <div className="w-10 h-10 border-4 border-primary-100 border-t-primary-600 rounded-full animate-spin" />
      <p className="text-ink-500 text-sm font-medium animate-pulse-soft">Loading CUR-MIS…</p>
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
          <Route path="/register"        element={<RegisterPage />} />
          <Route path="/verify-otp"      element={<VerifyOtpPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          {/* Public admissions portal — no auth required */}
          <Route path="/apply"           element={<ApplyPage />} />
          <Route path="/apply/track"     element={<TrackApplicationPage />} />

          {/* Protected — requires valid JWT in Zustand store */}
          <Route element={<ProtectedRoute />}>
            <Route element={<MainLayout />}>
              <Route path="/"          element={<WelcomePage />} />
              <Route path="/dashboard" element={<AdminDashboardPage />} />
              <Route path="/home"      element={<HomePage />} />
              <Route path="/profile" element={<ProfilePage />} />
              
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

              {/* Academic Settings — years & terms */}
              <Route path="/academic/settings"   element={<AcademicSettingsPage />} />
              {/* Academics Management — degrees, schools, departments, modules, etc. */}
              <Route path="/academic/management" element={<AcademicsManagementPage />} />

              {/* Admissions hub (admins) */}
              <Route path="/admin/admissions" element={<AdmissionsHub />}>
                <Route index                           element={<ApplicationsListPage />} />
                <Route path="applications"             element={<ApplicationsListPage />} />
                <Route path="applications/:id"         element={<ApplicationDetailPage />} />
                <Route path="verifications"            element={<VerificationsPage />} />
                <Route path="verifications/:id/validate" element={<DocumentValidationCarousel />} />
                <Route path="merit"                    element={<MeritPage />} />
                <Route path="offers"                   element={<OffersPage />} />
                <Route path="requirements"             element={<RequirementsPage />} />
                <Route path="document-types"           element={<DocumentTypesPage />} />
                <Route path="intakes"                  element={<IntakesManagementPage />} />
              </Route>

              {/* Applicant portal (authenticated applicants) */}
              <Route element={<ProtectedRoute requiredPermissions={[PERMISSIONS.ACCESS_APPLICANT_PORTAL]} />}>
                <Route path="/applicant"           element={<ApplicantOverviewPage />} />
                <Route path="/applicant/documents" element={<ApplicantDocumentsPage />} />
              </Route>

              {/* Modules Management Module */}
              <Route element={<ProtectedRoute requiredPermissions={[
                PERMISSIONS.MANAGE_MODULES,
                PERMISSIONS.MANAGE_MODULE_SCHEDULES,
                PERMISSIONS.MANAGE_MODULE_ASSIGNMENTS,
                PERMISSIONS.MANAGE_MODULE_REGISTRATIONS,
              ]} />}>
                <Route path="/modules" element={<ModulesHub />}>
                  <Route index                  element={<ModulesCatalogPage />} />
                  <Route path="catalog"         element={<ModulesCatalogPage />} />
                  <Route path="scheduling"      element={<ModulesSchedulePage />} />
                  <Route path="assignments"     element={<ModulesAssignmentsPage />} />
                  <Route path="registrations"   element={<ModulesRegistrationAdminPage />} />
                </Route>
              </Route>

              {/* Student self-service — My modules */}
              <Route element={<ProtectedRoute requiredPermissions={PERMISSIONS.VIEW_MY_MODULES} />}>
                <Route path="/my-modules" element={<MyRegistrationsPage />} />
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

              {/* Spik-reference placeholder routes — all authenticated users see them. */}
              <Route path="/students/new"     element={<ComingSoonPage />} />
              <Route path="/students/alumni"  element={<ComingSoonPage />} />
              <Route path="/teachers"         element={<ComingSoonPage />} />
              <Route path="/teachers/schedules" element={<ComingSoonPage />} />
              <Route path="/library"          element={<ComingSoonPage />} />
              <Route path="/account/billing"  element={<ComingSoonPage />} />
              <Route path="/account/salaries" element={<ComingSoonPage />} />
              <Route path="/class"            element={<ComingSoonPage />} />
              <Route path="/subject"          element={<ComingSoonPage />} />
              <Route path="/routine"          element={<ComingSoonPage />} />
              <Route path="/attendance"       element={<ComingSoonPage />} />
              <Route path="/exams/results"    element={<ComingSoonPage />} />
              <Route path="/notice"           element={<ComingSoonPage />} />
              <Route path="/transport"        element={<ComingSoonPage />} />
              <Route path="/hostel"           element={<ComingSoonPage />} />
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

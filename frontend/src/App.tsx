import { Routes, Route } from "react-router-dom";
import { useEffect, Suspense } from "react";
import MainLayout from "@/layouts/MainLayout";
import ProtectedRoute from "@/components/layout/ProtectedRoute";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import { useThemeStore } from "@/store/themeStore";
import { PERMISSIONS, LEAVE_STAGE_PERMISSIONS } from "@/constants/permissions";

// ── Pages (direct imports — no lazy() to avoid chunk-load failures on cPanel) ──
import WelcomePage from "@/pages/WelcomePage";
import HomePage from "@/pages/HomePage";
import AdminDashboardPage from "@/pages/admin/AdminDashboardPage";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import VerifyOtpPage from "@/pages/VerifyOtpPage";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import NotFoundPage from "@/pages/NotFoundPage";
import RolesManagementPage from "@/pages/admin/RolesManagementPage";
import ServiceCatalogManagementPage from "@/pages/admin/ServiceCatalogManagementPage";
import PermissionsManagementPage from "@/pages/admin/PermissionsManagementPage";
import UsersManagementPage from "@/pages/admin/UsersManagementPage";
// University Modules
import StudentsPage from "@/pages/StudentsPage";
import StudentDetailsPage from "@/pages/StudentDetailsPage";
import UserProfilePage from "@/pages/UserProfilePage";
import DocumentGenerationPage from "@/pages/DocumentGenerationPage";
import AttendancePage from "@/pages/AttendancePage";

// HR Management
import StaffListPage from "@/pages/hr/StaffListPage";
import AllStaffList from "@/pages/hr/AllStaffList";
import StaffDetailPage from "@/pages/hr/StaffDetailPage";
import HrAttendancePage from "@/pages/hr/HrAttendancePage";
import HrDocumentsPage from "@/pages/hr/HrDocumentsPage";
import PayrollPage from "@/pages/hr/PayrollPage";
import PayrollSlipPage from "@/pages/hr/PayrollSlipPage";
import MyPayrollPage from "@/pages/hr/MyPayrollPage";
import PaymentsPage from "@/pages/hr/PaymentsPage";
import HrSettingsPage from "@/pages/hr/HrSettingsPage";
import LeavePage from "@/pages/hr/LeavePage";
import MyLeavePage from "@/pages/hr/MyLeavePage";
import LeaveApprovalQueuePage from "@/pages/hr/LeaveApprovalQueuePage";
import NotificationsPage from "@/pages/NotificationsPage";
import AppraisalPage from "@/pages/hr/AppraisalPage";
import HRImportExportPage from "@/pages/hr/HRImportExportPage";
import SupervisorLeaveApprovalDashboard from "@/pages/hr/SupervisorLeaveApprovalDashboard";
import PayrollManagementPage from "@/pages/hr/PayrollManagementPage";
import ContractManagementPage from "@/pages/hr/ContractManagementPage";
import HrMonitoringDashboard from "@/pages/hr/HrMonitoringDashboard";
import PerformanceMonitoringPage from "@/pages/hr/PerformanceMonitoringPage";

// Academic
import AcademicSettingsPage from "@/pages/academic/AcademicSettingsPage";
import AcademicsManagementPage from "@/pages/academic/AcademicsManagementPage";
import AcademicGradingScalePage from "@/pages/academic/GradingScalePage";
import TranscriptModulesPage from "@/pages/academic/TranscriptModulesPage";
import TranscriptRequestsPage from "@/pages/academic/TranscriptRequestsPage";
import GraduandManagementPage from "@/pages/academic/GraduandManagementPage";
import AcademicCertificatesPage from "@/pages/academic/AcademicCertificatesPage";
import AcademicAnalyticsPage from "@/pages/academic/AcademicAnalyticsPage";
import SystemDocumentsPage from "@/pages/academic/SystemDocumentsPage";
import SystemSettingsPage from "@/pages/admin/SystemSettingsPage";
import StudentIdCardsPage from "@/pages/StudentIdCardsPage";
import TimetablePage from "@/pages/timetable/TimetablePage";

// Gate Management Module
import GateManagementPage from "@/pages/gate/GateManagementPage";

// Admissions / Student Management Module
import ApplyPage from "@/pages/public/ApplyPage";
import TrackApplicationPage from "@/pages/public/TrackApplicationPage";
import ServiceCatalogPage from "@/pages/public/services/ServiceCatalogPage";
import ServiceDetailPage from "@/pages/public/services/ServiceDetailPage";
import TrackServiceRequestPage from "@/pages/public/services/TrackServiceRequestPage";
import MyServiceRequestsPage from "@/pages/student/service-requests/MyServiceRequestsPage";
import ServiceRequestApprovalQueuePage from "@/pages/service-requests/ServiceRequestApprovalQueuePage";
import ServiceRequestsDashboardPage from "@/pages/service-requests/ServiceRequestsDashboardPage";
import AdmissionsHub from "@/pages/admin/admissions/AdmissionsHub";
import InternationalStudentsPage from "@/pages/admin/InternationalStudentsPage";
import ApplicationStatisticsPage from "@/pages/admin/admissions/ApplicationStatisticsPage";
import ApplicationsListPage from "@/pages/admin/admissions/ApplicationsListPage";
import ApplicationDetailPage from "@/pages/admin/admissions/ApplicationDetailPage";
import VerificationsPage from "@/pages/admin/admissions/VerificationsPage";
import DocumentValidationCarousel from "@/pages/admin/admissions/DocumentValidationCarousel";
import MeritPage from "@/pages/admin/admissions/MeritPage";
import OffersPage from "@/pages/admin/admissions/OffersPage";
import RequirementsPage from "@/pages/admin/admissions/RequirementsPage";
import DocumentTypesPage from "@/pages/admin/admissions/DocumentTypesPage";
import IntakesManagementPage from "@/pages/admin/admissions/IntakesManagementPage";
import ApplicantOverviewPage from "@/pages/applicant/ApplicantOverviewPage";
import ApplicantDocumentsPage from "@/pages/applicant/ApplicantDocumentsPage";

// Modules Management
import ModulesHub from "@/pages/modules/ModulesHub";
import ModulesCatalogPage from "@/pages/modules/ModulesCatalogPage";
import ModulesSchedulePage from "@/pages/modules/ModulesSchedulePage";
import ModulesAssignmentsPage from "@/pages/modules/ModulesAssignmentsPage";
import ModulesRegistrationAdminPage from "@/pages/modules/ModulesRegistrationAdminPage";
import ModulesMarksPage from "@/pages/modules/ModulesMarksPage";
import MyRegistrationsPage from "@/pages/modules/MyRegistrationsPage";

// Messaging
import MessagesPage from "@/pages/messaging/MessagesPage";
import AnnouncementsPage from "@/pages/announcements/AnnouncementsPage";
import ForumsPage from "@/pages/forums/ForumsPage";
import ForumThreadPage from "@/pages/forums/ForumThreadPage";
import VerifyStudentPage from "@/pages/public/VerifyStudentPage";
// Help Centre — end-user documentation. Deliberately ungated: every role
// needs to be able to read every guide, including one written for another role.
import HelpCenterPage from "@/pages/help/HelpCenterPage";
import HelpModulePage from "@/pages/help/HelpModulePage";
import HelpArticlePage from "@/pages/help/HelpArticlePage";
import HelpSearchPage from "@/pages/help/HelpSearchPage";
import HelpGlossaryPage from "@/pages/help/HelpGlossaryPage";
// Placeholders still in use for modules not yet wired up
import ExamSchedulesPage from "@/pages/exam/ExamSchedulesPage";
import ExamResultsPage from "@/pages/exam/ExamResultsPage";
import DeliberationPage from "@/pages/exam/DeliberationPage";
import GradingScalePage from "@/pages/exam/GradingScalePage";
import RevaluationsPage from "@/pages/exam/RevaluationsPage";

// Placeholders
import ProgramsPage from "@/pages/placeholders/ProgramsPage";
import LogsPage from "@/pages/placeholders/LogsPage";
import ComingSoonPage from "@/pages/placeholders/ComingSoonPage";
// Teacher (lecturer) self-service portal
import TeacherDashboardPage from "@/pages/teacher/TeacherDashboardPage";
import TeacherCoursesPage from "@/pages/teacher/TeacherCoursesPage";
import TeacherCourseDetailPage from "@/pages/teacher/TeacherCourseDetailPage";
import TeacherStudentsPage from "@/pages/teacher/TeacherStudentsPage";
import TeacherCalendarPage from "@/pages/teacher/TeacherCalendarPage";
import TeacherExamsPage from "@/pages/teacher/TeacherExamsPage";
import TeacherExamAttendancePage from "@/pages/teacher/TeacherExamAttendancePage";

// Registrar
import RegistrarReportPage from "@/pages/registrar/RegistrarReportPage";

// Finance
import FinanceHub from "@/pages/finance/FinanceHub";
import FinanceOverviewPage from "@/pages/finance/FinanceOverviewPage";
import StudentLedgerPage from "@/pages/finance/StudentLedgerPage";
import StudentBillingPage from "@/pages/finance/StudentBillingPage";
import PaymentApprovalsPage from "@/pages/finance/PaymentApprovalsPage";
import BordereauVerificationPage from "@/pages/finance/BordereauVerificationPage";
import FeeStructuresPage from "@/pages/finance/FeeStructuresPage";
import BursariesPage from "@/pages/finance/BursariesPage";
import ExpensesPage from "@/pages/finance/ExpensesPage";
import AccountBalancePage from "@/pages/finance/AccountBalancePage";
import ClearancePage from "@/pages/finance/ClearancePage";
import RevenueReportPage from "@/pages/finance/RevenueReportPage";
import RefundsPage from "@/pages/finance/RefundsPage";
import OnlinePaymentsHistoryPage from "@/pages/finance/OnlinePaymentsHistoryPage";
import SponsorsPage from "@/pages/finance/SponsorsPage";
import ExpenseCategoriesPage from "@/pages/finance/ExpenseCategoriesPage";
import FeeTypesPage from "@/pages/finance/FeeTypesPage";
import PerCreditRatesPage from "@/pages/finance/PerCreditRatesPage";
import AppFeeReconciliationPage from "@/pages/finance/AppFeeReconciliationPage";
import ReceiptPdfPage from "@/pages/finance/ReceiptPdfPage";
import MyFinancePage from "@/pages/finance/MyFinancePage";
import FinesManagementPage from "@/pages/finance/FinesManagementPage";
import OverdueAlertsPage from "@/pages/finance/OverdueAlertsPage";
import PaymentCalendarPage from "@/pages/finance/PaymentCalendarPage";
import BudgetExecutionPage from "@/pages/finance/BudgetExecutionPage";
import BudgetPlanPage from "@/pages/finance/BudgetPlanPage";
import PostgraduateInternationalFeesPage from "@/pages/finance/PostgraduateInternationalFeesPage";
import StudentDirectoryPage from "@/pages/finance/StudentDirectoryPage";

function App() {
  const initTheme = useThemeStore((state) => state.initTheme);

  useEffect(() => {
    initTheme();
  }, [initTheme]);

  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/verify-otp" element={<VerifyOtpPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/apply" element={<ApplyPage />} />
          <Route path="/apply/track" element={<TrackApplicationPage />} />
          <Route path="/verify/student" element={<VerifyStudentPage />} />
          <Route path="/services" element={<ServiceCatalogPage />} />
          <Route path="/services/track" element={<TrackServiceRequestPage />} />
          <Route path="/services/:slug" element={<ServiceDetailPage />} />

          {/* Protected — requires valid JWT in Zustand store */}
          <Route element={<ProtectedRoute />}>
            <Route element={<MainLayout />}>
              {/* Free to all authenticated users */}
              <Route path="/" element={<WelcomePage />} />
              <Route path="/welcome" element={<WelcomePage />} />
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={PERMISSIONS.VIEW_DASHBOARD}
                  />
                }
              >
                <Route path="/dashboard" element={<AdminDashboardPage />} />
              </Route>
              <Route path="/home" element={<HomePage />} />
              <Route path="/profile" element={<UserProfilePage />} />
              <Route path="/my/service-requests" element={<MyServiceRequestsPage />} />

              {/* ── Help Centre ── */}
              <Route path="/help" element={<HelpCenterPage />} />
              <Route path="/help/search" element={<HelpSearchPage />} />
              <Route path="/help/glossary" element={<HelpGlossaryPage />} />
              <Route path="/help/m/:moduleId" element={<HelpModulePage />} />
              <Route
                path="/help/m/:moduleId/:articleId"
                element={<HelpArticlePage />}
              />

              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={[
                      PERMISSIONS.APPROVE_SERVICE_REQUEST_L1,
                      PERMISSIONS.APPROVE_SERVICE_REQUEST_L2,
                      PERMISSIONS.APPROVE_SERVICE_REQUEST_FINAL,
                    ]}
                  />
                }
              >
                <Route path="/service-requests/queue" element={<ServiceRequestApprovalQueuePage />} />
              </Route>

              <Route
                element={
                  <ProtectedRoute requiredPermissions={PERMISSIONS.VIEW_SERVICE_REQUESTS} />
                }
              >
                <Route path="/service-requests/reports" element={<ServiceRequestsDashboardPage />} />
              </Route>
              {/* Self-service payroll — every authenticated user sees their own
                  payslip history; data is scoped server-side to their account. */}
              <Route path="/me/payroll" element={<MyPayrollPage />} />
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={PERMISSIONS.SEND_MESSAGES}
                  />
                }
              >
                <Route path="/messages" element={<MessagesPage />} />
              </Route>
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={PERMISSIONS.VIEW_ANNOUNCEMENTS}
                  />
                }
              >
                <Route path="/announcements" element={<AnnouncementsPage />} />
              </Route>
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={PERMISSIONS.VIEW_FORUMS}
                  />
                }
              >
                <Route path="/forums" element={<ForumsPage />} />
                <Route path="/forums/threads/:id" element={<ForumThreadPage />} />
              </Route>

              {/* ── Administration ── */}
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={PERMISSIONS.MANAGE_ROLES}
                  />
                }
              >
                <Route path="/roles" element={<RolesManagementPage />} />
              </Route>

              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={PERMISSIONS.MANAGE_SERVICE_CATALOG}
                  />
                }
              >
                <Route
                  path="/admin/service-catalog"
                  element={<ServiceCatalogManagementPage />}
                />
              </Route>

              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={PERMISSIONS.MANAGE_PERMISSIONS}
                  />
                }
              >
                <Route
                  path="/permissions"
                  element={<PermissionsManagementPage />}
                />
              </Route>

              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={PERMISSIONS.MANAGE_USERS}
                  />
                }
              >
                <Route path="/users" element={<UsersManagementPage />} />
              </Route>

              {/* ── Students ── */}
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={PERMISSIONS.VIEW_STUDENTS}
                  />
                }
              >
                <Route path="/students" element={<StudentsPage />} />
                <Route path="/students/:id" element={<StudentDetailsPage />} />
              </Route>

              {/* ── Student ID cards — /api/student-ids accepts VIEW_STUDENTS
                  OR MANAGE_STUDENT_IDS, so a card officer without the student
                  register still reaches their own workspace. ── */}
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={[
                      PERMISSIONS.MANAGE_STUDENT_IDS,
                      PERMISSIONS.VIEW_STUDENTS,
                    ]}
                  />
                }
              >
                <Route path="/students/id-cards" element={<StudentIdCardsPage />} />
              </Route>

              {/* ── Document Generation ── */}
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={PERMISSIONS.GENERATE_DOCUMENTS}
                  />
                }
              >
                <Route
                  path="/documents/generate"
                  element={<DocumentGenerationPage />}
                />
              </Route>

              {/* ── HR Management — view ── */}
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={PERMISSIONS.VIEW_HR_EMPLOYEES}
                  />
                }
              >
                <Route path="/hr/staff" element={<AllStaffList />} />
                <Route path="/hr/staff/:id" element={<StaffDetailPage />} />
                <Route path="/hr/attendance" element={<HrAttendancePage />} />
                <Route path="/hr/documents" element={<HrDocumentsPage />} />
              </Route>

              {/* ── Appraisals — gated on the permission the appraisal API
                  itself enforces (VIEW_APPRAISALS), with HR viewers still
                  admitted. ── */}
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={[
                      PERMISSIONS.VIEW_APPRAISALS,
                      PERMISSIONS.MANAGE_APPRAISALS,
                      PERMISSIONS.VIEW_HR_EMPLOYEES,
                    ]}
                  />
                }
              >
                <Route path="/hr/appraisals" element={<AppraisalPage />} />
                <Route path="/hr/monitoring" element={<HrMonitoringDashboard />} />
                <Route path="/hr/monitoring/performance" element={<PerformanceMonitoringPage />} />
              </Route>

              {/* ── Payroll — the payroll endpoints are gated server-side on
                  VIEW_PAYROLL / MANAGE_PAYROLL, not on VIEW_HR_EMPLOYEES.
                  Guarding these pages on the HR-staff permission meant a
                  payroll officer holding VIEW_PAYROLL was bounced back to "/",
                  while an HR viewer without it reached a page that only
                  answered 403. ── */}
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={[
                      PERMISSIONS.VIEW_PAYROLL,
                      PERMISSIONS.MANAGE_PAYROLL,
                    ]}
                  />
                }
              >
                <Route path="/hr/payroll" element={<PayrollPage />} />
                <Route path="/hr/payroll/:id" element={<PayrollSlipPage />} />
                <Route path="/hr/payroll-management" element={<PayrollManagementPage />} />
                <Route path="/hr/payments" element={<PaymentsPage />} />
              </Route>

              {/* ── Leave management — any HR viewer OR leave view/approve role ── */}
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={[
                      PERMISSIONS.VIEW_HR_EMPLOYEES,
                      PERMISSIONS.VIEW_LEAVE_REQUESTS,
                      PERMISSIONS.MANAGE_LEAVE_REQUESTS,
                    ]}
                  />
                }
              >
                <Route path="/hr/leave" element={<LeavePage />} />
              </Route>

              {/* ── Leave approvals — the reviewer's own stage queue. Gated on
                  holding ANY leave stage permission, so a HOD who cannot see
                  the whole HR leave register can still decide what is parked
                  with them. ── */}
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={[
                      ...LEAVE_STAGE_PERMISSIONS,
                      PERMISSIONS.MANAGE_LEAVE_REQUESTS,
                    ]}
                  />
                }
              >
                <Route
                  path="/hr/leave/approvals"
                  element={<LeaveApprovalQueuePage />}
                />
                <Route
                  path="/hr/leave/supervisor-approvals"
                  element={<SupervisorLeaveApprovalDashboard />}
                />
              </Route>

              {/* ── HR Management — manage only ── */}
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={PERMISSIONS.MANAGE_HR_EMPLOYEES}
                  />
                }
              >
                <Route path="/hr/settings" element={<HrSettingsPage />} />
                <Route path="/hr/import-export" element={<HRImportExportPage />} />
                <Route path="/hr/contracts" element={<ContractManagementPage />} />
              </Route>

              {/* ── Notification centre — self-scoped, so authentication is
                  the only gate; no permission grants access to anyone else's. ── */}
              <Route path="/notifications" element={<NotificationsPage />} />

              {/* ── Staff self-service: leave ── */}
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={PERMISSIONS.REQUEST_LEAVE}
                  />
                }
              >
                <Route path="/me/leave" element={<MyLeavePage />} />
              </Route>

              {/* ── Teacher (lecturer) self-service portal ──
                  Gated on ACCESS_TEACHER_PORTAL, NOT VIEW_MY_MODULES — the
                  student role holds that slug too. Every page underneath is
                  additionally scoped server-side to the lecturer's own
                  assignments (App\Helpers\LecturerScope). */}
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={PERMISSIONS.ACCESS_TEACHER_PORTAL}
                    allowWhenTeaching
                  />
                }
              >
                <Route path="/teacher" element={<TeacherDashboardPage />} />
                <Route path="/teacher/courses" element={<TeacherCoursesPage />} />
                <Route
                  path="/teacher/courses/:moduleId"
                  element={<TeacherCourseDetailPage />}
                />
                <Route path="/teacher/students" element={<TeacherStudentsPage />} />
                <Route path="/teacher/calendar" element={<TeacherCalendarPage />} />
                <Route path="/teacher/exams" element={<TeacherExamsPage />} />
                <Route
                  path="/teacher/exams/:id"
                  element={<TeacherExamAttendancePage />}
                />
              </Route>

              {/* ── Student self-service ── */}
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={PERMISSIONS.ACCESS_STUDENT_PORTAL}
                  />
                }
              >
                <Route
                  path="/me/profile"
                  element={<StudentDetailsPage selfMode />}
                />
              </Route>

              <Route
                path="/my-finance"
                element={
                  <ProtectedRoute requiredPermissions={PERMISSIONS.MY_INVOICE} />
                }
              >
                <Route index element={<MyFinancePage />} />
              </Route>

              {/* ── Academic Settings ── */}
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={[
                      PERMISSIONS.MANAGE_ACADEMICS,
                      PERMISSIONS.MANAGE_DEPARTMENTS,
                      PERMISSIONS.MANAGE_OPTIONS,
                      PERMISSIONS.MANAGE_MODULES,
                      PERMISSIONS.MANAGE_MODULE_SCHEDULES,
                      PERMISSIONS.MANAGE_MODULE_REGISTRATIONS,
                      PERMISSIONS.MANAGE_ACADEMIC_YEARS,
                      PERMISSIONS.MANAGE_ACADEMIC_TERMS,
                      PERMISSIONS.VIEW_SYSTEM_BASICS,
                    ]}
                  />
                }
              >
                <Route
                  path="/academic/settings"
                  element={<AcademicSettingsPage />}
                />
              </Route>

              {/* ── Academic Management ── */}
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={[
                      PERMISSIONS.MANAGE_ACADEMICS,
                      PERMISSIONS.MANAGE_DEGREES,
                      PERMISSIONS.MANAGE_FACILITIES,
                      PERMISSIONS.MANAGE_DEPARTMENTS,
                      PERMISSIONS.MANAGE_OPTIONS,
                      PERMISSIONS.MANAGE_LEVELS,
                      PERMISSIONS.MANAGE_SCHOOLS,
                      PERMISSIONS.MANAGE_LEAVE_TYPES,
                      PERMISSIONS.MANAGE_CAMPUSES,
                      PERMISSIONS.MANAGE_ADMISSIONS,
                    ]}
                  />
                }
              >
                <Route
                  path="/academic/management"
                  element={<AcademicsManagementPage />}
                />
              </Route>

              {/* ── Grading Scale ── */}
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={[
                      PERMISSIONS.MANAGE_GRADING_SCALES,
                      PERMISSIONS.VIEW_SYSTEM_BASICS,
                    ]}
                  />
                }
              >
                <Route path="/academic/grading-scale" element={<AcademicGradingScalePage />} />
              </Route>

              {/* ── Transcript modules — changes what a signed document says,
                  so it is gated like marks management, matching the API. ── */}
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={[
                      PERMISSIONS.MANAGE_MODULE_MARKS,
                      PERMISSIONS.MANAGE_ACADEMICS,
                    ]}
                  />
                }
              >
                <Route path="/academic/transcript-modules" element={<TranscriptModulesPage />} />
              </Route>

              {/* ── System settings — the home for the endpoints VIEW_SETTINGS
                  and MANAGE_SETTINGS guard. ── */}
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={[
                      PERMISSIONS.VIEW_SETTINGS,
                      PERMISSIONS.MANAGE_SETTINGS,
                    ]}
                  />
                }
              >
                <Route path="/settings" element={<SystemSettingsPage />} />
              </Route>

              {/* ── System Documents (Fee Structures, Policies, etc.) ── */}
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={[
                      PERMISSIONS.MANAGE_ACADEMIC_SETTINGS,
                      PERMISSIONS.VIEW_SYSTEM_BASICS,
                    ]}
                  />
                }
              >
                <Route path="/academic/system-documents" element={<SystemDocumentsPage />} />
              </Route>

              {/* ── Transcript Requests ── */}
              <Route
                element={<ProtectedRoute requiredPermissions={[PERMISSIONS.MANAGE_TRANSCRIPT_REQUESTS]} />}
              >
                <Route path="/academic/transcript-requests" element={<TranscriptRequestsPage />} />
              </Route>

              {/* ── Graduand Management ── */}
              <Route
                element={<ProtectedRoute requiredPermissions={[PERMISSIONS.VIEW_GRADUANDS, PERMISSIONS.MANAGE_GRADUANDS]} />}
              >
                <Route path="/academic/graduands" element={<GraduandManagementPage />} />
              </Route>

              {/* ── Academic Certificates ── */}
              <Route
                element={<ProtectedRoute requiredPermissions={[PERMISSIONS.MANAGE_ACADEMIC_CERTIFICATES]} />}
              >
                <Route path="/academic/certificates" element={<AcademicCertificatesPage />} />
              </Route>

              {/* ── Academic Analytics Dashboard ── */}
              <Route
                element={<ProtectedRoute requiredPermissions={[PERMISSIONS.VIEW_ACADEMIC_ANALYTICS]} />}
              >
                <Route path="/academic/analytics" element={<AcademicAnalyticsPage />} />
              </Route>

              {/* ── Gate Management ── */}
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={[
                      PERMISSIONS.ACCESS_GATE,
                      PERMISSIONS.MANAGE_GATE,
                      PERMISSIONS.VIEW_GATE_LOGS,
                    ]}
                  />
                }
              >
                <Route path="/gate" element={<GateManagementPage />} />
              </Route>

              {/* ── Admissions ── */}
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={[
                      PERMISSIONS.MANAGE_STUDENT_APPLICATIONS,
                      PERMISSIONS.VERIFY_DOCUMENTS,
                      PERMISSIONS.MANAGE_ADMISSIONS,
                      PERMISSIONS.MANAGE_ADMISSION_REQUIREMENTS,
                    ]}
                  />
                }
              >
                <Route path="/admin/admissions" element={<AdmissionsHub />}>
                  <Route index element={<ApplicationsListPage />} />
                  <Route
                    path="applications"
                    element={<ApplicationsListPage />}
                  />
                  <Route
                    path="applications/:id"
                    element={<ApplicationDetailPage />}
                  />
                  <Route path="verifications" element={<VerificationsPage />} />
                  <Route
                    path="verifications/:id/validate"
                    element={<DocumentValidationCarousel />}
                  />
                  <Route path="offers" element={<OffersPage />} />
                  <Route path="requirements" element={<RequirementsPage />} />
                  <Route
                    path="document-types"
                    element={<DocumentTypesPage />}
                  />
                  <Route path="intakes" element={<IntakesManagementPage />} />
                  <Route path="intakes" element={<IntakesManagementPage />} />
                  {/* Task 1.14 — applicant statistics report. */}
                  <Route
                    path="statistics"
                    element={<ApplicationStatisticsPage />}
                  />
                </Route>
              </Route>

              {/* Merit lists — /api/applications/merit is gated on the merit
                  slugs, so this cannot sit inside the admissions guard. */}
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={[
                      PERMISSIONS.VIEW_MERIT_LIST,
                      PERMISSIONS.MANAGE_MERIT_LIST,
                      PERMISSIONS.MANAGE_ADMISSIONS,
                    ]}
                  />
                }
              >
                <Route path="/admin/admissions" element={<AdmissionsHub />}>
                  <Route path="merit" element={<MeritPage />} />
                </Route>
              </Route>

              {/* Task 1.13 — international students compliance list. Served by
                  /api/students/international, which is gated on VIEW_STUDENTS,
                  so it is guarded on that rather than on the admissions set. */}
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={PERMISSIONS.VIEW_STUDENTS}
                  />
                }
              >
                <Route
                  path="/admin/international-students"
                  element={<InternationalStudentsPage />}
                />
              </Route>

              {/* ── Applicant Portal ── */}
              <Route
                element={
                  <ProtectedRoute
                    requiredRoles="applicant"
                    requiredPermissions={[PERMISSIONS.ACCESS_APPLICANT_PORTAL]}
                  />
                }
              >
                <Route path="/applicant" element={<ApplicantOverviewPage />} />
                <Route
                  path="/applicant/documents"
                  element={<ApplicantDocumentsPage />}
                />
              </Route>

              {/* ── Modules Management ── */}
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={[
                      PERMISSIONS.MANAGE_MODULES,
                      PERMISSIONS.MANAGE_MODULE_SCHEDULES,
                      PERMISSIONS.MANAGE_MODULE_ASSIGNMENTS,
                      PERMISSIONS.MANAGE_MODULE_REGISTRATIONS,
                      PERMISSIONS.VIEW_MODULE_MARKS,
                      PERMISSIONS.RECORD_MODULE_MARKS,
                      PERMISSIONS.MANAGE_MODULE_MARKS,
                    ]}
                  />
                }
              >
                <Route path="/modules" element={<ModulesHub />}>
                  <Route index element={<ModulesCatalogPage />} />
                  <Route path="catalog" element={<ModulesCatalogPage />} />
                  <Route path="scheduling" element={<ModulesSchedulePage />} />
                  <Route
                    path="assignments"
                    element={<ModulesAssignmentsPage />}
                  />
                  <Route
                    path="registrations"
                    element={<ModulesRegistrationAdminPage />}
                  />
                  <Route path="marks" element={<ModulesMarksPage />} />
                </Route>
              </Route>

              {/* ── Timetable — read surface over module_schedules. ── */}
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={[
                      PERMISSIONS.VIEW_TIMETABLE,
                      PERMISSIONS.MANAGE_TIMETABLE,
                      PERMISSIONS.MANAGE_MODULE_SCHEDULES,
                    ]}
                  />
                }
              >
                <Route path="/timetable" element={<TimetablePage />} />
              </Route>

              {/* ── My Modules (staff/student) ── */}
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={PERMISSIONS.VIEW_MY_MODULES}
                  />
                }
              >
                <Route path="/my-modules" element={<MyRegistrationsPage />} />
              </Route>

              {/* ── Programs ── */}
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={PERMISSIONS.MANAGE_ACADEMICS}
                  />
                }
              >
                <Route path="/programs" element={<ProgramsPage />} />
              </Route>

              {/* ── Finance ── */}
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={[
                      PERMISSIONS.VIEW_FINANCE,
                      PERMISSIONS.MANAGE_FINANCE,
                      PERMISSIONS.VIEW_FINANCE_OVERVIEW,
                      PERMISSIONS.VIEW_FINANCE_BILLING,
                      PERMISSIONS.VIEW_FINANCE_REPORTS,
                      PERMISSIONS.VIEW_FINANCE_STRUCTURES,
                      PERMISSIONS.VIEW_FINANCE_BURSARIES,
                      PERMISSIONS.VIEW_FINANCE_APPROVALS,
                      PERMISSIONS.VIEW_FINANCE_SPONSORS,
                      PERMISSIONS.VIEW_FINANCE_EXPENSES,
                      PERMISSIONS.VIEW_FINANCE_REFUNDS,
                      PERMISSIONS.VIEW_FINANCE_BALANCE,
                      PERMISSIONS.VIEW_FINANCE_CLEARANCE,
                      PERMISSIONS.VIEW_STUDENT_DIRECTORY_FINANCE,
                      PERMISSIONS.VIEW_ONLINE_PAYMENTS_HISTORY,
                      PERMISSIONS.VIEW_MOBILE_PAYMENTS,
                      PERMISSIONS.VIEW_PAYMENT_CALENDAR,
                      PERMISSIONS.MANAGE_PAYMENT_CALENDAR,
                      PERMISSIONS.VIEW_BUDGET_EXECUTION,
                      PERMISSIONS.MANAGE_BUDGET_EXECUTION,
                      PERMISSIONS.VIEW_FINES,
                      PERMISSIONS.MANAGE_FINES,
                    ]}
                  />
                }
              >
                <Route path="/finance" element={<FinanceHub />}>
                  <Route index element={<FinanceOverviewPage />} />
                  <Route path="billing" element={<StudentBillingPage />} />
                  <Route path="billing/*" element={<StudentLedgerPage />} />
                  <Route path="approvals" element={<PaymentApprovalsPage />} />
                  <Route path="bordereau-verification" element={<BordereauVerificationPage />} />
                  <Route
                    element={
                      <ProtectedRoute
                        requiredPermissions={[
                          PERMISSIONS.VIEW_ONLINE_PAYMENTS_HISTORY,
                          PERMISSIONS.VIEW_MOBILE_PAYMENTS,
                          PERMISSIONS.MANAGE_FINANCE,
                        ]}
                      />
                    }
                  >
                    <Route
                      path="online-payments"
                      element={<OnlinePaymentsHistoryPage />}
                    />
                  </Route>
                  <Route path="structures" element={<FeeStructuresPage />} />
                  <Route path="pg-intl-structures" element={<PostgraduateInternationalFeesPage />} />
                  <Route
                    element={
                      <ProtectedRoute
                        requiredPermissions={[
                          PERMISSIONS.VIEW_STUDENT_DIRECTORY_FINANCE,
                        ]}
                      />
                    }
                  >
                    <Route path="students" element={<StudentDirectoryPage />} />
                  </Route>
                  <Route path="fee-types" element={<FeeTypesPage />} />
                  <Route path="per-credit-rates" element={<PerCreditRatesPage />} />
                  <Route path="bursaries" element={<BursariesPage />} />
                  <Route path="sponsors" element={<SponsorsPage />} />
                  <Route path="expenses" element={<ExpensesPage />} />
                  <Route
                    path="expenses/categories"
                    element={<ExpenseCategoriesPage />}
                  />
                  <Route path="balance" element={<AccountBalancePage />} />
                  <Route path="clearance" element={<ClearancePage />} />
                  <Route path="refunds" element={<RefundsPage />} />
                  <Route path="reports" element={<RevenueReportPage />} />
                  <Route path="app-fee-reconciliation" element={<AppFeeReconciliationPage />} />
                  <Route
                    element={
                      <ProtectedRoute
                        requiredPermissions={[
                          PERMISSIONS.VIEW_FINES,
                          PERMISSIONS.MANAGE_FINES,
                        ]}
                      />
                    }
                  >
                    <Route path="fines" element={<FinesManagementPage />} />
                  </Route>
                  <Route
                    element={
                      <ProtectedRoute
                        requiredPermissions={[
                          PERMISSIONS.SEND_FEE_ALERTS,
                          PERMISSIONS.MANAGE_FINANCE,
                        ]}
                      />
                    }
                  >
                    <Route path="overdue-alerts" element={<OverdueAlertsPage />} />
                  <Route path="documents" element={<SystemDocumentsPage />} />
                  </Route>
                  <Route
                    element={
                      <ProtectedRoute
                        requiredPermissions={[
                          PERMISSIONS.VIEW_PAYMENT_CALENDAR,
                          PERMISSIONS.MANAGE_PAYMENT_CALENDAR,
                        ]}
                      />
                    }
                  >
                    <Route path="payment-calendar" element={<PaymentCalendarPage />} />
                  </Route>
                  <Route
                    element={
                      <ProtectedRoute
                        requiredPermissions={[
                          PERMISSIONS.VIEW_BUDGET_EXECUTION,
                          PERMISSIONS.MANAGE_BUDGET_EXECUTION,
                        ]}
                      />
                    }
                  >
                    <Route path="budget-execution" element={<BudgetExecutionPage />} />
                    <Route path="financial-plan" element={<BudgetPlanPage />} />
                  </Route>
                </Route>
              </Route>

              {/* ── Registrar ── */}
              <Route path="/registrar/report" element={<RegistrarReportPage />} />

              {/* ── Exams ── */}
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={[
                      PERMISSIONS.VIEW_EXAMS,
                      PERMISSIONS.MANAGE_EXAMS,
                      PERMISSIONS.MANAGE_MODULE_SCHEDULES,
                    ]}
                  />
                }
              >
                <Route path="/exams" element={<ExamSchedulesPage />} />
              </Route>
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={[
                      PERMISSIONS.MANAGE_EXAMS,
                      PERMISSIONS.MANAGE_DELIBERATIONS,
                      PERMISSIONS.VIEW_MODULE_MARKS,
                      PERMISSIONS.RECORD_MODULE_MARKS,
                      PERMISSIONS.MANAGE_MODULE_MARKS,
                    ]}
                  />
                }
              >
                <Route path="/exams/results" element={<ExamResultsPage />} />
                <Route
                  path="/exams/deliberation"
                  element={<DeliberationPage />}
                />
              </Route>

              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={[PERMISSIONS.MANAGE_GRADING_SCALES]}
                  />
                }
              >
                <Route path="/exams/grading-scale" element={<GradingScalePage />} />
              </Route>

              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={[PERMISSIONS.MANAGE_REVALUATIONS]}
                  />
                }
              >
                <Route path="/exams/revaluations" element={<RevaluationsPage />} />
              </Route>

              {/* ── System Logs ── */}
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={PERMISSIONS.VIEW_SYSTEM_LOGS}
                  />
                }
              >
                <Route path="/logs" element={<LogsPage />} />
              </Route>

              {/* ── Attendance ── */}
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={[
                      PERMISSIONS.VIEW_ATTENDANCE,
                      PERMISSIONS.RECORD_ATTENDANCE,
                      PERMISSIONS.MANAGE_ATTENDANCE,
                    ]}
                  />
                }
              >
                <Route path="/attendance" element={<AttendancePage />} />
              </Route>

              {/* ── Coming soon / placeholder routes ── */}
              <Route path="/students/new" element={<ComingSoonPage />} />
              <Route path="/teachers" element={<ComingSoonPage />} />
              <Route path="/teachers/schedules" element={<ComingSoonPage />} />
              <Route path="/library" element={<ComingSoonPage />} />
              <Route path="/account/billing" element={<ComingSoonPage />} />
              <Route path="/account/salaries" element={<ComingSoonPage />} />
              <Route path="/class" element={<ComingSoonPage />} />
              <Route path="/subject" element={<ComingSoonPage />} />
              <Route path="/routine" element={<ComingSoonPage />} />
              <Route path="/notice" element={<ComingSoonPage />} />
              <Route path="/transport" element={<ComingSoonPage />} />
              <Route path="/hostel" element={<ComingSoonPage />} />
            </Route>
          </Route>

          {/* Finance receipt — standalone for clean printing */}
          <Route
            element={
              <ProtectedRoute
                requiredPermissions={[
                  PERMISSIONS.VIEW_FINANCE,
                  PERMISSIONS.MANAGE_FINANCE,
                ]}
              />
            }
          >
            <Route
              path="/finance/receipt/:paymentId"
              element={<ReceiptPdfPage />}
            />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;

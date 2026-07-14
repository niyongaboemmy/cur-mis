import { Routes, Route } from "react-router-dom";
import { useEffect, Suspense } from "react";
import MainLayout from "@/layouts/MainLayout";
import ProtectedRoute from "@/components/layout/ProtectedRoute";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import { useThemeStore } from "@/store/themeStore";
import { PERMISSIONS } from "@/constants/permissions";

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
import AppraisalPage from "@/pages/hr/AppraisalPage";

// Academic
import AcademicSettingsPage from "@/pages/academic/AcademicSettingsPage";
import AcademicsManagementPage from "@/pages/academic/AcademicsManagementPage";
import AcademicGradingScalePage from "@/pages/academic/GradingScalePage";
import TranscriptRequestsPage from "@/pages/academic/TranscriptRequestsPage";
import GraduandManagementPage from "@/pages/academic/GraduandManagementPage";
import AcademicCertificatesPage from "@/pages/academic/AcademicCertificatesPage";
import AcademicAnalyticsPage from "@/pages/academic/AcademicAnalyticsPage";

// Gate Management Module
import GateManagementPage from "@/pages/gate/GateManagementPage";

// Admissions / Student Management Module
import ApplyPage from "@/pages/public/ApplyPage";
import TrackApplicationPage from "@/pages/public/TrackApplicationPage";
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

// Finance
import FinanceHub from "@/pages/finance/FinanceHub";
import FinanceOverviewPage from "@/pages/finance/FinanceOverviewPage";
import StudentLedgerPage from "@/pages/finance/StudentLedgerPage";
import StudentBillingPage from "@/pages/finance/StudentBillingPage";
import PaymentApprovalsPage from "@/pages/finance/PaymentApprovalsPage";
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
              {/* Self-service payroll — every authenticated user sees their own
                  payslip history; data is scoped server-side to their account. */}
              <Route path="/me/payroll" element={<MyPayrollPage />} />
              <Route path="/messages" element={<MessagesPage />} />
              <Route path="/announcements" element={<AnnouncementsPage />} />
              <Route path="/forums" element={<ForumsPage />} />
              <Route path="/forums/threads/:id" element={<ForumThreadPage />} />

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
                <Route path="/hr/staff" element={<StaffListPage />} />
                <Route path="/hr/staff/:id" element={<StaffDetailPage />} />
                <Route path="/hr/attendance" element={<HrAttendancePage />} />
                <Route path="/hr/documents" element={<HrDocumentsPage />} />
                <Route path="/hr/payroll" element={<PayrollPage />} />
                <Route path="/hr/payroll/:id" element={<PayrollSlipPage />} />
                <Route path="/hr/payments" element={<PaymentsPage />} />
                <Route path="/hr/appraisals" element={<AppraisalPage />} />
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

              {/* ── HR Management — manage only ── */}
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={PERMISSIONS.MANAGE_HR_EMPLOYEES}
                  />
                }
              >
                <Route path="/hr/settings" element={<HrSettingsPage />} />
              </Route>

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
                <Route
                  path="/my-finance"
                  element={
                    <ProtectedRoute requiredPermissions={PERMISSIONS.MY_INVOICE} />
                  }
                >
                  <Route index element={<MyFinancePage />} />
                </Route>
              </Route>

              {/* ── Academic Settings ── */}
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={[
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
                element={<ProtectedRoute requiredPermissions={[PERMISSIONS.VIEW_SYSTEM_BASICS]} />}
              >
                <Route path="/academic/grading-scale" element={<AcademicGradingScalePage />} />
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
                  <Route path="merit" element={<MeritPage />} />
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
                {/* Task 1.13 — international students compliance list. */}
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
                    ]}
                  />
                }
              >
                <Route path="/finance" element={<FinanceHub />}>
                  <Route index element={<FinanceOverviewPage />} />
                  <Route path="billing" element={<StudentBillingPage />} />
                  <Route path="billing/*" element={<StudentLedgerPage />} />
                  <Route path="approvals" element={<PaymentApprovalsPage />} />
                  <Route
                    element={
                      <ProtectedRoute
                        requiredPermissions={[
                          PERMISSIONS.VIEW_ONLINE_PAYMENTS_HISTORY,
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
                  </Route>
                </Route>
              </Route>

              {/* ── Exams ── */}
              <Route
                element={
                  <ProtectedRoute
                    requiredPermissions={[
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

<?php

declare(strict_types=1);

use App\Controllers\HRImportExportController;
use App\Controllers\LeaveApprovalController;
use App\Controllers\PayrollController;
use App\Controllers\ContractController;
use App\Controllers\ReportController;
use App\Controllers\HRAnalyticsController;

/**
 * HR Import & Export API Routes
 *
 * Handles CSV/Excel file uploads and downloads for HR module
 * Routes:
 * - GET /api/hr/import/template/:type - Download import template
 * - POST /api/hr/import/validate - Validate import file
 * - POST /api/hr/import/process - Process validated import
 * - GET /api/hr/export/:type - Export HR data to Excel/CSV
 */

$router->group('/api/hr', function ($router) {

    // ── Import Template Download ──────────────────────────────────────────────
    $router->get('/import/template/:type', [HRImportExportController::class, 'downloadTemplate']);

    // ── Import Validation ─────────────────────────────────────────────────────
    $router->post('/import/validate', [HRImportExportController::class, 'validateImport'], [
        'middlewares' => ['auth']
    ]);

    // ── Process Import ────────────────────────────────────────────────────────
    $router->post('/import/process', [HRImportExportController::class, 'processImport'], [
        'middlewares' => ['auth', 'can:MANAGE_HR_MODULE']
    ]);

    // ── Export Data ───────────────────────────────────────────────────────────
    $router->get('/export/:type', [HRImportExportController::class, 'exportData'], [
        'middlewares' => ['auth']
    ]);

    // ── Leave Approval Routes ─────────────────────────────────────────────────
    $router->get('/leave/approvals/queue', [LeaveApprovalController::class, 'queue'], [
        'middlewares' => ['auth']
    ]);

    $router->get('/leave/requests/:id/progress', [LeaveApprovalController::class, 'progress'], [
        'middlewares' => ['auth']
    ]);

    $router->post('/leave/approvals/:id/decide', [LeaveApprovalController::class, 'decide'], [
        'middlewares' => ['auth']
    ]);

    $router->get('/leave/types/:id/stages', [LeaveApprovalController::class, 'stages'], [
        'middlewares' => ['auth', 'can:MANAGE_LEAVE_REQUESTS']
    ]);

    $router->post('/leave/types/:id/stages', [LeaveApprovalController::class, 'saveStages'], [
        'middlewares' => ['auth', 'can:MANAGE_LEAVE_REQUESTS']
    ]);

    // ── Payroll Routes ───────────────────────────────────────────────────────
    $router->get('/payroll/structures', [PayrollController::class, 'getStructures'], [
        'middlewares' => ['auth', 'can:VIEW_PAYROLL']
    ]);

    $router->get('/payroll/structures/:id', [PayrollController::class, 'getStructure'], [
        'middlewares' => ['auth', 'can:VIEW_PAYROLL']
    ]);

    $router->post('/payroll/structures', [PayrollController::class, 'saveStructure'], [
        'middlewares' => ['auth', 'can:MANAGE_PAYROLL']
    ]);

    $router->get('/payroll/employee/:userId/salary', [PayrollController::class, 'getEmployeeSalary'], [
        'middlewares' => ['auth', 'can:VIEW_PAYROLL']
    ]);

    $router->post('/payroll/employee/:userId/salary', [PayrollController::class, 'assignEmployeeSalary'], [
        'middlewares' => ['auth', 'can:MANAGE_PAYROLL']
    ]);

    $router->get('/payroll/runs', [PayrollController::class, 'getPayrollRuns'], [
        'middlewares' => ['auth', 'can:VIEW_PAYROLL']
    ]);

    $router->get('/payroll/runs/:id', [PayrollController::class, 'getPayrollRun'], [
        'middlewares' => ['auth', 'can:VIEW_PAYROLL']
    ]);

    $router->post('/payroll/runs', [PayrollController::class, 'createPayrollRun'], [
        'middlewares' => ['auth', 'can:MANAGE_PAYROLL']
    ]);

    $router->post('/payroll/runs/:id/process', [PayrollController::class, 'processPayrollRun'], [
        'middlewares' => ['auth', 'can:MANAGE_PAYROLL']
    ]);

    $router->post('/payroll/runs/:id/approve', [PayrollController::class, 'approvePayrollRun'], [
        'middlewares' => ['auth', 'can:MANAGE_PAYROLL']
    ]);

    $router->post('/payroll/runs/:id/mark-paid', [PayrollController::class, 'markPayrollPaid'], [
        'middlewares' => ['auth', 'can:MANAGE_PAYROLL']
    ]);

    $router->get('/payroll/component-types', [PayrollController::class, 'getComponentTypes'], [
        'middlewares' => ['auth']
    ]);

    // ── Contract Routes ──────────────────────────────────────────────────────
    $router->get('/contracts', [ContractController::class, 'getContracts'], [
        'middlewares' => ['auth', 'can:VIEW_HR_EMPLOYEES']
    ]);

    $router->get('/contracts/:id', [ContractController::class, 'getContract'], [
        'middlewares' => ['auth', 'can:VIEW_HR_EMPLOYEES']
    ]);

    $router->post('/contracts', [ContractController::class, 'saveContract'], [
        'middlewares' => ['auth', 'can:MANAGE_HR_EMPLOYEES']
    ]);

    $router->post('/contracts/:id/approve', [ContractController::class, 'approveContract'], [
        'middlewares' => ['auth', 'can:MANAGE_HR_EMPLOYEES']
    ]);

    $router->post('/contracts/:id/renew', [ContractController::class, 'renewContract'], [
        'middlewares' => ['auth', 'can:MANAGE_HR_EMPLOYEES']
    ]);

    $router->post('/contracts/:id/terminate', [ContractController::class, 'terminateContract'], [
        'middlewares' => ['auth', 'can:MANAGE_HR_EMPLOYEES']
    ]);

    $router->get('/contracts/types', [ContractController::class, 'getContractTypes'], [
        'middlewares' => ['auth']
    ]);

    $router->get('/contracts/renewal/pending', [ContractController::class, 'getPendingRenewals'], [
        'middlewares' => ['auth', 'can:MANAGE_HR_EMPLOYEES']
    ]);

    $router->get('/contracts/expired', [ContractController::class, 'getExpiredContracts'], [
        'middlewares' => ['auth', 'can:MANAGE_HR_EMPLOYEES']
    ]);

    $router->get('/contracts/employee/:userId', [ContractController::class, 'getEmployeeContract'], [
        'middlewares' => ['auth', 'can:VIEW_HR_EMPLOYEES']
    ]);

    $router->get('/contracts/employee/:userId/history', [ContractController::class, 'getEmployeeContractHistory'], [
        'middlewares' => ['auth', 'can:VIEW_HR_EMPLOYEES']
    ]);

    $router->get('/contracts/summary', [ContractController::class, 'getContractSummary'], [
        'middlewares' => ['auth', 'can:MANAGE_HR_EMPLOYEES']
    ]);

    // ── Report Routes ────────────────────────────────────────────────────────
    $router->get('/reports/employee-master-list', [ReportController::class, 'generateEmployeeMasterListPDF'], [
        'middlewares' => ['auth', 'can:VIEW_HR_EMPLOYEES']
    ]);

    $router->get('/reports/payroll/:payrollRunId', [ReportController::class, 'generatePayrollSummaryPDF'], [
        'middlewares' => ['auth', 'can:VIEW_PAYROLL']
    ]);

    $router->get('/reports/leave/:leaveRequestId', [ReportController::class, 'generateLeaveRequestPDF'], [
        'middlewares' => ['auth', 'can:VIEW_LEAVE_REQUESTS']
    ]);

    $router->post('/reports/salary-certificate', [ReportController::class, 'generateSalaryCertificatePDF'], [
        'middlewares' => ['auth']
    ]);

    $router->get('/reports/service-certificate/:userId', [ReportController::class, 'generateServiceCertificatePDF'], [
        'middlewares' => ['auth']
    ]);

    $router->get('/reports/contract/:contractId', [ReportController::class, 'generateContractSummaryPDF'], [
        'middlewares' => ['auth', 'can:VIEW_HR_EMPLOYEES']
    ]);

    $router->get('/reports/dashboard', [ReportController::class, 'generateHRDashboardReportPDF'], [
        'middlewares' => ['auth', 'can:MANAGE_HR_EMPLOYEES']
    ]);

    // ── Analytics Routes ─────────────────────────────────────────────────────
    $router->get('/employees/by-department', [HRAnalyticsController::class, 'getEmployeesByDepartment'], [
        'middlewares' => ['auth', 'can:VIEW_HR_EMPLOYEES']
    ]);

    $router->get('/leave/by-type', [HRAnalyticsController::class, 'getLeaveUsageByType'], [
        'middlewares' => ['auth', 'can:VIEW_LEAVE_REQUESTS']
    ]);

    $router->get('/payroll/trends', [HRAnalyticsController::class, 'getPayrollTrends'], [
        'middlewares' => ['auth', 'can:VIEW_PAYROLL']
    ]);

    $router->get('/leave/approval-metrics', [HRAnalyticsController::class, 'getLeaveApprovalMetrics'], [
        'middlewares' => ['auth', 'can:VIEW_LEAVE_REQUESTS']
    ]);

    $router->get('/analytics/contract-metrics', [HRAnalyticsController::class, 'getContractMetrics'], [
        'middlewares' => ['auth', 'can:VIEW_HR_EMPLOYEES']
    ]);

    $router->get('/analytics/payroll-metrics', [HRAnalyticsController::class, 'getPayrollMetrics'], [
        'middlewares' => ['auth', 'can:VIEW_PAYROLL']
    ]);

    $router->get('/analytics/salary-distribution', [HRAnalyticsController::class, 'getSalaryDistribution'], [
        'middlewares' => ['auth', 'can:VIEW_PAYROLL']
    ]);

    $router->get('/analytics/headcount-trend', [HRAnalyticsController::class, 'getHeadcountTrend'], [
        'middlewares' => ['auth', 'can:VIEW_HR_EMPLOYEES']
    ]);

    $router->get('/analytics/contract-expiry-by-dept', [HRAnalyticsController::class, 'getContractExpiryByDepartment'], [
        'middlewares' => ['auth', 'can:MANAGE_HR_EMPLOYEES']
    ]);

    $router->get('/analytics/leave-balance-overview', [HRAnalyticsController::class, 'getLeaveBalanceOverview'], [
        'middlewares' => ['auth', 'can:VIEW_LEAVE_REQUESTS']
    ]);

});

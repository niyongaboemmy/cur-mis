<?php

declare(strict_types=1);

use App\Controllers\HRImportExportController;
use App\Controllers\LeaveApprovalController;
use App\Controllers\PayrollController;
use App\Controllers\ContractController;
use App\Controllers\ReportController;
use App\Controllers\HRAnalyticsController;
use App\Middleware\AuthMiddleware;
use App\Middleware\CanMiddleware;

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
        AuthMiddleware::class
    ]);

    // ── Process Import ────────────────────────────────────────────────────────
    $router->post('/import/process', [HRImportExportController::class, 'processImport'], [
        AuthMiddleware::class, CanMiddleware::class . ':MANAGE_HR_MODULE'
    ]);

    // ── Export Data ───────────────────────────────────────────────────────────
    $router->get('/export/:type', [HRImportExportController::class, 'exportData'], [
        AuthMiddleware::class
    ]);

    // ── Leave Approval Routes ─────────────────────────────────────────────────
    $router->get('/leave/approvals/queue', [LeaveApprovalController::class, 'queue'], [
        AuthMiddleware::class
    ]);

    $router->get('/leave/requests/:id/progress', [LeaveApprovalController::class, 'progress'], [
        AuthMiddleware::class
    ]);

    $router->post('/leave/approvals/:id/decide', [LeaveApprovalController::class, 'decide'], [
        AuthMiddleware::class
    ]);

    $router->get('/leave/types/:id/stages', [LeaveApprovalController::class, 'stages'], [
        AuthMiddleware::class, CanMiddleware::class . ':MANAGE_LEAVE_REQUESTS'
    ]);

    $router->post('/leave/types/:id/stages', [LeaveApprovalController::class, 'saveStages'], [
        AuthMiddleware::class, CanMiddleware::class . ':MANAGE_LEAVE_REQUESTS'
    ]);

    // ── Payroll Routes ───────────────────────────────────────────────────────
    $router->get('/payroll/structures', [PayrollController::class, 'getStructures'], [
        AuthMiddleware::class, CanMiddleware::class . ':VIEW_PAYROLL'
    ]);

    $router->get('/payroll/structures/:id', [PayrollController::class, 'getStructure'], [
        AuthMiddleware::class, CanMiddleware::class . ':VIEW_PAYROLL'
    ]);

    $router->post('/payroll/structures', [PayrollController::class, 'saveStructure'], [
        AuthMiddleware::class, CanMiddleware::class . ':MANAGE_PAYROLL'
    ]);

    $router->get('/payroll/employee/:userId/salary', [PayrollController::class, 'getEmployeeSalary'], [
        AuthMiddleware::class, CanMiddleware::class . ':VIEW_PAYROLL'
    ]);

    $router->post('/payroll/employee/:userId/salary', [PayrollController::class, 'assignEmployeeSalary'], [
        AuthMiddleware::class, CanMiddleware::class . ':MANAGE_PAYROLL'
    ]);

    $router->get('/payroll/runs', [PayrollController::class, 'getPayrollRuns'], [
        AuthMiddleware::class, CanMiddleware::class . ':VIEW_PAYROLL'
    ]);

    $router->get('/payroll/runs/:id', [PayrollController::class, 'getPayrollRun'], [
        AuthMiddleware::class, CanMiddleware::class . ':VIEW_PAYROLL'
    ]);

    $router->post('/payroll/runs', [PayrollController::class, 'createPayrollRun'], [
        AuthMiddleware::class, CanMiddleware::class . ':MANAGE_PAYROLL'
    ]);

    $router->post('/payroll/runs/:id/process', [PayrollController::class, 'processPayrollRun'], [
        AuthMiddleware::class, CanMiddleware::class . ':MANAGE_PAYROLL'
    ]);

    $router->post('/payroll/runs/:id/approve', [PayrollController::class, 'approvePayrollRun'], [
        AuthMiddleware::class, CanMiddleware::class . ':MANAGE_PAYROLL'
    ]);

    $router->post('/payroll/runs/:id/mark-paid', [PayrollController::class, 'markPayrollPaid'], [
        AuthMiddleware::class, CanMiddleware::class . ':MANAGE_PAYROLL'
    ]);

    $router->get('/payroll/component-types', [PayrollController::class, 'getComponentTypes'], [
        AuthMiddleware::class
    ]);

    // ── Contract Routes ──────────────────────────────────────────────────────
    $router->get('/contracts', [ContractController::class, 'getContracts'], [
        AuthMiddleware::class, CanMiddleware::class . ':VIEW_HR_EMPLOYEES'
    ]);

    $router->get('/contracts/:id', [ContractController::class, 'getContract'], [
        AuthMiddleware::class, CanMiddleware::class . ':VIEW_HR_EMPLOYEES'
    ]);

    $router->post('/contracts', [ContractController::class, 'saveContract'], [
        AuthMiddleware::class, CanMiddleware::class . ':MANAGE_HR_EMPLOYEES'
    ]);

    $router->post('/contracts/:id/approve', [ContractController::class, 'approveContract'], [
        AuthMiddleware::class, CanMiddleware::class . ':MANAGE_HR_EMPLOYEES'
    ]);

    $router->post('/contracts/:id/renew', [ContractController::class, 'renewContract'], [
        AuthMiddleware::class, CanMiddleware::class . ':MANAGE_HR_EMPLOYEES'
    ]);

    $router->post('/contracts/:id/terminate', [ContractController::class, 'terminateContract'], [
        AuthMiddleware::class, CanMiddleware::class . ':MANAGE_HR_EMPLOYEES'
    ]);

    $router->get('/contracts/types', [ContractController::class, 'getContractTypes'], [
        AuthMiddleware::class
    ]);

    $router->get('/contracts/renewal/pending', [ContractController::class, 'getPendingRenewals'], [
        AuthMiddleware::class, CanMiddleware::class . ':MANAGE_HR_EMPLOYEES'
    ]);

    $router->get('/contracts/expired', [ContractController::class, 'getExpiredContracts'], [
        AuthMiddleware::class, CanMiddleware::class . ':MANAGE_HR_EMPLOYEES'
    ]);

    $router->get('/contracts/employee/:userId', [ContractController::class, 'getEmployeeContract'], [
        AuthMiddleware::class, CanMiddleware::class . ':VIEW_HR_EMPLOYEES'
    ]);

    $router->get('/contracts/employee/:userId/history', [ContractController::class, 'getEmployeeContractHistory'], [
        AuthMiddleware::class, CanMiddleware::class . ':VIEW_HR_EMPLOYEES'
    ]);

    $router->get('/contracts/summary', [ContractController::class, 'getContractSummary'], [
        AuthMiddleware::class, CanMiddleware::class . ':MANAGE_HR_EMPLOYEES'
    ]);

    // ── Report Routes ────────────────────────────────────────────────────────
    $router->get('/reports/employee-master-list', [ReportController::class, 'generateEmployeeMasterListPDF'], [
        AuthMiddleware::class, CanMiddleware::class . ':VIEW_HR_EMPLOYEES'
    ]);

    $router->get('/reports/payroll/:payrollRunId', [ReportController::class, 'generatePayrollSummaryPDF'], [
        AuthMiddleware::class, CanMiddleware::class . ':VIEW_PAYROLL'
    ]);

    $router->get('/reports/leave/:leaveRequestId', [ReportController::class, 'generateLeaveRequestPDF'], [
        AuthMiddleware::class, CanMiddleware::class . ':VIEW_LEAVE_REQUESTS'
    ]);

    $router->post('/reports/salary-certificate', [ReportController::class, 'generateSalaryCertificatePDF'], [
        AuthMiddleware::class
    ]);

    $router->get('/reports/service-certificate/:userId', [ReportController::class, 'generateServiceCertificatePDF'], [
        AuthMiddleware::class
    ]);

    $router->get('/reports/contract/:contractId', [ReportController::class, 'generateContractSummaryPDF'], [
        AuthMiddleware::class, CanMiddleware::class . ':VIEW_HR_EMPLOYEES'
    ]);

    $router->get('/reports/dashboard', [ReportController::class, 'generateHRDashboardReportPDF'], [
        AuthMiddleware::class, CanMiddleware::class . ':MANAGE_HR_EMPLOYEES'
    ]);

    // ── Analytics Routes ─────────────────────────────────────────────────────
    $router->get('/employees/by-department', [HRAnalyticsController::class, 'getEmployeesByDepartment'], [
        AuthMiddleware::class, CanMiddleware::class . ':VIEW_HR_EMPLOYEES'
    ]);

    $router->get('/leave/by-type', [HRAnalyticsController::class, 'getLeaveUsageByType'], [
        AuthMiddleware::class, CanMiddleware::class . ':VIEW_LEAVE_REQUESTS'
    ]);

    $router->get('/payroll/trends', [HRAnalyticsController::class, 'getPayrollTrends'], [
        AuthMiddleware::class, CanMiddleware::class . ':VIEW_PAYROLL'
    ]);

    $router->get('/leave/approval-metrics', [HRAnalyticsController::class, 'getLeaveApprovalMetrics'], [
        AuthMiddleware::class, CanMiddleware::class . ':VIEW_LEAVE_REQUESTS'
    ]);

    $router->get('/analytics/contract-metrics', [HRAnalyticsController::class, 'getContractMetrics'], [
        AuthMiddleware::class, CanMiddleware::class . ':VIEW_HR_EMPLOYEES'
    ]);

    $router->get('/analytics/payroll-metrics', [HRAnalyticsController::class, 'getPayrollMetrics'], [
        AuthMiddleware::class, CanMiddleware::class . ':VIEW_PAYROLL'
    ]);

    $router->get('/analytics/salary-distribution', [HRAnalyticsController::class, 'getSalaryDistribution'], [
        AuthMiddleware::class, CanMiddleware::class . ':VIEW_PAYROLL'
    ]);

    $router->get('/analytics/headcount-trend', [HRAnalyticsController::class, 'getHeadcountTrend'], [
        AuthMiddleware::class, CanMiddleware::class . ':VIEW_HR_EMPLOYEES'
    ]);

    $router->get('/analytics/contract-expiry-by-dept', [HRAnalyticsController::class, 'getContractExpiryByDepartment'], [
        AuthMiddleware::class, CanMiddleware::class . ':MANAGE_HR_EMPLOYEES'
    ]);

    $router->get('/analytics/leave-balance-overview', [HRAnalyticsController::class, 'getLeaveBalanceOverview'], [
        AuthMiddleware::class, CanMiddleware::class . ':VIEW_LEAVE_REQUESTS'
    ]);

});

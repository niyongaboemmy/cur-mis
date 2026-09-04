<?php

declare(strict_types=1);

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
    $router->get('/import/template/:type', 'Controllers\HRImportExportController::downloadTemplate');

    // ── Import Validation ─────────────────────────────────────────────────────
    $router->post('/import/validate', 'Controllers\HRImportExportController::validateImport', [
        'middlewares' => ['auth']
    ]);

    // ── Process Import ────────────────────────────────────────────────────────
    $router->post('/import/process', 'Controllers\HRImportExportController::processImport', [
        'middlewares' => ['auth', 'can:MANAGE_HR_MODULE']
    ]);

    // ── Export Data ───────────────────────────────────────────────────────────
    $router->get('/export/:type', 'Controllers\HRImportExportController::exportData', [
        'middlewares' => ['auth']
    ]);

    // ── Leave Approval Routes ─────────────────────────────────────────────────
    $router->get('/leave/approvals/queue', 'Controllers\LeaveApprovalController::queue', [
        'middlewares' => ['auth']
    ]);

    $router->get('/leave/requests/:id/progress', 'Controllers\LeaveApprovalController::progress', [
        'middlewares' => ['auth']
    ]);

    $router->post('/leave/approvals/:id/decide', 'Controllers\LeaveApprovalController::decide', [
        'middlewares' => ['auth']
    ]);

    $router->get('/leave/types/:id/stages', 'Controllers\LeaveApprovalController::stages', [
        'middlewares' => ['auth', 'can:MANAGE_LEAVE_REQUESTS']
    ]);

    $router->post('/leave/types/:id/stages', 'Controllers\LeaveApprovalController::saveStages', [
        'middlewares' => ['auth', 'can:MANAGE_LEAVE_REQUESTS']
    ]);

    // ── Payroll Routes ───────────────────────────────────────────────────────
    $router->get('/payroll/structures', 'Controllers\PayrollController::getStructures', [
        'middlewares' => ['auth', 'can:VIEW_PAYROLL']
    ]);

    $router->get('/payroll/structures/:id', 'Controllers\PayrollController::getStructure', [
        'middlewares' => ['auth', 'can:VIEW_PAYROLL']
    ]);

    $router->post('/payroll/structures', 'Controllers\PayrollController::saveStructure', [
        'middlewares' => ['auth', 'can:MANAGE_PAYROLL']
    ]);

    $router->get('/payroll/employee/:userId/salary', 'Controllers\PayrollController::getEmployeeSalary', [
        'middlewares' => ['auth', 'can:VIEW_PAYROLL']
    ]);

    $router->post('/payroll/employee/:userId/salary', 'Controllers\PayrollController::assignEmployeeSalary', [
        'middlewares' => ['auth', 'can:MANAGE_PAYROLL']
    ]);

    $router->get('/payroll/runs', 'Controllers\PayrollController::getPayrollRuns', [
        'middlewares' => ['auth', 'can:VIEW_PAYROLL']
    ]);

    $router->get('/payroll/runs/:id', 'Controllers\PayrollController::getPayrollRun', [
        'middlewares' => ['auth', 'can:VIEW_PAYROLL']
    ]);

    $router->post('/payroll/runs', 'Controllers\PayrollController::createPayrollRun', [
        'middlewares' => ['auth', 'can:MANAGE_PAYROLL']
    ]);

    $router->post('/payroll/runs/:id/process', 'Controllers\PayrollController::processPayrollRun', [
        'middlewares' => ['auth', 'can:MANAGE_PAYROLL']
    ]);

    $router->post('/payroll/runs/:id/approve', 'Controllers\PayrollController::approvePayrollRun', [
        'middlewares' => ['auth', 'can:MANAGE_PAYROLL']
    ]);

    $router->post('/payroll/runs/:id/mark-paid', 'Controllers\PayrollController::markPayrollPaid', [
        'middlewares' => ['auth', 'can:MANAGE_PAYROLL']
    ]);

    $router->get('/payroll/component-types', 'Controllers\PayrollController::getComponentTypes', [
        'middlewares' => ['auth']
    ]);

    // ── Contract Routes ──────────────────────────────────────────────────────
    $router->get('/contracts', 'Controllers\ContractController::getContracts', [
        'middlewares' => ['auth', 'can:VIEW_HR_EMPLOYEES']
    ]);

    $router->get('/contracts/:id', 'Controllers\ContractController::getContract', [
        'middlewares' => ['auth', 'can:VIEW_HR_EMPLOYEES']
    ]);

    $router->post('/contracts', 'Controllers\ContractController::saveContract', [
        'middlewares' => ['auth', 'can:MANAGE_HR_EMPLOYEES']
    ]);

    $router->post('/contracts/:id/approve', 'Controllers\ContractController::approveContract', [
        'middlewares' => ['auth', 'can:MANAGE_HR_EMPLOYEES']
    ]);

    $router->post('/contracts/:id/renew', 'Controllers\ContractController::renewContract', [
        'middlewares' => ['auth', 'can:MANAGE_HR_EMPLOYEES']
    ]);

    $router->post('/contracts/:id/terminate', 'Controllers\ContractController::terminateContract', [
        'middlewares' => ['auth', 'can:MANAGE_HR_EMPLOYEES']
    ]);

    $router->get('/contracts/types', 'Controllers\ContractController::getContractTypes', [
        'middlewares' => ['auth']
    ]);

    $router->get('/contracts/renewal/pending', 'Controllers\ContractController::getPendingRenewals', [
        'middlewares' => ['auth', 'can:MANAGE_HR_EMPLOYEES']
    ]);

    $router->get('/contracts/expired', 'Controllers\ContractController::getExpiredContracts', [
        'middlewares' => ['auth', 'can:MANAGE_HR_EMPLOYEES']
    ]);

    $router->get('/contracts/employee/:userId', 'Controllers\ContractController::getEmployeeContract', [
        'middlewares' => ['auth', 'can:VIEW_HR_EMPLOYEES']
    ]);

    $router->get('/contracts/employee/:userId/history', 'Controllers\ContractController::getEmployeeContractHistory', [
        'middlewares' => ['auth', 'can:VIEW_HR_EMPLOYEES']
    ]);

    $router->get('/contracts/summary', 'Controllers\ContractController::getContractSummary', [
        'middlewares' => ['auth', 'can:MANAGE_HR_EMPLOYEES']
    ]);

    // ── Report Routes ────────────────────────────────────────────────────────
    $router->get('/reports/employee-master-list', 'Controllers\ReportController::generateEmployeeMasterListPDF', [
        'middlewares' => ['auth', 'can:VIEW_HR_EMPLOYEES']
    ]);

    $router->get('/reports/payroll/:payrollRunId', 'Controllers\ReportController::generatePayrollSummaryPDF', [
        'middlewares' => ['auth', 'can:VIEW_PAYROLL']
    ]);

    $router->get('/reports/leave/:leaveRequestId', 'Controllers\ReportController::generateLeaveRequestPDF', [
        'middlewares' => ['auth', 'can:VIEW_LEAVE_REQUESTS']
    ]);

    $router->post('/reports/salary-certificate', 'Controllers\ReportController::generateSalaryCertificatePDF', [
        'middlewares' => ['auth']
    ]);

    $router->get('/reports/service-certificate/:userId', 'Controllers\ReportController::generateServiceCertificatePDF', [
        'middlewares' => ['auth']
    ]);

    $router->get('/reports/contract/:contractId', 'Controllers\ReportController::generateContractSummaryPDF', [
        'middlewares' => ['auth', 'can:VIEW_HR_EMPLOYEES']
    ]);

    $router->get('/reports/dashboard', 'Controllers\ReportController::generateHRDashboardReportPDF', [
        'middlewares' => ['auth', 'can:MANAGE_HR_EMPLOYEES']
    ]);

    // ── Analytics Routes ─────────────────────────────────────────────────────
    $router->get('/employees/by-department', 'Controllers\HRAnalyticsController::getEmployeesByDepartment', [
        'middlewares' => ['auth', 'can:VIEW_HR_EMPLOYEES']
    ]);

    $router->get('/leave/by-type', 'Controllers\HRAnalyticsController::getLeaveUsageByType', [
        'middlewares' => ['auth', 'can:VIEW_LEAVE_REQUESTS']
    ]);

    $router->get('/payroll/trends', 'Controllers\HRAnalyticsController::getPayrollTrends', [
        'middlewares' => ['auth', 'can:VIEW_PAYROLL']
    ]);

    $router->get('/leave/approval-metrics', 'Controllers\HRAnalyticsController::getLeaveApprovalMetrics', [
        'middlewares' => ['auth', 'can:VIEW_LEAVE_REQUESTS']
    ]);

    $router->get('/analytics/contract-metrics', 'Controllers\HRAnalyticsController::getContractMetrics', [
        'middlewares' => ['auth', 'can:VIEW_HR_EMPLOYEES']
    ]);

    $router->get('/analytics/payroll-metrics', 'Controllers\HRAnalyticsController::getPayrollMetrics', [
        'middlewares' => ['auth', 'can:VIEW_PAYROLL']
    ]);

    $router->get('/analytics/salary-distribution', 'Controllers\HRAnalyticsController::getSalaryDistribution', [
        'middlewares' => ['auth', 'can:VIEW_PAYROLL']
    ]);

    $router->get('/analytics/headcount-trend', 'Controllers\HRAnalyticsController::getHeadcountTrend', [
        'middlewares' => ['auth', 'can:VIEW_HR_EMPLOYEES']
    ]);

    $router->get('/analytics/contract-expiry-by-dept', 'Controllers\HRAnalyticsController::getContractExpiryByDepartment', [
        'middlewares' => ['auth', 'can:MANAGE_HR_EMPLOYEES']
    ]);

    $router->get('/analytics/leave-balance-overview', 'Controllers\HRAnalyticsController::getLeaveBalanceOverview', [
        'middlewares' => ['auth', 'can:VIEW_LEAVE_REQUESTS']
    ]);

});

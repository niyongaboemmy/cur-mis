<?php

declare(strict_types=1);

use App\Controllers\HRImportExportController;
use App\Controllers\PayrollController;
use App\Controllers\ContractController;
use App\Controllers\ReportController;
use App\Controllers\HRAnalyticsController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Constants\Permissions;

/**
 * HR Import / Export, Payroll structures, Contracts, Reports and Analytics.
 *
 * Permission gating uses PermissionMiddleware(Permissions::X), the same
 * convention as every other route file. Leave-approval endpoints are NOT
 * defined here — routes/api/leave.php owns them, with per-stage gating.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Import / Export
// ─────────────────────────────────────────────────────────────────────────────

// Public template download (blank spreadsheet, no data) — unauthenticated, as before.
$router->get('/api/hr/import/template/:type', [HRImportExportController::class, 'downloadTemplate']);

$router->group('/api/hr', function ($router) {
    $router->post('/import/validate', [HRImportExportController::class, 'validateImport']);
    $router->get('/export/:type',     [HRImportExportController::class, 'exportData']);
}, [AuthMiddleware::class]);

$router->post('/api/hr/import/process', [HRImportExportController::class, 'processImport'], [
    AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_HR_EMPLOYEES),
]);

// ─────────────────────────────────────────────────────────────────────────────
// Payroll — structures, salaries, runs
// ─────────────────────────────────────────────────────────────────────────────

$router->get('/api/hr/payroll/component-types', [PayrollController::class, 'getComponentTypes'], [
    AuthMiddleware::class,
]);

// Read: VIEW_PAYROLL
$router->group('/api/hr/payroll', function ($router) {
    $router->get('/structures',              [PayrollController::class, 'getStructures']);
    $router->get('/structures/:id',          [PayrollController::class, 'getStructure']);
    $router->get('/employee/:userId/salary', [PayrollController::class, 'getEmployeeSalary']);
    $router->get('/runs',                    [PayrollController::class, 'getPayrollRuns']);
    $router->get('/runs/:id',                [PayrollController::class, 'getPayrollRun']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_PAYROLL)]);

// Write: MANAGE_PAYROLL
$router->group('/api/hr/payroll', function ($router) {
    $router->post('/structures',              [PayrollController::class, 'saveStructure']);
    $router->post('/employee/:userId/salary', [PayrollController::class, 'assignEmployeeSalary']);
    $router->post('/runs',                    [PayrollController::class, 'createPayrollRun']);
    $router->post('/runs/:id/process',        [PayrollController::class, 'processPayrollRun']);
    $router->post('/runs/:id/approve',        [PayrollController::class, 'approvePayrollRun']);
    $router->post('/runs/:id/mark-paid',      [PayrollController::class, 'markPayrollPaid']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_PAYROLL)]);

// ─────────────────────────────────────────────────────────────────────────────
// Contracts
// ─────────────────────────────────────────────────────────────────────────────

$router->get('/api/hr/contracts/types', [ContractController::class, 'getContractTypes'], [
    AuthMiddleware::class,
]);

// Read: VIEW_HR_EMPLOYEES. Specific paths before '/:id' so they are not
// swallowed as an id.
$router->group('/api/hr/contracts', function ($router) {
    $router->get('/renewal/pending',           [ContractController::class, 'getPendingRenewals']);
    $router->get('/expired',                    [ContractController::class, 'getExpiredContracts']);
    $router->get('/summary',                    [ContractController::class, 'getContractSummary']);
    $router->get('/employee/:userId',           [ContractController::class, 'getEmployeeContract']);
    $router->get('/employee/:userId/history',   [ContractController::class, 'getEmployeeContractHistory']);
    $router->get('',                            [ContractController::class, 'getContracts']);
    $router->get('/:id',                        [ContractController::class, 'getContract']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_HR_EMPLOYEES)]);

// Write: MANAGE_HR_EMPLOYEES
$router->group('/api/hr/contracts', function ($router) {
    $router->post('',               [ContractController::class, 'saveContract']);
    $router->post('/:id/approve',   [ContractController::class, 'approveContract']);
    $router->post('/:id/renew',     [ContractController::class, 'renewContract']);
    $router->post('/:id/terminate', [ContractController::class, 'terminateContract']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_HR_EMPLOYEES)]);

// ─────────────────────────────────────────────────────────────────────────────
// Reports (PDF)
// ─────────────────────────────────────────────────────────────────────────────

// Self-service certificates — any authenticated user (controller scopes output).
$router->group('/api/hr/reports', function ($router) {
    $router->post('/salary-certificate',          [ReportController::class, 'generateSalaryCertificatePDF']);
    $router->get('/service-certificate/:userId',   [ReportController::class, 'generateServiceCertificatePDF']);
}, [AuthMiddleware::class]);

$router->group('/api/hr/reports', function ($router) {
    $router->get('/employee-master-list', [ReportController::class, 'generateEmployeeMasterListPDF']);
    $router->get('/contract/:contractId', [ReportController::class, 'generateContractSummaryPDF']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_HR_EMPLOYEES)]);

$router->get('/api/hr/reports/dashboard', [ReportController::class, 'generateHRDashboardReportPDF'], [
    AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_HR_EMPLOYEES),
]);

$router->get('/api/hr/reports/payroll/:payrollRunId', [ReportController::class, 'generatePayrollSummaryPDF'], [
    AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_PAYROLL),
]);

$router->get('/api/hr/reports/leave/:leaveRequestId', [ReportController::class, 'generateLeaveRequestPDF'], [
    AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_LEAVE_REQUESTS),
]);

// ─────────────────────────────────────────────────────────────────────────────
// Analytics
// ─────────────────────────────────────────────────────────────────────────────

$router->group('/api/hr', function ($router) {
    $router->get('/employees/by-department',    [HRAnalyticsController::class, 'getEmployeesByDepartment']);
    $router->get('/analytics/contract-metrics', [HRAnalyticsController::class, 'getContractMetrics']);
    $router->get('/analytics/headcount-trend',  [HRAnalyticsController::class, 'getHeadcountTrend']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_HR_EMPLOYEES)]);

$router->get('/api/hr/analytics/contract-expiry-by-dept', [HRAnalyticsController::class, 'getContractExpiryByDepartment'], [
    AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_HR_EMPLOYEES),
]);

$router->group('/api/hr', function ($router) {
    $router->get('/payroll/trends',                [HRAnalyticsController::class, 'getPayrollTrends']);
    $router->get('/analytics/payroll-metrics',     [HRAnalyticsController::class, 'getPayrollMetrics']);
    $router->get('/analytics/salary-distribution', [HRAnalyticsController::class, 'getSalaryDistribution']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_PAYROLL)]);

$router->group('/api/hr', function ($router) {
    $router->get('/leave/by-type',                    [HRAnalyticsController::class, 'getLeaveUsageByType']);
    $router->get('/leave/approval-metrics',           [HRAnalyticsController::class, 'getLeaveApprovalMetrics']);
    $router->get('/analytics/leave-balance-overview', [HRAnalyticsController::class, 'getLeaveBalanceOverview']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_LEAVE_REQUESTS)]);

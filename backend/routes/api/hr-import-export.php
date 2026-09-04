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

$router->group(['prefix' => '/api/hr'], function ($router) {

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

});

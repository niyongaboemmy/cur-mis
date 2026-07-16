<?php

declare(strict_types=1);

use App\Controllers\HrPayrollController;
use App\Controllers\SalaryPaymentController;
use App\Controllers\PayrollConfigController;
use App\Controllers\EmployeeDeductionController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Constants\Permissions;

/**
 * HR Payroll API Routes
 */

// Self-service: any authenticated user may view their OWN payslip history.
// Intentionally NOT gated by VIEW_PAYROLL — the controller scopes results to
// the employee record linked to the caller's account.
$router->group('/api/me/payroll', function ($router) {
    $router->get('', [HrPayrollController::class, 'mySlips']);
}, [AuthMiddleware::class]);

// Read: VIEW_PAYROLL
$router->group('/api/hr/payroll', function ($router) {
    $router->get('',                 [HrPayrollController::class, 'index']);
    $router->get('/:emp_id/slips',   [HrPayrollController::class, 'slips']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_PAYROLL)]);

// Write: MANAGE_PAYROLL
$router->group('/api/hr/payroll', function ($router) {
    $router->post('',                [HrPayrollController::class, 'upsert']);
    $router->post('/import-excel',   [HrPayrollController::class, 'importFromExcel']);
    $router->post('/copy-period',    [HrPayrollController::class, 'copyPeriod']);
    $router->post('/:id/status',    [HrPayrollController::class, 'setStatus']);
    $router->delete('/:id',          [HrPayrollController::class, 'destroy']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_PAYROLL)]);

// Payroll config: read rates + custom deductions
$router->group('/api/hr', function ($router) {
    $router->get('/config',              [PayrollConfigController::class, 'index']);
    $router->get('/config/deductions',   [PayrollConfigController::class, 'listDeductions']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_HR_EMPLOYEES)]);

// Payroll config: update rates + manage custom deductions
$router->group('/api/hr', function ($router) {
    $router->post('/config',                    [PayrollConfigController::class, 'update']);
    $router->post('/config/deductions',        [PayrollConfigController::class, 'addDeduction']);
    $router->post('/config/deductions/:id',     [PayrollConfigController::class, 'updateDeduction']);
    $router->delete('/config/deductions/:id',  [PayrollConfigController::class, 'deleteDeduction']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_HR_EMPLOYEES)]);

// Salary: read
$router->group('/api/hr/payroll/payments', function ($router) {
    $router->get('', [SalaryPaymentController::class, 'index']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_PAYROLL)]);

// Salary: write
$router->group('/api/hr/payroll/payments', function ($router) {
    $router->post('',       [SalaryPaymentController::class, 'process']);
    $router->delete('/:id', [SalaryPaymentController::class, 'destroy']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_PAYROLL)]);

// Per-employee deductions: read
$router->group('/api/hr/employees/:emp_id/deductions', function ($router) {
    $router->get('',        [EmployeeDeductionController::class, 'index']);
    $router->get('/active', [EmployeeDeductionController::class, 'activeForMonth']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_PAYROLL)]);

// Per-employee deductions: write
$router->group('/api/hr/employees/:emp_id/deductions', function ($router) {
    $router->post('',       [EmployeeDeductionController::class, 'store']);
    $router->post('/:id',    [EmployeeDeductionController::class, 'update']);
    $router->delete('/:id', [EmployeeDeductionController::class, 'destroy']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_PAYROLL)]);

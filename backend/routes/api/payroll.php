<?php

declare(strict_types=1);

use App\Controllers\HrPayrollController;
use App\Controllers\SalaryPaymentController;
use App\Controllers\PayrollConfigController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Constants\Permissions;

/**
 * HR Payroll API Routes
 */

// Read: VIEW_HR_EMPLOYEES
$router->group('/api/hr/payroll', function ($router) {
    $router->get('',                 [HrPayrollController::class, 'index']);
    $router->get('/:emp_id/slips',   [HrPayrollController::class, 'slips']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_HR_EMPLOYEES)]);

// Write: MANAGE_HR_EMPLOYEES
$router->group('/api/hr/payroll', function ($router) {
    $router->post('',                [HrPayrollController::class, 'upsert']);
    $router->post('/import-excel',   [HrPayrollController::class, 'importFromExcel']);
    $router->post('/copy-period',    [HrPayrollController::class, 'copyPeriod']);
    $router->patch('/:id/status',    [HrPayrollController::class, 'setStatus']);
    $router->delete('/:id',          [HrPayrollController::class, 'destroy']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_HR_EMPLOYEES)]);

// Payroll config: read rates
$router->group('/api/hr', function ($router) {
    $router->get('/config', [PayrollConfigController::class, 'index']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_HR_EMPLOYEES)]);

// Payroll config: update rates
$router->group('/api/hr', function ($router) {
    $router->put('/config', [PayrollConfigController::class, 'update']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_HR_EMPLOYEES)]);

// Salary payments: read
$router->group('/api/hr/payroll/payments', function ($router) {
    $router->get('', [SalaryPaymentController::class, 'index']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_HR_EMPLOYEES)]);

// Salary payments: write
$router->group('/api/hr/payroll/payments', function ($router) {
    $router->post('',     [SalaryPaymentController::class, 'process']);
    $router->delete('/:id', [SalaryPaymentController::class, 'destroy']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_HR_EMPLOYEES)]);

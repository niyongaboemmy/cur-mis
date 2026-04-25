<?php

declare(strict_types=1);

use App\Controllers\HrPayrollController;
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
    $router->post('',      [HrPayrollController::class, 'upsert']);
    $router->delete('/:id', [HrPayrollController::class, 'destroy']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_HR_EMPLOYEES)]);

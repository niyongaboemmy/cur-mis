<?php

declare(strict_types=1);

use App\Controllers\HrEmployeeController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Constants\Permissions;

/**
 * HR Employees API Routes
 */

// Read-only: any user with VIEW_HR_EMPLOYEES
$router->group('/api/employees', function ($router) {
    $router->get('/stats', [HrEmployeeController::class, 'stats']);
    $router->get('',       [HrEmployeeController::class, 'index']);
    $router->get('/:id',   [HrEmployeeController::class, 'show']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_HR_EMPLOYEES)]);

// Write: requires MANAGE_HR_EMPLOYEES
$router->group('/api/employees', function ($router) {
    $router->post('',                    [HrEmployeeController::class, 'create']);
    $router->put('/:id',                 [HrEmployeeController::class, 'update']);
    $router->delete('/:id',              [HrEmployeeController::class, 'delete']);
    $router->patch('/:id/toggle-status', [HrEmployeeController::class, 'toggleStatus']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_HR_EMPLOYEES)]);

<?php

declare(strict_types=1);

use App\Controllers\HrEmployeeController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Constants\Permissions;

/**
 * HR Employees API Routes
 */

$router->group('/api/employees', function ($router) {
    $router->get('',     [HrEmployeeController::class, 'index']);
    $router->get('/:id', [HrEmployeeController::class, 'show']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_HR_EMPLOYEES)]);

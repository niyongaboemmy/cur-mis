<?php

declare(strict_types=1);

use App\Controllers\HrEmployeeController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Constants\Permissions;

/**
 * HR All Staff API Routes
 *
 * Every file in this directory is require_once'd by routes/api.php on *every*
 * request, purely to register routes. Nothing here may run a query or emit
 * output at include time — doing so writes that output into the body of every
 * response the API sends, whatever endpoint was actually requested.
 */

$router->group('/api/hr/staff', function ($router) {
    $router->get('',     [HrEmployeeController::class, 'all']);
    $router->get('/all', [HrEmployeeController::class, 'all']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_HR_EMPLOYEES)]);

<?php

declare(strict_types=1);

use App\Controllers\LeaveController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Constants\Permissions;

/**
 * HR Leave Management API Routes
 */

// Read-only: anyone with VIEW_HR_EMPLOYEES or VIEW_LEAVE_REQUESTS
$router->group('/api/hr/leave', function ($router) {
    $router->get('/stats',                  [LeaveController::class, 'stats']);
    $router->get('/types',                  [LeaveController::class, 'leaveTypes']);
    $router->get('/requests',               [LeaveController::class, 'index']);
    $router->get('/requests/:id',           [LeaveController::class, 'show']);
    $router->get('/balances',               [LeaveController::class, 'balances']);
    // Any authenticated employee can submit a request
    $router->post('/requests',              [LeaveController::class, 'store']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_HR_EMPLOYEES)]);

// Leave type definitions: MANAGE_LEAVE_TYPES
$router->group('/api/hr/leave', function ($router) {
    $router->post('/types',       [LeaveController::class, 'createLeaveType']);
    $router->put('/types/:id',    [LeaveController::class, 'updateLeaveType']);
    $router->delete('/types/:id', [LeaveController::class, 'deleteLeaveType']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_LEAVE_TYPES)]);

// Leave request management: MANAGE_LEAVE_REQUESTS
$router->group('/api/hr/leave', function ($router) {
    $router->patch('/requests/:id/approve', [LeaveController::class, 'approve']);
    $router->patch('/requests/:id/reject',  [LeaveController::class, 'reject']);
    $router->delete('/requests/:id',        [LeaveController::class, 'cancel']);
    $router->post('/balances',              [LeaveController::class, 'upsertBalance']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_LEAVE_REQUESTS)]);

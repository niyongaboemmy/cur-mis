<?php

declare(strict_types=1);

use App\Controllers\LeaveController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Middleware\MaybePermissionMiddleware;
use App\Constants\Permissions;

/**
 * HR Leave Management API Routes
 */

// Shared read: leave type catalogue — any HR viewer OR any staff who can
// request leave needs this to populate the leave-type dropdown.
$router->group('/api/hr/leave', function ($router) {
    $router->get('/types', [LeaveController::class, 'leaveTypes']);
}, [AuthMiddleware::class, new MaybePermissionMiddleware([
    Permissions::VIEW_HR_EMPLOYEES,
    Permissions::VIEW_LEAVE_REQUESTS,
    Permissions::MANAGE_LEAVE_TYPES,
    Permissions::MANAGE_LEAVE_REQUESTS,
    Permissions::REQUEST_LEAVE,
])]);

// Self-service: any staff member may file and track their OWN leave requests.
$router->group('/api/hr/leave', function ($router) {
    $router->get('/my-requests',        [LeaveController::class, 'myRequests']);
    $router->post('/my-requests',       [LeaveController::class, 'submitOwn']);
    $router->delete('/my-requests/:id', [LeaveController::class, 'cancelOwn']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::REQUEST_LEAVE)]);

// Read / admin submit: anyone with VIEW_HR_EMPLOYEES or VIEW_LEAVE_REQUESTS
$router->group('/api/hr/leave', function ($router) {
    $router->get('/stats',                  [LeaveController::class, 'stats']);
    $router->get('/requests',               [LeaveController::class, 'index']);
    $router->get('/requests/:id',           [LeaveController::class, 'show']);
    $router->get('/balances',               [LeaveController::class, 'balances']);
    // HR staff can submit a request on behalf of any employee
    $router->post('/requests',              [LeaveController::class, 'store']);
}, [AuthMiddleware::class, new MaybePermissionMiddleware([
    Permissions::VIEW_HR_EMPLOYEES,
    Permissions::VIEW_LEAVE_REQUESTS,
    Permissions::MANAGE_LEAVE_REQUESTS,
])]);

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

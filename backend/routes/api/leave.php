<?php

declare(strict_types=1);

use App\Controllers\LeaveController;
use App\Controllers\LeaveApprovalController;
use App\Services\LeaveApprovalService;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Middleware\MaybePermissionMiddleware;
use App\Constants\Permissions;

/**
 * HR Leave Management API Routes
 *
 * Self-service          → /api/hr/leave/my-requests/*   (REQUEST_LEAVE)
 * Reviewer queue        → /api/hr/leave/approvals/*     (any leave stage permission)
 * Read / HR submit      → /api/hr/leave/{requests,balances,stats}
 * Type + chain config   → /api/hr/leave/types/*         (MANAGE_LEAVE_TYPES)
 *
 * The approval endpoints are permission-gated per stage inside
 * LeaveApprovalService::decide(), exactly as the service-request approvals are —
 * the middleware below only decides who may reach the queue at all.
 */

/**
 * Every permission that can put a request in someone's approval queue.
 *
 * Derived from LeaveApprovalService::STAGE_PERMISSIONS rather than restated:
 * a hardcoded copy here silently locked the VC/HR/DAF offices out of the
 * approval endpoints when the institutional chain was introduced. One list,
 * one place.
 */
$leaveStagePermissions = array_merge(
    LeaveApprovalService::STAGE_PERMISSIONS,
    [Permissions::MANAGE_LEAVE_REQUESTS]
);

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

// Self-service: any staff member may file, track and cancel their OWN requests.
$router->group('/api/hr/leave', function ($router) {
    $router->get('/my-requests',                 [LeaveController::class, 'myRequests']);
    $router->post('/my-requests',                [LeaveController::class, 'submitOwn']);
    $router->get('/my-requests/:id/progress',    [LeaveController::class, 'myProgress']);
    $router->post('/my-requests/:id/resubmit',   [LeaveController::class, 'resubmitOwn']);
    $router->delete('/my-requests/:id',          [LeaveController::class, 'cancelOwn']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::REQUEST_LEAVE)]);

// Reviewer queue + stage decisions. Registered before the '/requests/:id' group
// so "approvals" can never be swallowed as an :id value.
$router->group('/api/hr/leave/approvals', function ($router) {
    $router->get('/queue',        [LeaveApprovalController::class, 'queue']);
    $router->post('/:id/decide',  [LeaveApprovalController::class, 'decide']);
}, [AuthMiddleware::class, new MaybePermissionMiddleware($leaveStagePermissions)]);

// Read / admin submit: anyone with VIEW_HR_EMPLOYEES or VIEW_LEAVE_REQUESTS
$router->group('/api/hr/leave', function ($router) {
    $router->get('/stats',                  [LeaveController::class, 'stats']);
    $router->get('/requests',               [LeaveController::class, 'index']);
    $router->get('/requests/:id',           [LeaveController::class, 'show']);
    $router->get('/requests/:id/progress',  [LeaveApprovalController::class, 'progress']);
    $router->get('/balances',               [LeaveController::class, 'balances']);
    // HR staff can submit a request on behalf of any employee
    $router->post('/requests',              [LeaveController::class, 'store']);
}, [AuthMiddleware::class, new MaybePermissionMiddleware([
    Permissions::VIEW_HR_EMPLOYEES,
    Permissions::VIEW_LEAVE_REQUESTS,
    Permissions::MANAGE_LEAVE_REQUESTS,
])]);

// Leave type definitions + their approval chains: MANAGE_LEAVE_TYPES
$router->group('/api/hr/leave', function ($router) {
    $router->post('/types',            [LeaveController::class, 'createLeaveType']);
    $router->post('/types/:id',        [LeaveController::class, 'updateLeaveType']);
    $router->delete('/types/:id',      [LeaveController::class, 'deleteLeaveType']);
    $router->get('/types/:id/stages',  [LeaveApprovalController::class, 'stages']);
    $router->post('/types/:id/stages', [LeaveApprovalController::class, 'saveStages']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_LEAVE_TYPES)]);

// Inline decisions from the HR list view. Same stage rules as the queue: this
// middleware only decides who reaches the endpoint — the request's current
// stage decides whether the actor may actually record the decision.
$router->group('/api/hr/leave', function ($router) {
    $router->post('/requests/:id/approve',         [LeaveController::class, 'approve']);
    $router->post('/requests/:id/reject',          [LeaveController::class, 'reject']);
    $router->post('/requests/:id/request-changes', [LeaveController::class, 'requestChanges']);
}, [AuthMiddleware::class, new MaybePermissionMiddleware($leaveStagePermissions)]);

// Administrative overrides that sit outside the chain — cancelling any request
// (including an already-granted one) and editing balances directly.
$router->group('/api/hr/leave', function ($router) {
    $router->delete('/requests/:id', [LeaveController::class, 'cancel']);
    $router->post('/balances',       [LeaveController::class, 'upsertBalance']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_LEAVE_REQUESTS)]);

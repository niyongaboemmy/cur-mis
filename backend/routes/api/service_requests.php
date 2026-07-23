<?php

declare(strict_types=1);

use App\Controllers\ServiceCatalogController;
use App\Controllers\ServiceRequestController;
use App\Controllers\ServiceRequestApprovalController;
use App\Controllers\ServiceRequestReportController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Middleware\MaybePermissionMiddleware;
use App\Constants\Permissions;

/**
 * Public Service Request Platform — API Routes
 *
 * Public catalog/browse/track → /api/services/*            (no auth)
 * Student request lifecycle   → /api/service-requests/*     (auth required)
 * Staff approval queue        → /api/service-requests/approvals/* (auth + any stage permission)
 * Admin catalog management    → /api/admin/service-catalog/* (auth + MANAGE_SERVICE_CATALOG)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Public — no authentication required
// ─────────────────────────────────────────────────────────────────────────────

$router->get('/api/services/track', [ServiceRequestController::class, 'track']);
$router->get('/api/services', [ServiceCatalogController::class, 'index']);

// Guest document download — same handler as the authenticated one below.
// Security is the opaque 32-byte download_token itself (hash_equals check
// inside ServiceRequestController::download()), same pattern as the
// admission-offer letter link — a session isn't what gates access here, so
// there's nothing lost by also reaching it without being logged in. This
// lets someone who tracked a request via /services/track (no account)
// download their finished document.
$router->get('/api/services/:id/document', [ServiceRequestController::class, 'download']);

$router->get('/api/services/:slug', [ServiceCatalogController::class, 'show']);

// ─────────────────────────────────────────────────────────────────────────────
// Reporting dashboard — registered before the /:id-bearing group below so
// "reports" is never swallowed as an :id value.
// ─────────────────────────────────────────────────────────────────────────────

$router->group('/api/service-requests/reports', function ($router) {
    $router->get('/overview', [ServiceRequestReportController::class, 'overview']);
    $router->get('/list', [ServiceRequestReportController::class, 'list']);
    $router->get('/export', [ServiceRequestReportController::class, 'export']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_SERVICE_REQUESTS)]);

// ─────────────────────────────────────────────────────────────────────────────
// Student (authenticated) — submit + own requests
// ─────────────────────────────────────────────────────────────────────────────

$router->group('/api/service-requests', function ($router) {
    $router->get('/mine', [ServiceRequestController::class, 'myRequests']);
    $router->post('', [ServiceRequestController::class, 'submit']);
    $router->get('/:id/progress', [ServiceRequestController::class, 'progress']);
    $router->get('/:id/checkout-link', [ServiceRequestController::class, 'getCheckoutLink']);
    $router->get('/:id/download', [ServiceRequestController::class, 'download']);
    $router->post('/:id/resubmit', [ServiceRequestController::class, 'resubmit']);
    $router->get('/:id/attachments', [ServiceRequestController::class, 'listAttachments']);
    $router->get('/:id/attachments/:attachment_id/download', [ServiceRequestController::class, 'downloadAttachment']);
}, [AuthMiddleware::class]);

// ─────────────────────────────────────────────────────────────────────────────
// Staff approval queue — permission-gated per stage inside the controller
// ─────────────────────────────────────────────────────────────────────────────

$router->group('/api/service-requests/approvals', function ($router) {
    $router->get('/queue', [ServiceRequestApprovalController::class, 'queue']);
    $router->post('/:id/decide', [ServiceRequestApprovalController::class, 'decide']);
}, [AuthMiddleware::class, new MaybePermissionMiddleware([
    Permissions::APPROVE_SERVICE_REQUEST_L1,
    Permissions::APPROVE_SERVICE_REQUEST_L2,
    Permissions::APPROVE_SERVICE_REQUEST_FINAL,
])]);

// ─────────────────────────────────────────────────────────────────────────────
// Supervisory void — outside the normal per-stage approval chain
// ─────────────────────────────────────────────────────────────────────────────

$router->group('/api/admin/service-requests', function ($router) {
    $router->post('/:id/void', [ServiceRequestController::class, 'void']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::VOID_SERVICE_REQUEST)]);

// ─────────────────────────────────────────────────────────────────────────────
// Admin — service catalog management
// ─────────────────────────────────────────────────────────────────────────────

$router->group('/api/admin/service-catalog', function ($router) {
    $router->get('/document-types', [ServiceCatalogController::class, 'documentTypes']);
    $router->get('', [ServiceCatalogController::class, 'listAdmin']);
    $router->post('', [ServiceCatalogController::class, 'store']);
    $router->get('/:id', [ServiceCatalogController::class, 'showAdmin']);
    $router->post('/:id', [ServiceCatalogController::class, 'update']);
    $router->post('/:id/deactivate', [ServiceCatalogController::class, 'deactivate']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_SERVICE_CATALOG)]);

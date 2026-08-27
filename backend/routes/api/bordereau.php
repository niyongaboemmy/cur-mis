<?php

declare(strict_types=1);

use App\Constants\Permissions;
use App\Controllers\BordereauxPaymentController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;

/**
 * Bordereau Payment Verification Routes
 *
 * Applicant routes:
 *   GET  /api/applicant/bordereau/:appId/status   - Check submission status
 *   POST /api/applicant/bordereau/submit           - Submit receipt for verification
 *
 * Finance/Registrar routes (require proper permissions):
 *   GET  /api/finance/bordereau/pending            - List pending submissions
 *   POST /api/finance/bordereau/:id/approve        - Approve a submission
 *   POST /api/finance/bordereau/:id/reject         - Reject a submission
 *   GET  /api/finance/bordereau/dashboard-stats    - Dashboard statistics
 */

// ── Applicant Routes ──────────────────────────────────────────────────────

$router->group('/api/applicant/bordereau', function ($r) {
    $r->get('/:applicationId/status', [BordereauxPaymentController::class, 'getSubmissionStatus']);
    $r->post('/submit', [BordereauxPaymentController::class, 'submitBordereau']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::ACCESS_STUDENT_PORTAL)]);

// ── Finance/Registrar Routes ──────────────────────────────────────────────────

$router->group('/api/finance/bordereau', function ($r) {
    $r->get('/pending', [BordereauxPaymentController::class, 'getPendingSubmissions']);
    $r->post('/:id/approve', [BordereauxPaymentController::class, 'approveBordereau']);
    $r->post('/:id/reject', [BordereauxPaymentController::class, 'rejectBordereau']);
    $r->get('/dashboard-stats', [BordereauxPaymentController::class, 'getDashboardStats']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::ACCESS_FINANCE_MODULE)]);

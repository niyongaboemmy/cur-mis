<?php

declare(strict_types=1);

use App\Controllers\ApplicantProfileController;
use App\Middleware\AuthMiddleware;
use App\Middleware\ApplicantMiddleware;
use App\Middleware\RateLimitMiddleware;

/**
 * Applicant Portal API Routes — Authenticated Layer
 *
 * All routes under /api/applicant/* require:
 *   1. AuthMiddleware    → validates JWT and sets _auth_user
 *   2. ApplicantMiddleware → asserts is_applicant = true, loads and injects _applicant_profile
 *
 * Flow summary:
 *   POST /api/auth/applicant/register → claim account (see auth.php)
 *   POST /api/auth/verify-otp         → standard OTP flow → JWT with is_applicant = true
 *
 *   GET    /api/applicant/profile                          → getProfile
 *   PUT    /api/applicant/profile                          → updateProfile
 *   POST   /api/applicant/profile/photo                    → uploadPhoto
 *   GET    /api/applicant/application                      → getApplication
 *   GET    /api/applicant/academic-records                 → listAcademicRecords
 *   POST   /api/applicant/academic-records                 → addAcademicRecord
 *   PUT    /api/applicant/academic-records/:id             → updateAcademicRecord
 *   DELETE /api/applicant/academic-records/:id             → deleteAcademicRecord
 *   POST   /api/applicant/academic-records/:id/set-primary → setPrimaryRecord
 *   GET    /api/applicant/documents                        → listDocuments
 *   POST   /api/applicant/documents                        → uploadDocument
 *   DELETE /api/applicant/documents/:id                    → deleteDocument
 */
$router->group('/api/applicant', function ($router) {

    // ── Profile ───────────────────────────────────────────────────────────────
    $router->get('/profile',       [ApplicantProfileController::class, 'getProfile']);
    $router->put('/profile',       [ApplicantProfileController::class, 'updateProfile']);
    $router->post('/profile/photo', [ApplicantProfileController::class, 'uploadPhoto']);

    // ── Application creation & verification ──────────────────────────────────
    $router->post('/application/draft',  [ApplicantProfileController::class, 'draftApplication']);
    $router->post('/application/submit', [ApplicantProfileController::class, 'submitApplication']);
    $router->post('/application/payment', [ApplicantProfileController::class, 'uploadPaymentSlip']);
    $router->post('/application/verify',       [ApplicantProfileController::class, 'verifyApplication']);
    $router->post('/application/resend-code',  [ApplicantProfileController::class, 'resendVerificationCode']);

    // ── Application status & checklist ────────────────────────────────────────
    $router->get('/application',      [ApplicantProfileController::class, 'getApplication']);
    $router->get('/application/:id',  [ApplicantProfileController::class, 'getApplicationDetails']);
    $router->put('/application/:id',  [ApplicantProfileController::class, 'updateApplication']);
    $router->post('/application/:id/respond', [ApplicantProfileController::class, 'respondToOffer']);
    $router->get('/application/:id/payment-slip', [ApplicantProfileController::class, 'downloadPaymentSlip']);

    // ── Academic records ──────────────────────────────────────────────────────
    $router->get('/academic-records',                        [ApplicantProfileController::class, 'listAcademicRecords']);
    $router->post('/academic-records',                       [ApplicantProfileController::class, 'addAcademicRecord']);
    $router->put('/academic-records/:id',                    [ApplicantProfileController::class, 'updateAcademicRecord']);
    $router->delete('/academic-records/:id',                 [ApplicantProfileController::class, 'deleteAcademicRecord']);
    $router->post('/academic-records/:id/set-primary',       [ApplicantProfileController::class, 'setPrimaryRecord']);

    // ── Documents ────────────────────────────────────────────────────────────
    $router->get('/documents',       [ApplicantProfileController::class, 'listDocuments']);
    $router->post('/documents',      [ApplicantProfileController::class, 'uploadDocument']);
    $router->delete('/documents/:id', [ApplicantProfileController::class, 'deleteDocument']);
    $router->get('/documents/:id/download', [ApplicantProfileController::class, 'downloadDocument']);

}, [AuthMiddleware::class, ApplicantMiddleware::class]);

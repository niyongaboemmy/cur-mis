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
 *   DELETE /api/applicant/profile/photo                    → deletePhoto
 *   GET    /api/applicant/application                      → getApplication
 *   POST   /api/applicant/application/:id/resubmit         → resubmitApplication
 *   GET    /api/applicant/academic-records                 → listAcademicRecords
 *   POST   /api/applicant/academic-records                 → addAcademicRecord
 *   PUT    /api/applicant/academic-records/:id             → updateAcademicRecord
 *   DELETE /api/applicant/academic-records/:id             → deleteAcademicRecord
 *   POST   /api/applicant/academic-records/:id/set-primary → setPrimaryRecord
 *   GET    /api/applicant/application/bills                → getAdmissionBills
 *   GET    /api/applicant/application/bills/checkout       → getAdmissionBillCheckout
 *   GET    /api/applicant/documents                        → listDocuments
 *   POST   /api/applicant/documents                        → uploadDocument
 *   DELETE /api/applicant/documents/:id                    → deleteDocument
 */
$router->group('/api/applicant', function ($router) {

    // ── Profile ───────────────────────────────────────────────────────────────
    $router->get('/profile',       [ApplicantProfileController::class, 'getProfile']);
    $router->post('/profile',       [ApplicantProfileController::class, 'updateProfile']);
    $router->post('/profile/photo', [ApplicantProfileController::class, 'uploadPhoto']);
    $router->delete('/profile/photo', [ApplicantProfileController::class, 'deletePhoto']);

    // ── Application creation & verification ──────────────────────────────────
    $router->post('/application/draft',  [ApplicantProfileController::class, 'draftApplication']);
    $router->post('/application/submit', [ApplicantProfileController::class, 'submitApplication']);

    // ── Application fee (Urubuto Pay) ────────────────────────────────────────
    // Defined before the /application/:id catch-all so "payment" isn't captured as an id.
    //
    // Read-only by design. UrubutoPay is the only accepted channel, so nothing
    // here lets an applicant assert their own payment — the fee is confirmed
    // server-to-server by the gateway callback, and the two endpoints that used
    // to accept a self-declared transaction id ('payment', 'payment/invoice')
    // were removed with the "Already Paid" tab they served.
    $router->get('/application/payment/checkout', [ApplicantProfileController::class, 'getPaymentCheckout']);
    $router->get('/application/payment/status',   [ApplicantProfileController::class, 'getPaymentStatus']);
    // Development only — marks the fee paid the way the gateway callback would,
    // because UrubutoPay cannot call back into a local machine. Answers 403
    // whenever APP_ENV is not local or APP_DEBUG is off.
    $router->post('/application/payment/simulate', [ApplicantProfileController::class, 'simulatePayment']);

    // ── Admission fees (Registration, CURSU …) ───────────────────────────────
    // Raised once the applicant is admitted; paid on the same payer code as the
    // application fee. Literal paths, so they must precede /application/:id.
    $router->get('/application/bills',          [ApplicantProfileController::class, 'getAdmissionBills']);
    $router->get('/application/bills/checkout', [ApplicantProfileController::class, 'getAdmissionBillCheckout']);

    $router->post('/application/verify',       [ApplicantProfileController::class, 'verifyApplication']);
    $router->post('/application/resend-code',  [ApplicantProfileController::class, 'resendVerificationCode']);

    // ── Application status & checklist ────────────────────────────────────────
    $router->get('/application',      [ApplicantProfileController::class, 'getApplication']);
    $router->get('/application/:id',  [ApplicantProfileController::class, 'getApplicationDetails']);
    $router->get('/application/:id/timeline', [ApplicantProfileController::class, 'getApplicationTimeline']);
    $router->post('/application/:id',  [ApplicantProfileController::class, 'updateApplication']);
    $router->post('/application/:id/respond', [ApplicantProfileController::class, 'respondToOffer']);
    $router->post('/application/:id/resubmit', [ApplicantProfileController::class, 'resubmitApplication']);
    $router->get('/application/:id/payment-slip', [ApplicantProfileController::class, 'downloadPaymentSlip']);

    // ── Academic records ──────────────────────────────────────────────────────
    $router->get('/academic-records',                        [ApplicantProfileController::class, 'listAcademicRecords']);
    $router->post('/academic-records',                       [ApplicantProfileController::class, 'addAcademicRecord']);
    $router->post('/academic-records/:id',                    [ApplicantProfileController::class, 'updateAcademicRecord']);
    $router->delete('/academic-records/:id',                 [ApplicantProfileController::class, 'deleteAcademicRecord']);
    $router->post('/academic-records/:id/set-primary',       [ApplicantProfileController::class, 'setPrimaryRecord']);

    // ── Documents ────────────────────────────────────────────────────────────
    $router->get('/documents',       [ApplicantProfileController::class, 'listDocuments']);
    $router->post('/documents',      [ApplicantProfileController::class, 'uploadDocument']);
    $router->delete('/documents/:id', [ApplicantProfileController::class, 'deleteDocument']);
    $router->get('/documents/:id/download', [ApplicantProfileController::class, 'downloadDocument']);

}, [AuthMiddleware::class, ApplicantMiddleware::class]);

<?php

declare(strict_types=1);

use App\Controllers\ApplicationPortalController;
use App\Controllers\ApplicationAdminController;
use App\Controllers\DocumentVerificationController;
use App\Controllers\MeritListController;
use App\Controllers\AdmissionController;
use App\Controllers\AdmissionRequirementController;
use App\Controllers\DocumentTypeController;
use App\Controllers\IntakeController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Middleware\MaybePermissionMiddleware;
use App\Constants\Permissions;

/**
 * Student Management Module — API Routes
 *
 * Architecture:
 *   Public portal  → /api/portal/*   (no auth; used by prospective students)
 *   Admin panel    → /api/admin/*    (JWT required; role-specific permissions)
 *
 * Application flow:
 *   1. GET  /api/portal/active-year                       → confirm system is open
 *   2. GET  /api/portal/faculties                         → pick faculty
 *   3. GET  /api/portal/faculties/:id/departments          → pick department
 *   4. GET  /api/portal/faculties/:id/requirements        → see what docs are needed
 *   5. POST /api/portal/applications                      → submit application
 *   6. POST /api/portal/applications/:num/documents       → upload each document
 *   7. GET  /api/portal/applications/:num                 → track status / checklist
 *   8. POST /api/portal/applications/:num/respond         → accept or decline offer
 */

// ─────────────────────────────────────────────────────────────────────────────
// Public portal — no authentication required
// ─────────────────────────────────────────────────────────────────────────────

// System-state check
$router->get('/api/portal/active-year', [ApplicationPortalController::class, 'getActiveYear']);
$router->get('/api/portal/intakes', [ApplicationPortalController::class, 'getIntakes']);

// Faculty & program discovery
$router->get('/api/portal/faculties',                            [ApplicationPortalController::class, 'getFaculties']);
$router->get('/api/portal/faculties/:faculty_id/departments',     [ApplicationPortalController::class, 'getFacultyDepartments']);
$router->get('/api/portal/faculties/:faculty_id/requirements',   [ApplicationPortalController::class, 'getFacultyRequirements']);
$router->get('/api/portal/programs',                             [ApplicationPortalController::class, 'getPrograms']);
$router->get('/api/portal/levels',                               [ApplicationPortalController::class, 'getLevels']);
$router->get('/api/portal/document-types',                       [ApplicationPortalController::class, 'getDocumentTypes']);

// Application lifecycle
$router->post('/api/portal/applications',                                          [ApplicationPortalController::class, 'submitApplication']);
$router->get('/api/portal/applications/:application_number',                       [ApplicationPortalController::class, 'trackApplication']);
$router->post('/api/portal/applications/:application_number/documents',            [ApplicationPortalController::class, 'uploadDocument']);
$router->post('/api/portal/applications/:application_number/respond',              [ApplicationPortalController::class, 'respondToOffer']);

// Public token-based admission letter download (no auth)
$router->get('/api/portal/admission-letter', [AdmissionController::class, 'downloadLetterByToken']);

// ─────────────────────────────────────────────────────────────────────────────
// Admin routes — all require a valid JWT token
// ─────────────────────────────────────────────────────────────────────────────
$router->group('/api/admin', function ($router) {

    // ── 1. Document type catalogue (global list of possible document types) ──
    // Permission: MANAGE_ADMISSION_REQUIREMENTS
    $router->group('/document-types', function ($router) {
        $router->get('',        [DocumentTypeController::class, 'index']);
        $router->post('',       [DocumentTypeController::class, 'create']);
        $router->get('/:id',    [DocumentTypeController::class, 'show']);
        $router->post('/:id',    [DocumentTypeController::class, 'update']);
        $router->delete('/:id', [DocumentTypeController::class, 'delete']);
    }, [new PermissionMiddleware(Permissions::MANAGE_ADMISSION_REQUIREMENTS)]);

    // ── 2. Admission requirements (per-faculty document checklist) ──────────
    // Permission: MANAGE_ADMISSION_REQUIREMENTS
    $router->group('/admission-requirements', function ($router) {
        $router->get('',   [AdmissionRequirementController::class, 'index']);
        $router->post('',  [AdmissionRequirementController::class, 'create']);

        $router->get(
            '/faculty/:faculty_id',
            [AdmissionRequirementController::class, 'getForFaculty']
        );

        $router->get('/:id',    [AdmissionRequirementController::class, 'show']);
        $router->post('/:id',    [AdmissionRequirementController::class, 'update']);
        $router->delete('/:id', [AdmissionRequirementController::class, 'delete']);
    }, [new PermissionMiddleware(Permissions::MANAGE_ADMISSION_REQUIREMENTS)]);

    // ── 3. Application management ─────────────────────────────────────────────
    // Permission: MANAGE_STUDENT_APPLICATIONS
    $router->group('/applications', function ($router) {
        $router->get('',              [ApplicationAdminController::class, 'index']);
        $router->get('/stats',         [ApplicationAdminController::class, 'getDashboardStats']);
        $router->get('/export',        [ApplicationAdminController::class, 'export']);
        // Bulk upload via CSV (Task 1.12). Literal segments must come before
        // /:id to win route matching.
        $router->get('/bulk-upload-template', [ApplicationAdminController::class, 'bulkUploadTemplate']);
        $router->post('/bulk-validate',       [ApplicationAdminController::class, 'bulkValidate']);
        $router->post('/bulk-upload',         [ApplicationAdminController::class, 'bulkUpload']);
        // Task 1.14 — applicant statistics report.
        $router->get('/statistics',           [ApplicationAdminController::class, 'statistics']);
        $router->get('/:id',          [ApplicationAdminController::class, 'show']);
        $router->get('/:id/payment-slip', [ApplicationAdminController::class, 'downloadPaymentSlip']);
        $router->get('/:id/photo',        [ApplicationAdminController::class, 'downloadApplicantPhoto']);
        $router->post('/:id/status', [ApplicationAdminController::class, 'updateStatus']);
        $router->post('/:id/notes',   [ApplicationAdminController::class, 'addNote']);
        // Shared, visible "why pending" notes — readable by every registry
        // staff regardless of their campus scope.
        $router->get('/:id/pending-notes',  [ApplicationAdminController::class, 'listPendingNotes']);
        $router->post('/:id/pending-notes', [ApplicationAdminController::class, 'addPendingNote']);
        // Pre-enrollment check: is this applicant already a CUR student?
        $router->get('/:id/returning-check', [ApplicationAdminController::class, 'returningCheck']);
        // Hide / restore (Task 1.9)
        $router->post('/:id/hide',    [ApplicationAdminController::class, 'hideApplication']);
        $router->post('/:id/restore', [ApplicationAdminController::class, 'restoreApplication']);
        // Credit-transfer exemption-letter status (Task 1.11)
        $router->post('/:id/exemption-status', [ApplicationAdminController::class, 'setExemptionStatus']);
        $router->post('/:id/enroll',  [AdmissionController::class, 'initiateEnrollmentByAppId']);
        $router->post('/:id/accept-offer', [AdmissionController::class, 'acceptOfferByAppId']);
    }, [new PermissionMiddleware(Permissions::MANAGE_STUDENT_APPLICATIONS)]);

    // ── 4. Document verification ──────────────────────────────────────────────
    // Permission: VERIFY_DOCUMENTS
    $router->group('/verifications', function ($router) {
        $router->get('', [DocumentVerificationController::class, 'getPendingApplications']);

        $router->get(
            '/:application_id/documents',
            [DocumentVerificationController::class, 'getApplicationDocuments']
        );
        $router->post(
            '/:application_id/documents/:document_id',
            [DocumentVerificationController::class, 'verifyDocument']
        );
        $router->get(
            '/:application_id/documents/:document_id/download',
            [DocumentVerificationController::class, 'downloadDocument']
        );
        $router->post(
            '/:id/request-changes',
            [DocumentVerificationController::class, 'requestChanges']
        );
    }, [new PermissionMiddleware(Permissions::VERIFY_DOCUMENTS)]);

    // ── 5. Merit list management ──────────────────────────────────────────────
    $router->group('/merit', function ($router) {
        $router->get('/criteria',  [MeritListController::class, 'getCriteria']);
        $router->get('/list',      [MeritListController::class, 'getMeritList']);
    }, [new MaybePermissionMiddleware([
        Permissions::MANAGE_ADMISSIONS,
        Permissions::VIEW_MERIT_LIST,
        Permissions::MANAGE_MERIT_LIST,
    ])]);

    $router->group('/merit', function ($router) {
        $router->post('/criteria', [MeritListController::class, 'saveCriteria']);
        $router->post('/generate', [MeritListController::class, 'generateMeritList']);
        $router->post('/publish', [MeritListController::class, 'publishMeritList']);
    }, [new MaybePermissionMiddleware([
        Permissions::MANAGE_ADMISSIONS,
        Permissions::MANAGE_MERIT_LIST,
    ])]);

    // ── 6. Admission offers, enrollment & letters ─────────────────────────────
    // Permission: MANAGE_ADMISSIONS
    $router->group('/admissions', function ($router) {
        $router->get('/offers',                        [AdmissionController::class, 'listOffers']);
        $router->post('/offers',                       [AdmissionController::class, 'createOffer']);
        $router->post('/offers/bulk',                  [AdmissionController::class, 'bulkCreateOffers']);
        $router->get('/offers/:offer_id',              [AdmissionController::class, 'getOfferDetails']);
        $router->post('/offers/:offer_id/enroll',      [AdmissionController::class, 'initiateEnrollment']);
        $router->get('/offers/:offer_id/letter',       [AdmissionController::class, 'downloadLetter']);
        $router->post('/offers/:offer_id/send-letter', [AdmissionController::class, 'sendLetter']);
        $router->post('/letters/bulk-send',            [AdmissionController::class, 'bulkSendLetters']);
        $router->post('/manual-admit',                 [AdmissionController::class, 'manualAdmit']);
    }, [new PermissionMiddleware(Permissions::MANAGE_ADMISSIONS)]);

    // ── 7. Intake management ──────────────────────────────────────────────────
    // Permission: MANAGE_ADMISSIONS
    $router->group('/intakes', function ($router) {
        $router->get('',               [IntakeController::class, 'index']);
        $router->post('',              [IntakeController::class, 'create']);
        $router->post('/:id',           [IntakeController::class, 'update']);
        $router->delete('/:id',        [IntakeController::class, 'delete']);
        $router->post('/:id/toggle',  [IntakeController::class, 'toggleActive']);
    }, [new PermissionMiddleware(Permissions::MANAGE_ADMISSIONS)]);

}, [AuthMiddleware::class]);

<?php

declare(strict_types=1);

use App\Controllers\StudentController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Constants\Permissions;

/**
 * Students API Routes
 */

// Self-service: any authenticated user can fetch their own student record
// + linked documents + program curriculum + photo. Registered BEFORE the
// VIEW_STUDENTS-gated group so `/me` and `/me/...` don't get swallowed by
// the `/:id` matchers.
$router->group('/api/students', function ($router) {
    $router->get('/me',                                 [StudentController::class, 'me']);
    $router->post('/me',                                 [StudentController::class, 'updateMe']);
    $router->get('/me/photo',                           [StudentController::class, 'downloadMyPhoto']);
    $router->post('/me/photo',                          [StudentController::class, 'uploadMyPhoto']);
    $router->delete('/me/photo',                        [StudentController::class, 'deleteMyPhoto']);
    $router->get('/me/documents',                       [StudentController::class, 'meDocuments']);
    $router->post('/me/documents',                      [StudentController::class, 'meUploadDocument']);
    $router->get('/me/documents/:document_id/download', [StudentController::class, 'meDownloadDocument']);
    $router->get('/me/program-modules',                 [StudentController::class, 'meProgramModules']);
    // Tier 2 of the self-service split (migration 147): a student proposes
    // a change to an identity field, with evidence, for the registry to
    // approve. Tier 1 fields save straight through POST /me above.
    $router->get('/me/profile-change-requests',         [StudentController::class, 'myProfileChangeRequests']);
    $router->post('/me/profile-change-requests',        [StudentController::class, 'requestProfileChange']);
    // Self-service visa for international students.
    $router->get('/me/visa',                            [StudentController::class, 'meVisa']);
    $router->post('/me/visa',                           [StudentController::class, 'meAddVisa']);
    $router->post('/me/visa/document',                  [StudentController::class, 'meUploadVisaDocument']);
    $router->get('/me/visa/document',                   [StudentController::class, 'meDownloadVisaDocument']);
}, [AuthMiddleware::class]);

// Read-only: any user with VIEW_STUDENTS
$router->group('/api/students', function ($router) {
    $router->get('/stats',                                [StudentController::class, 'stats']);
    // Faceted values + counts for the list page's filter panel. Literal
    // segment, so it must stay ahead of the /:id matchers below.
    $router->get('/filter-options',                       [StudentController::class, 'filterOptions']);
    // Bulk CSV export (literal segments must come before /:id).
    $router->get('/export',                               [StudentController::class, 'exportCsv']);
    $router->get('/export-columns',                       [StudentController::class, 'exportColumnsList']);
    $router->get('/export-templates',                     [StudentController::class, 'listExportTemplates']);
    $router->post('/export-templates',                    [StudentController::class, 'saveExportTemplate']);
    $router->delete('/export-templates/:id',              [StudentController::class, 'deleteExportTemplate']);
    // Bulk-upload template download is read-only (renders an Excel-compatible
    // CSV the registry team fills in). Behind VIEW_STUDENTS so anyone able to
    // look at the list can fetch the template.
    $router->get('/bulk-upload-template',                 [StudentController::class, 'bulkUploadTemplate']);
    // Task 1.13 — international students list. Literal segment must come
    // before /:id so it wins route matching.
    $router->get('/international',                        [StudentController::class, 'listInternational']);
    $router->get('/international/export',                 [StudentController::class, 'exportInternationalCsv']);
    // Registry queue for student-proposed identity changes. Literal path,
    // so it must precede the /:id matchers.
    $router->get('/profile-change-requests',              [StudentController::class, 'listProfileChangeRequests']);
    $router->get('/profile-change-requests/:id/document', [StudentController::class, 'downloadProfileChangeDocument']);
    $router->get('',                                      [StudentController::class, 'index']);
    $router->get('/:id',                                  [StudentController::class, 'show']);
    $router->get('/:id/photo',                            [StudentController::class, 'downloadPhoto']);
    $router->get('/:id/documents',                        [StudentController::class, 'documents']);
    $router->get('/:id/documents/:document_id/download',  [StudentController::class, 'downloadDocument']);
    // History of "missing documents" notices sent to this student.
    $router->get('/:id/missing-documents/notices',        [StudentController::class, 'missingDocumentsNotices']);
    $router->get('/:id/program-modules',                  [StudentController::class, 'programModules']);
    $router->get('/:id/program-modules/export',           [StudentController::class, 'programModulesExport']);
    // Status audit trail + the evidence behind one change. Read-only, so
    // it sits with the other VIEW_STUDENTS reads; writing a status needs
    // MANAGE_STUDENTS and lives in the write group below.
    $router->get('/:id/status-history',                   [StudentController::class, 'statusHistory']);
    $router->get('/:id/status-history/:change_id/document', [StudentController::class, 'downloadStatusDocument']);
    $router->get('/:id/visa',                             [StudentController::class, 'listVisaRecords']);
    $router->get('/:id/visa/document',                    [StudentController::class, 'downloadVisaDocument']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_STUDENTS)]);

// Write: requires MANAGE_STUDENTS
$router->group('/api/students', function ($router) {
    // Bulk reassign — literal path, registered before any /:id matchers in
    // this group so it isn't shadowed.
    $router->post('/bulk-update-campus', [StudentController::class, 'bulkUpdateCampus']);
    // Bulk import — preview (dry-run) + commit. The preview reuses the same
    // parser as commit so the modal shows exactly what the upload will do.
    $router->post('/bulk-validate',      [StudentController::class, 'bulkValidate']);
    $router->post('/bulk-upload',        [StudentController::class, 'bulkUpload']);
    $router->post('',              [StudentController::class, 'create']);
    $router->post('/:id',           [StudentController::class, 'update']);
    $router->delete('/:id',        [StudentController::class, 'delete']);
    $router->post('/:id/photo',    [StudentController::class, 'uploadPhoto']);
    $router->delete('/:id/photo',  [StudentController::class, 'deletePhoto']);
    // Task 1.13 — visa record write + registry officer assignment.
    $router->post('/:id/visa',           [StudentController::class, 'addVisaRecord']);
    // Status change with its reason / supporting document. Separate from
    // POST /:id because it is multipart and enforces evidence rules that
    // the generic update deliberately refuses to apply silently.
    $router->post('/profile-change-requests/:id/decide', [StudentController::class, 'decideProfileChangeRequest']);
    $router->post('/:id/status',         [StudentController::class, 'updateStatus']);
    $router->post('/:id/assign-registry', [StudentController::class, 'assignRegistryOfficer']);
    // Notify the student (in-app + email) about outstanding required
    // documents. Kebab-case path; the old snake_case one is kept as an
    // alias so nothing cached in a browser 404s.
    $router->post('/:id/missing-documents/notify', [StudentController::class, 'sendMissingDocumentsNote']);
    $router->post('/:id/missing_documents_note',   [StudentController::class, 'sendMissingDocumentsNote']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_STUDENTS)]);

// Module exemptions — admin-only override that records a mark for a module
// the student is being exempted from sitting. Reuses MANAGE_MODULE_MARKS so
// any user who can edit grades can also exempt.
$router->group('/api/students', function ($router) {
    $router->post('/:id/exemptions',                [StudentController::class, 'createExemption']);
    $router->delete('/:id/exemptions/:mark_id',     [StudentController::class, 'deleteExemption']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_MODULE_MARKS)]);

// Per-student module registrations — power the curriculum tab's "Enroll"
// button. Gated behind MANAGE_STUDENTS so registrars can register/drop on
// the student's behalf without granting them grade-edit permissions.
$router->group('/api/students', function ($router) {
    $router->post('/:id/module-registrations',                          [StudentController::class, 'enrollModule']);
    $router->delete('/:id/module-registrations/:registration_id',       [StudentController::class, 'dropModule']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_STUDENTS)]);

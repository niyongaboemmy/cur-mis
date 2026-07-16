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
    $router->get('/me/documents',                       [StudentController::class, 'meDocuments']);
    $router->get('/me/documents/:document_id/download', [StudentController::class, 'meDownloadDocument']);
    $router->get('/me/program-modules',                 [StudentController::class, 'meProgramModules']);
    // Self-service visa for international students.
    $router->get('/me/visa',                            [StudentController::class, 'meVisa']);
    $router->post('/me/visa',                           [StudentController::class, 'meAddVisa']);
    $router->post('/me/visa/document',                  [StudentController::class, 'meUploadVisaDocument']);
    $router->get('/me/visa/document',                   [StudentController::class, 'meDownloadVisaDocument']);
}, [AuthMiddleware::class]);

// Read-only: any user with VIEW_STUDENTS
$router->group('/api/students', function ($router) {
    $router->get('/stats',                                [StudentController::class, 'stats']);
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
    $router->get('',                                      [StudentController::class, 'index']);
    $router->get('/:id',                                  [StudentController::class, 'show']);
    $router->get('/:id/photo',                            [StudentController::class, 'downloadPhoto']);
    $router->get('/:id/documents',                        [StudentController::class, 'documents']);
    $router->get('/:id/documents/:document_id/download',  [StudentController::class, 'downloadDocument']);
    $router->get('/:id/program-modules',                  [StudentController::class, 'programModules']);
    $router->get('/:id/program-modules/export',           [StudentController::class, 'programModulesExport']);
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
    // Task 1.13 — visa record write + registry officer assignment.
    $router->post('/:id/visa',           [StudentController::class, 'addVisaRecord']);
    $router->post('/:id/assign-registry', [StudentController::class, 'assignRegistryOfficer']);
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

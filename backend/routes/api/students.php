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
    $router->put('/me',                                 [StudentController::class, 'updateMe']);
    $router->get('/me/photo',                           [StudentController::class, 'downloadMyPhoto']);
    $router->post('/me/photo',                          [StudentController::class, 'uploadMyPhoto']);
    $router->get('/me/documents',                       [StudentController::class, 'meDocuments']);
    $router->get('/me/documents/:document_id/download', [StudentController::class, 'meDownloadDocument']);
    $router->get('/me/program-modules',                 [StudentController::class, 'meProgramModules']);
}, [AuthMiddleware::class]);

// Read-only: any user with VIEW_STUDENTS
$router->group('/api/students', function ($router) {
    $router->get('/stats',                                [StudentController::class, 'stats']);
    $router->get('',                                      [StudentController::class, 'index']);
    $router->get('/:id',                                  [StudentController::class, 'show']);
    $router->get('/:id/photo',                            [StudentController::class, 'downloadPhoto']);
    $router->get('/:id/documents',                        [StudentController::class, 'documents']);
    $router->get('/:id/documents/:document_id/download',  [StudentController::class, 'downloadDocument']);
    $router->get('/:id/program-modules',                  [StudentController::class, 'programModules']);
    $router->get('/:id/program-modules/export',           [StudentController::class, 'programModulesExport']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_STUDENTS)]);

// Write: requires MANAGE_STUDENTS
$router->group('/api/students', function ($router) {
    $router->post('',              [StudentController::class, 'create']);
    $router->put('/:id',           [StudentController::class, 'update']);
    $router->delete('/:id',        [StudentController::class, 'delete']);
    $router->post('/:id/photo',    [StudentController::class, 'uploadPhoto']);
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

<?php

declare(strict_types=1);

use App\Controllers\AcademicController;
use App\Controllers\AcademicsManagementController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Constants\Permissions;

/**
 * Academics API Routes
 */

// 1. Academic Years & Terms
$router->group('/api/academic', function ($router) {
    // Years
    $router->get('/years',           [AcademicController::class, 'listYears']); // Viewable by all authenticated
    $router->post('/years',          [AcademicController::class, 'createYear'],   [new PermissionMiddleware(Permissions::MANAGE_ACADEMIC_YEARS)]);
    $router->put('/years/:id',       [AcademicController::class, 'updateYear'],   [new PermissionMiddleware(Permissions::MANAGE_ACADEMIC_YEARS)]);
    $router->delete('/years/:id',    [AcademicController::class, 'deleteYear'],   [new PermissionMiddleware(Permissions::MANAGE_ACADEMIC_YEARS)]);
    $router->patch('/years/:id/activate', [AcademicController::class, 'activateYear'], [new PermissionMiddleware(Permissions::MANAGE_ACADEMIC_YEARS)]);

    // Terms
    $router->get('/terms',           [AcademicController::class, 'listTerms']);
    $router->post('/terms',          [AcademicController::class, 'createTerm'],   [new PermissionMiddleware(Permissions::MANAGE_ACADEMIC_TERMS)]);
    $router->put('/terms/:id',       [AcademicController::class, 'updateTerm'],   [new PermissionMiddleware(Permissions::MANAGE_ACADEMIC_TERMS)]);
    $router->delete('/terms/:id',    [AcademicController::class, 'deleteTerm'],   [new PermissionMiddleware(Permissions::MANAGE_ACADEMIC_TERMS)]);
    $router->patch('/terms/:id/activate', [AcademicController::class, 'activateTerm'], [new PermissionMiddleware(Permissions::MANAGE_ACADEMIC_TERMS)]);
}, [AuthMiddleware::class]);

// 2. Academics Management (Granular Permissions)
$entityPermissions = [
    'facility'           => Permissions::MANAGE_FACILITIES,
    'departments'        => Permissions::MANAGE_DEPARTMENTS,
    'faculties'          => Permissions::MANAGE_ACADEMICS,
    'options'            => Permissions::MANAGE_OPTIONS,
    'levels'             => Permissions::MANAGE_LEVELS,
    'leave_types'        => Permissions::MANAGE_LEAVE_TYPES,
    'modules'            => Permissions::MANAGE_MODULES,
    'schools'            => Permissions::MANAGE_SCHOOLS,
    'degrees'            => Permissions::MANAGE_DEGREES,
    'intakes'            => Permissions::MANAGE_ADMISSIONS,
    'campuses'           => Permissions::MANAGE_CAMPUSES,
];

// Department- and option-specific helpers — registered BEFORE the generic
// entity loop so the literal `/next-code` segment wins the route match
// against the generic `/:id` pattern that follows.
$router->group('/api/academics-management/departments', function (Core\Router $r) {
    $r->get('/next-code', [AcademicsManagementController::class, 'nextDepartmentCode']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_DEPARTMENTS)]);

$router->group('/api/academics-management/options', function (Core\Router $r) {
    $r->get('/next-code', [AcademicsManagementController::class, 'nextOptionCode']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_OPTIONS)]);

// Module imports — the simple per-program flow (program-import) is what
// the Modules tab uses. The wide curriculum endpoints stay registered so
// they can back the future Schedules feature without UI churn.
$router->group('/api/academics-management/modules', function (Core\Router $r) {
    $r->post('/program-import',    [AcademicsManagementController::class, 'programImport']);
    $r->post('/curriculum-import', [AcademicsManagementController::class, 'curriculumImport']);
    $r->get ('/curriculum-export', [AcademicsManagementController::class, 'curriculumExport']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_MODULES)]);

// Academic-settings Schedules: per-program, per-mode block scheduling.
// Reuses the MANAGE_MODULE_SCHEDULES permission so it doesn't conflict
// with the /modules/scheduling timetable feature.
$router->group('/api/academics-management/schedules', function (Core\Router $r) {
    $r->get   ('',                  [AcademicsManagementController::class, 'getSchedules']);
    $r->post  ('',                  [AcademicsManagementController::class, 'saveSchedules']);
    $r->post  ('/import-timetable', [AcademicsManagementController::class, 'timetableImport']);
    $r->get   ('/export-timetable', [AcademicsManagementController::class, 'timetableExport']);
    $r->delete('/:id',              [AcademicsManagementController::class, 'deleteScheduleBlock']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_MODULE_SCHEDULES)]);

// Instructor directory for the Scheduling tab's instructor selector.
$router->group('/api/academics-management/instructors', function (Core\Router $r) {
    $r->get('', [AcademicsManagementController::class, 'instructors']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_MODULE_SCHEDULES)]);

// Exam scheduling — per-module exam date/time, drives the Exams sub-tab
// and the per-exam attendance sheet. Reuses MANAGE_MODULE_SCHEDULES so it
// inherits the same admin role as the teaching schedule. The literal
// `/scheduled-modules` route is registered before `/:id` so it wins.
$router->group('/api/academics-management/exams', function (Core\Router $r) {
    $r->get   ('/scheduled-modules',   [AcademicsManagementController::class, 'examScheduledModules']);
    $r->get   ('/:id/attendance',      [AcademicsManagementController::class, 'examAttendance']);
    $r->get   ('',                     [AcademicsManagementController::class, 'listExams']);
    $r->post  ('',                     [AcademicsManagementController::class, 'createExam']);
    $r->put   ('/:id',                 [AcademicsManagementController::class, 'updateExam']);
    $r->delete('/:id',                 [AcademicsManagementController::class, 'deleteExam']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_MODULE_SCHEDULES)]);

foreach ($entityPermissions as $entity => $permission) {
    $router->group("/api/academics-management/{$entity}", function (Core\Router $r) {
        $r->get('',              [AcademicsManagementController::class, 'index']);
        $r->get('/:id',          [AcademicsManagementController::class, 'show']);
        $r->post('',             [AcademicsManagementController::class, 'create']);
        $r->post('/bulk-import', [AcademicsManagementController::class, 'bulkImport']);
        $r->put('/:id',          [AcademicsManagementController::class, 'update']);
        $r->delete('/:id',        [AcademicsManagementController::class, 'delete']);
    }, [AuthMiddleware::class, new PermissionMiddleware($permission)]);
}

// Program ↔ Campus association management. Read uses MANAGE_OPTIONS,
// write requires MANAGE_OPTIONS too — the admin already managing the
// catalogue is the same one assigning campuses.
$router->group('/api/academics-management/options', function (Core\Router $r) {
    $r->get('/:id/campuses', [AcademicsManagementController::class, 'listOptionCampuses']);
    $r->put('/:id/campuses', [AcademicsManagementController::class, 'setOptionCampuses']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_OPTIONS)]);

<?php

declare(strict_types=1);

use App\Controllers\ModulesManagementController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Middleware\MaybePermissionMiddleware;
use App\Constants\Permissions;

/**
 * Modules Management API Routes
 *
 * Covers the four pillars: Catalog, Scheduling, Assignments, Registrations
 * (admin) plus Student self-service. All routes are authenticated; permission
 * gating is per-group.
 */

// ─── Catalog ─────────────────────────────────────────────────────────────────
// Read is open to anyone with MANAGE_MODULES OR VIEW_MY_MODULES (students
// need to browse the catalog to register). Writes require MANAGE_MODULES.
$router->group('/api/modules', function ($router) {
    $router->get('', [ModulesManagementController::class, 'listCatalog'], [
        new MaybePermissionMiddleware([Permissions::MANAGE_MODULES, Permissions::VIEW_MY_MODULES]),
    ]);

    // Scheduling
    $router->group('/schedules', function ($r) {
        $r->get('',                   [ModulesManagementController::class, 'listSchedules']);
        $r->post('/check-conflicts',  [ModulesManagementController::class, 'checkConflicts']);
        $r->post('',                  [ModulesManagementController::class, 'createSchedule']);
        $r->put('/:id',               [ModulesManagementController::class, 'updateSchedule']);
        $r->delete('/:id',            [ModulesManagementController::class, 'deleteSchedule']);
    }, [new PermissionMiddleware(Permissions::MANAGE_MODULE_SCHEDULES)]);

    // Assignments
    $router->group('/assignments', function ($r) {
        $r->get('',          [ModulesManagementController::class, 'listAssignments']);
        $r->get('/workload', [ModulesManagementController::class, 'workloadSummary']);
        $r->post('',         [ModulesManagementController::class, 'createAssignment']);
        $r->put('/:id',      [ModulesManagementController::class, 'updateAssignment']);
        $r->delete('/:id',   [ModulesManagementController::class, 'deleteAssignment']);
    }, [new PermissionMiddleware(Permissions::MANAGE_MODULE_ASSIGNMENTS)]);

    // Admin registrations
    $router->group('/registrations', function ($r) {
        $r->get('',        [ModulesManagementController::class, 'listRegistrations']);
        $r->post('',       [ModulesManagementController::class, 'registerStudentAdmin']);
        $r->post('/bulk',  [ModulesManagementController::class, 'bulkRegister']);
        $r->put('/:id',    [ModulesManagementController::class, 'updateRegistration']);
        $r->delete('/:id', [ModulesManagementController::class, 'deleteRegistration']);
    }, [new PermissionMiddleware(Permissions::MANAGE_MODULE_REGISTRATIONS)]);

    // Student self-service
    $router->group('/my', function ($r) {
        $r->get('/eligible',       [ModulesManagementController::class, 'myEligibleModules']);
        $r->get('/registrations',  [ModulesManagementController::class, 'myRegistrations']);
        // Personal exam timetable for the My Exams sub-menu.
        $r->get('/exams',          [ModulesManagementController::class, 'myExams']);
        $r->post('/register',      [ModulesManagementController::class, 'selfRegister']);
        $r->post('/drop/:id',      [ModulesManagementController::class, 'selfDrop']);
    }, [new PermissionMiddleware(Permissions::VIEW_MY_MODULES)]);

    // Catalog item detail + writes (placed after subgroups so :id doesn't shadow /schedules etc.)
    $router->get('/:id', [ModulesManagementController::class, 'showCatalog'], [
        new MaybePermissionMiddleware([Permissions::MANAGE_MODULES, Permissions::VIEW_MY_MODULES]),
    ]);
    $router->post('',    [ModulesManagementController::class, 'createCatalog'], [new PermissionMiddleware(Permissions::MANAGE_MODULES)]);
    $router->put('/:id', [ModulesManagementController::class, 'updateCatalog'], [new PermissionMiddleware(Permissions::MANAGE_MODULES)]);
    $router->delete('/:id', [ModulesManagementController::class, 'deleteCatalog'], [new PermissionMiddleware(Permissions::MANAGE_MODULES)]);
}, [AuthMiddleware::class]);

<?php

declare(strict_types=1);

use App\Controllers\DeliberationController;
use App\Middleware\AuthMiddleware;
use App\Middleware\MaybePermissionMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Constants\Permissions;

/**
 * Deliberation API Routes
 *
 * Read (grid + session list): VIEW_MODULE_MARKS / RECORD / MANAGE / MANAGE_EXAMS
 * Write (session CRUD + finalize): MANAGE_DELIBERATIONS
 */

$router->group('/api/deliberation', function ($router) {
    // Read-only: grid + session list
    $router->group('', function ($r) {
        $r->get('',               [DeliberationController::class, 'grid']);
        $r->get('/sessions',      [DeliberationController::class, 'listSessions']);
        // Marks-centric view: every student that has marks, mapped to
        // module → program → department.
        $r->get('/mark-filters',  [DeliberationController::class, 'markFilters']);
        $r->get('/mark-students', [DeliberationController::class, 'markStudents']);
        // Unpaginated, one row per mark — feeds the XLSX the board works from.
        // Registered BEFORE the generic list route is irrelevant here (distinct
        // literal paths), but it stays in the read group: exporting exposes no
        // more than the list already does.
        $r->get('/mark-students/export', [DeliberationController::class, 'exportMarkStudents']);
        $r->get('/student-marks', [DeliberationController::class, 'studentMarks']);
    }, [new MaybePermissionMiddleware([
        Permissions::VIEW_MODULE_MARKS,
        Permissions::RECORD_MODULE_MARKS,
        Permissions::MANAGE_MODULE_MARKS,
        Permissions::MANAGE_EXAMS,
        Permissions::MANAGE_DELIBERATIONS,
    ])]);

    // Board approval locks the marks it approves (status → 'confirmed'), which
    // ModuleMarksController then refuses to overwrite. That is the same
    // authority as confirming a mark sheet, so it takes the same permission
    // rather than MANAGE_DELIBERATIONS — whoever recorded the marks must not be
    // able to sign them off.
    $router->post('/approve-marks', [DeliberationController::class, 'approveMarks'],
        [new PermissionMiddleware(Permissions::CONFIRM_MODULE_MARKS)]);

    // Write: session management (MANAGE_DELIBERATIONS)
    $router->group('/sessions', function ($r) {
        $r->post('',                [DeliberationController::class, 'createSession']);
        $r->post('/:id',             [DeliberationController::class, 'updateSession']);
        // Per-student outcomes: promote / repeat / discontinue / defer.
        // Recorded and revisable while the session is open; applied on finalise.
        $r->get('/:id/decisions',           [DeliberationController::class, 'listDecisions']);
        $r->post('/:id/decisions',          [DeliberationController::class, 'saveDecisions']);
        // Dry run — what finalising would change. Finalisation cannot be
        // undone, so the board sees every level and status change first.
        $r->get('/:id/decisions/preview',   [DeliberationController::class, 'previewFinalize']);
        $r->post('/:id/finalize',   [DeliberationController::class, 'finalizeSession']);
    }, [new PermissionMiddleware(Permissions::MANAGE_DELIBERATIONS)]);
}, [AuthMiddleware::class]);

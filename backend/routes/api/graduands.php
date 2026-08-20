<?php

declare(strict_types=1);

use App\Controllers\GraduandController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Constants\Permissions;

$router->group('/api/graduands', function ($router) {
    // Read-only (VIEW_GRADUANDS is enough)
    $router->group('', function ($r) {
        $r->get('/eligibility',      [GraduandController::class, 'eligibilityList']);
        // Curriculum completion audit — cohort list, CSV export, and the
        // per-student drill-down. `/completion/export` is declared before
        // `/completion/:id` or it would match as a student id of 0.
        $r->get('/completion/export',[GraduandController::class, 'completionExport']);
        // Why this environment shows zeros — literal segment, so it is
        // declared before the `/completion/:id` pattern.
        $r->get('/completion/diagnostics', [GraduandController::class, 'completionDiagnostics']);
        $r->get('/completion/:id',   [GraduandController::class, 'completionDetail']);
        $r->get('/completion',       [GraduandController::class, 'completionList']);
        // Students who have finished — what the graduation list is built from.
        $r->get('/ready',            [GraduandController::class, 'readyList']);
        $r->get('',                  [GraduandController::class, 'list']);
    }, [new PermissionMiddleware(Permissions::VIEW_GRADUANDS)]);

    // Write actions
    $router->group('', function ($r) {
        // Recomputing the snapshot rewrites institution-wide figures, so it
        // sits behind the same grant as editing the graduation list itself.
        $r->post('/completion/rebuild', [GraduandController::class, 'completionRebuild']);
        // Move a selection of finished students to a graduation status at once.
        $r->post('/bulk-status',    [GraduandController::class, 'bulkStatus']);
        $r->post('',                [GraduandController::class, 'add']);
        $r->post('/:id/approve',     [GraduandController::class, 'approve']);
        $r->post('/:id/graduate',    [GraduandController::class, 'graduate']);
        $r->post('/:id/defer',       [GraduandController::class, 'defer']);
        $r->delete('/:id',          [GraduandController::class, 'delete']);
    }, [new PermissionMiddleware(Permissions::MANAGE_GRADUANDS)]);
}, [AuthMiddleware::class]);

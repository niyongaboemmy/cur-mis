<?php

declare(strict_types=1);

use App\Controllers\ModuleMarksController;
use App\Middleware\AuthMiddleware;
use App\Middleware\MaybePermissionMiddleware;
use App\Constants\Permissions;

/**
 * Module Marks API Routes
 *
 * Read endpoints accept VIEW_MODULE_MARKS / RECORD_MODULE_MARKS / MANAGE_MODULE_MARKS;
 * write endpoints require RECORD_MODULE_MARKS or MANAGE_MODULE_MARKS — the
 * controller further restricts teachers to modules they are assigned to.
 */

$router->group('/api/marks', function ($router) {
    $router->group('', function ($r) {
        $r->get('',                                  [ModuleMarksController::class, 'listMarks']);
        $r->get('/markable-modules',                 [ModuleMarksController::class, 'myMarkableModules']);
        $r->get('/students/:regnumber',              [ModuleMarksController::class, 'studentMarks']);
        $r->get('/students/:regnumber/transcript',   [ModuleMarksController::class, 'studentTranscript']);
        // Numeric-id variants — regnumbers like "STD/2026/22699" contain
        // slashes that break the `:regnumber` segment matcher.
        $r->get('/students/by-id/:id',               [ModuleMarksController::class, 'studentMarksById']);
        $r->get('/students/by-id/:id/transcript',    [ModuleMarksController::class, 'studentTranscriptById']);
    }, [new MaybePermissionMiddleware([
        Permissions::VIEW_MODULE_MARKS,
        Permissions::RECORD_MODULE_MARKS,
        Permissions::MANAGE_MODULE_MARKS,
    ])]);

    $router->group('', function ($r) {
        $r->post('',          [ModuleMarksController::class, 'saveMarks']);
        $r->post('/workflow',[ModuleMarksController::class, 'workflow']);
        $r->delete('/:id',   [ModuleMarksController::class, 'deleteMark']);
    }, [new MaybePermissionMiddleware([
        Permissions::RECORD_MODULE_MARKS,
        Permissions::MANAGE_MODULE_MARKS,
    ])]);

    // Student self-service — gated by VIEW_MY_MODULES (same as MyRegistrations).
    $router->group('/my', function ($r) {
        $r->get('',            [ModuleMarksController::class, 'myMarks']);
        $r->get('/transcript', [ModuleMarksController::class, 'myTranscript']);
    }, [new MaybePermissionMiddleware([
        Permissions::VIEW_MY_MODULES,
    ])]);
}, [AuthMiddleware::class]);

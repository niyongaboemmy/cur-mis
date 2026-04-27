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
    }, [new MaybePermissionMiddleware([
        Permissions::VIEW_MODULE_MARKS,
        Permissions::RECORD_MODULE_MARKS,
        Permissions::MANAGE_MODULE_MARKS,
    ])]);

    $router->group('', function ($r) {
        $r->put('',         [ModuleMarksController::class, 'saveMarks']);
        $r->delete('/:id',  [ModuleMarksController::class, 'deleteMark']);
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

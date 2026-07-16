<?php

declare(strict_types=1);

use App\Controllers\GradeController;
use App\Middleware\AuthMiddleware;
use App\Middleware\MaybePermissionMiddleware;
use App\Constants\Permissions;

/**
 * Grade management API routes.
 *   - Grading scale read is open to any authenticated user (used by transcripts).
 *   - Grading scale writes require MANAGE_GRADING_SCALES.
 *   - GPA for any student requires VIEW_MODULE_MARKS; self-GPA needs VIEW_MY_MODULES.
 */
$router->group('/api/grades', function ($router) {

    // Grading scale — read open to all authenticated users.
    $router->get('/scales', [GradeController::class, 'listScales']);

    // Grading scale — management.
    $router->group('', function ($r) {
        $r->post('/scales',       [GradeController::class, 'createScale']);
        $r->post('/scales/:id',    [GradeController::class, 'updateScale']);
        $r->delete('/scales/:id', [GradeController::class, 'deleteScale']);
    }, [new MaybePermissionMiddleware([
        Permissions::MANAGE_GRADING_SCALES,
    ])]);

    // GPA for any student (admin / registry).
    $router->group('', function ($r) {
        $r->get('/gpa/by-id/:id', [GradeController::class, 'gpaById']);
    }, [new MaybePermissionMiddleware([
        Permissions::VIEW_MODULE_MARKS,
        Permissions::RECORD_MODULE_MARKS,
        Permissions::MANAGE_MODULE_MARKS,
    ])]);

    // Self-service GPA.
    $router->group('', function ($r) {
        $r->get('/my-gpa', [GradeController::class, 'myGpa']);
    }, [new MaybePermissionMiddleware([
        Permissions::VIEW_MY_MODULES,
    ])]);

}, [AuthMiddleware::class]);

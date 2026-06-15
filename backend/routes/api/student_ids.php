<?php

declare(strict_types=1);

use App\Controllers\StudentIdController;
use App\Middleware\AuthMiddleware;
use App\Middleware\MaybePermissionMiddleware;
use App\Constants\Permissions;

/**
 * Student ID card API routes.
 *   - Viewing / printing cards needs VIEW_STUDENTS (or MANAGE_STUDENT_IDS).
 *   - Issuing / revoking cards needs MANAGE_STUDENT_IDS.
 */
$router->group('/api/student-ids', function ($router) {

    // Read / print — registry viewers.
    $router->group('', function ($r) {
        $r->get('/by-student/:id',       [StudentIdController::class, 'history']);
        $r->get('/by-student/:id/card',  [StudentIdController::class, 'card']);
    }, [new MaybePermissionMiddleware([
        Permissions::VIEW_STUDENTS,
        Permissions::MANAGE_STUDENT_IDS,
    ])]);

    // Issue / revoke — managers only.
    $router->group('', function ($r) {
        $r->post('/issue',  [StudentIdController::class, 'issue']);
        $r->delete('/:id',  [StudentIdController::class, 'revoke']);
    }, [new MaybePermissionMiddleware([
        Permissions::MANAGE_STUDENT_IDS,
    ])]);

}, [AuthMiddleware::class]);

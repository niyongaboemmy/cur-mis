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

    // Read / print — registry viewers. The roster is what the ID-card
    // workspace lists; it is readable by anyone who can already see students.
    $router->group('', function ($r) {
        $r->get('',                      [StudentIdController::class, 'index']);
        $r->get('/by-student/:id',       [StudentIdController::class, 'history']);
        $r->get('/by-student/:id/card',  [StudentIdController::class, 'card']);
    }, [new MaybePermissionMiddleware([
        Permissions::VIEW_STUDENTS,
        Permissions::MANAGE_STUDENT_IDS,
    ])]);

    // Issue / revoke / batch print — managers only. Batch print is a manager
    // action rather than a viewer one because it hands over printable
    // identity documents in bulk.
    $router->group('', function ($r) {
        $r->post('/issue',        [StudentIdController::class, 'issue']);
        $r->post('/batch-issue',  [StudentIdController::class, 'batchIssue']);
        $r->post('/batch-print',  [StudentIdController::class, 'batchPrint']);
        $r->delete('/:id',        [StudentIdController::class, 'revoke']);
    }, [new MaybePermissionMiddleware([
        Permissions::MANAGE_STUDENT_IDS,
    ])]);

}, [AuthMiddleware::class]);

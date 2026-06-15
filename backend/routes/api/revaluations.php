<?php

declare(strict_types=1);

use App\Controllers\RevaluationController;
use App\Middleware\AuthMiddleware;
use App\Middleware\MaybePermissionMiddleware;
use App\Constants\Permissions;

/**
 * Revaluation & backlog API routes.
 *   - Self-service (request, my list, my backlog) needs VIEW_MY_MODULES.
 *   - Staff review / listing needs MANAGE_REVALUATIONS.
 *   - Per-student backlog lookup needs VIEW_MODULE_MARKS (registry views).
 */
$router->group('/api/revaluations', function ($router) {

    // Student self-service.
    $router->group('', function ($r) {
        $r->post('/request',    [RevaluationController::class, 'request']);
        $r->get('/my',          [RevaluationController::class, 'my']);
        $r->get('/my-backlog',  [RevaluationController::class, 'myBacklog']);
    }, [new MaybePermissionMiddleware([
        Permissions::VIEW_MY_MODULES,
    ])]);

    // Per-student backlog (registry).
    $router->group('', function ($r) {
        $r->get('/backlog/by-id/:id', [RevaluationController::class, 'backlogById']);
    }, [new MaybePermissionMiddleware([
        Permissions::VIEW_MODULE_MARKS,
        Permissions::RECORD_MODULE_MARKS,
        Permissions::MANAGE_MODULE_MARKS,
        Permissions::MANAGE_REVALUATIONS,
    ])]);

    // Staff review.
    $router->group('', function ($r) {
        $r->get('',       [RevaluationController::class, 'index']);
        $r->put('/:id',   [RevaluationController::class, 'review']);
    }, [new MaybePermissionMiddleware([
        Permissions::MANAGE_REVALUATIONS,
    ])]);

}, [AuthMiddleware::class]);

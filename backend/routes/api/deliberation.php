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
        $r->get('',          [DeliberationController::class, 'grid']);
        $r->get('/sessions', [DeliberationController::class, 'listSessions']);
    }, [new MaybePermissionMiddleware([
        Permissions::VIEW_MODULE_MARKS,
        Permissions::RECORD_MODULE_MARKS,
        Permissions::MANAGE_MODULE_MARKS,
        Permissions::MANAGE_EXAMS,
        Permissions::MANAGE_DELIBERATIONS,
    ])]);

    // Write: session management (MANAGE_DELIBERATIONS)
    $router->group('/sessions', function ($r) {
        $r->post('',                [DeliberationController::class, 'createSession']);
        $r->put('/:id',             [DeliberationController::class, 'updateSession']);
        $r->post('/:id/finalize',   [DeliberationController::class, 'finalizeSession']);
    }, [new PermissionMiddleware(Permissions::MANAGE_DELIBERATIONS)]);
}, [AuthMiddleware::class]);

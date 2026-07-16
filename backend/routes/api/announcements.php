<?php

declare(strict_types=1);

use App\Controllers\AnnouncementController;
use App\Middleware\AuthMiddleware;
use App\Middleware\MaybePermissionMiddleware;
use App\Constants\Permissions;

/**
 * Announcements API routes.
 *
 * The personalised feed (`GET /api/announcements`) is open to any authenticated
 * user — visibility is filtered by audience inside the controller.
 *
 * Management endpoints (list-all, create, update, delete) require
 * MANAGE_ANNOUNCEMENTS.
 */
$router->group('/api/announcements', function ($router) {

    // Personalised feed — any authenticated user.
    $router->get('', [AnnouncementController::class, 'feed']);

    // Management — gated.
    $router->group('', function ($r) {
        $r->get('/manage',  [AnnouncementController::class, 'index']);
        $r->post('',        [AnnouncementController::class, 'store']);
        $r->post('/:id',     [AnnouncementController::class, 'update']);
        $r->delete('/:id',  [AnnouncementController::class, 'destroy']);
    }, [new MaybePermissionMiddleware([
        Permissions::MANAGE_ANNOUNCEMENTS,
    ])]);

}, [AuthMiddleware::class]);

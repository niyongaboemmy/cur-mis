<?php

declare(strict_types=1);

use App\Controllers\NotificationController;
use App\Middleware\AuthMiddleware;

/**
 * Notification Routes.
 *
 * Authentication only — no permission slug. Every handler scopes its query to
 * the caller's own user_id, so any signed-in account may read and dismiss its
 * own notifications and nobody else's.
 */
$router->group('/api/notifications', function ($r) {
    $r->get('',              [NotificationController::class, 'index']);
    $r->post('/read-all',    [NotificationController::class, 'markAllRead']);
    $r->post('/:id/read',    [NotificationController::class, 'markRead']);
}, [AuthMiddleware::class]);

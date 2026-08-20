<?php

declare(strict_types=1);

use App\Controllers\NotificationController;
use App\Middleware\AuthMiddleware;

/**
 * Notification centre — always scoped to the signed-in user, so authentication
 * is the only gate. There is no permission that grants reading someone else's
 * notifications.
 */
$router->group('/api/notifications', function ($router) {
    $router->get('/unread-count',  [NotificationController::class, 'unreadCount']);
    $router->post('/read-all',     [NotificationController::class, 'markAllRead']);
    $router->post('/read-entity',  [NotificationController::class, 'markEntityRead']);
    $router->get('',               [NotificationController::class, 'index']);
    $router->post('/:id/read',     [NotificationController::class, 'markRead']);
}, [AuthMiddleware::class]);

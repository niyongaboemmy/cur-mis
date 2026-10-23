<?php

declare(strict_types=1);

use App\Controllers\PushController;
use App\Middleware\AuthMiddleware;

/**
 * Device push (installed apps / browsers). Scoped to the signed-in user, so
 * authentication is the only gate.
 */
$router->group('/api/push', function ($router) {
    $router->get('/vapid-key',   [PushController::class, 'vapidKey']);
    $router->post('/subscribe',  [PushController::class, 'subscribe']);
    $router->post('/unsubscribe', [PushController::class, 'unsubscribe']);
}, [AuthMiddleware::class]);

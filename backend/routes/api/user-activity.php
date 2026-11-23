<?php

declare(strict_types=1);

use App\Controllers\UserActivityController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Constants\Permissions;

// Browser-side tracking: any signed-in user can report their own activity.
$router->group('/api/activity', function ($router) {
    $router->post('/heartbeat',  [UserActivityController::class, 'heartbeat']);
    $router->post('/page-view',  [UserActivityController::class, 'pageView']);
}, [AuthMiddleware::class]);

// Admin dashboard: reads everyone's sessions and activity.
$router->group('/api/user-activity', function ($router) {
    $router->get('/stats',       [UserActivityController::class, 'stats']);
    $router->get('/users',       [UserActivityController::class, 'listUsers']);
    $router->get('/users/:id',   [UserActivityController::class, 'showUser']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_SYSTEM_LOGS)]);

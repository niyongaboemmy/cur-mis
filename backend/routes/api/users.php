<?php

declare(strict_types=1);

use App\Controllers\UserController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Constants\Permissions;

/**
 * User Management API Routes
 * Base prefix: /api/users
 */

$router->group('/api/users', function ($router) {
    $router->get('',               [UserController::class, 'index']);
    $router->post('',              [UserController::class, 'create']);
    $router->get('/stats',         [UserController::class, 'stats']);
    $router->get('/bulk-preview',  [UserController::class, 'bulkPreview']);
    $router->post('/bulk-create',   [UserController::class, 'bulkCreate']);
    $router->get('/:id',   [UserController::class, 'show']);
    $router->put('/:id',   [UserController::class, 'update']);
    $router->get('/:id/photo', [UserController::class, 'downloadPhoto']);
    $router->patch('/:id/toggle-status', [UserController::class, 'toggleStatus']);
    $router->delete('/:id',              [UserController::class, 'delete']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_USERS)]);

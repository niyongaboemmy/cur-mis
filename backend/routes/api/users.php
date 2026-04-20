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
    $router->get('',       [UserController::class, 'index']);
    $router->post('',      [UserController::class, 'create']);
    $router->get('/:id',   [UserController::class, 'show']);
    $router->put('/:id',   [UserController::class, 'update']);
    $router->patch('/:id/toggle-status', [UserController::class, 'toggleStatus']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_USERS)]);

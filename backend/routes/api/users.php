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
    // Literal segments must come before `/:id` so they win route matching.
    $router->get('/campuses-catalog', [UserController::class, 'campusesCatalog']);
    $router->get('/bulk-preview',  [UserController::class, 'bulkPreview']);
    $router->post('/bulk-create',   [UserController::class, 'bulkCreate']);
    $router->get('/:id',   [UserController::class, 'show']);
    $router->post('/:id',   [UserController::class, 'update']);
    $router->get('/:id/photo', [UserController::class, 'downloadPhoto']);
    $router->post('/:id/toggle-status', [UserController::class, 'toggleStatus']);
    $router->delete('/:id',              [UserController::class, 'delete']);

    // Registry campus scoping — assign or revoke a campus to/from a user.
    $router->get('/:id/campuses',                [UserController::class, 'listCampuses']);
    $router->post('/:id/campuses/:campus_id',    [UserController::class, 'assignCampus']);
    $router->delete('/:id/campuses/:campus_id',  [UserController::class, 'revokeCampus']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_USERS)]);

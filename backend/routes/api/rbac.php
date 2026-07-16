<?php

declare(strict_types=1);

use App\Controllers\RoleController;
use App\Controllers\PermissionController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Constants\Permissions;

/**
 * Role and Permission API Routes
 * Base prefix: /api
 */

$router->group('/api', function ($router) {
    
    // Role management
    $router->group('/roles', function ($router) {
        $router->get('', [RoleController::class, 'index']);
        $router->post('', [RoleController::class, 'create']);
        $router->get('/:id', [RoleController::class, 'show']);
        $router->post('/:id', [RoleController::class, 'update']);
        $router->delete('/:id', [RoleController::class, 'destroy']);
        
        // Assign permissions to a role
        $router->post('/:id/permissions', [RoleController::class, 'assignPermissions']);
    }, [new PermissionMiddleware(Permissions::MANAGE_ROLES)]);

    // Permission and Category management
    $router->group('/permissions', function ($router) {
        $router->get('', [PermissionController::class, 'index']);
        
        $router->group('/categories', function ($router) {
            $router->post('', [PermissionController::class, 'createCategory']);
            $router->post('/:id', [PermissionController::class, 'updateCategory']);
        });

        $router->post('', [PermissionController::class, 'createPermission']);
        $router->post('/:id', [PermissionController::class, 'updatePermission']);
        $router->delete('/:id', [PermissionController::class, 'deletePermission']);
    }, [new PermissionMiddleware(Permissions::MANAGE_PERMISSIONS)]);

}, [AuthMiddleware::class]);

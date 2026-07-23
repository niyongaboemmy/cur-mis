<?php

declare(strict_types=1);

use App\Controllers\RoleController;
use App\Controllers\PermissionController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Middleware\MaybePermissionMiddleware;
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

    // Permission catalog — read-only, also needed by any admin screen that
    // lets an admin assign a permission slug to something (e.g. Service
    // Catalog's per-stage approver picker), not just the Roles/Permissions
    // management screens themselves.
    $router->group('/permissions', function ($router) {
        $router->get('', [PermissionController::class, 'index']);
    }, [new MaybePermissionMiddleware([
        Permissions::MANAGE_PERMISSIONS,
        Permissions::MANAGE_ROLES,
        Permissions::MANAGE_SERVICE_CATALOG,
    ])]);

    // Permission and Category management — mutations stay locked to MANAGE_PERMISSIONS.
    $router->group('/permissions', function ($router) {
        $router->group('/categories', function ($router) {
            $router->post('', [PermissionController::class, 'createCategory']);
            $router->post('/:id', [PermissionController::class, 'updateCategory']);
        });

        $router->post('', [PermissionController::class, 'createPermission']);
        $router->post('/:id', [PermissionController::class, 'updatePermission']);
        $router->delete('/:id', [PermissionController::class, 'deletePermission']);
    }, [new PermissionMiddleware(Permissions::MANAGE_PERMISSIONS)]);

}, [AuthMiddleware::class]);

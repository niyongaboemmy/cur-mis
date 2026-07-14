<?php

declare(strict_types=1);

use App\Constants\Permissions;
use App\Controllers\AdminDashboardController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;

/**
 * Admin Dashboard API Routes
 */
$router->group('/api/admin', function ($router) {
    $router->get('/dashboard', [AdminDashboardController::class, 'overview']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_DASHBOARD)]);

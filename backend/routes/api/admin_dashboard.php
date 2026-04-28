<?php

declare(strict_types=1);

use App\Controllers\AdminDashboardController;
use App\Middleware\AuthMiddleware;

/**
 * Admin Dashboard API Routes
 */
$router->group('/api/admin', function ($router) {
    $router->get('/dashboard', [AdminDashboardController::class, 'overview']);
}, [AuthMiddleware::class]);

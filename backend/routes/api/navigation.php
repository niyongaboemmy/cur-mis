<?php

declare(strict_types=1);

use App\Controllers\NavigationController;
use App\Middleware\AuthMiddleware;

/**
 * Navigation API Routes
 */

$router->group('/api/navigation', function ($router) {
    $router->get('', [NavigationController::class, 'index']);
}, [AuthMiddleware::class]);

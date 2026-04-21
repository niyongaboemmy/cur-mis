<?php

declare(strict_types=1);

use App\Controllers\SystemBasicsController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Constants\Permissions;

/**
 * System Basics API Routes
 */

$router->group('/api/system', function ($router) {
    $router->get('/basics', [SystemBasicsController::class, 'getBasics']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_SYSTEM_BASICS)]);

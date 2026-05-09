<?php

declare(strict_types=1);

use App\Controllers\SystemLogController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Constants\Permissions;

$router->group('/api/logs', function ($router) {
    $router->get('',        [SystemLogController::class, 'index']);
    $router->get('/stats',  [SystemLogController::class, 'stats']);
    $router->get('/modules',[SystemLogController::class, 'modules']);
    $router->get('/export', [SystemLogController::class, 'export']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_SYSTEM_LOGS)]);

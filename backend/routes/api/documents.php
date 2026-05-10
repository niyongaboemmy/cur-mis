<?php

declare(strict_types=1);

use App\Controllers\DocumentController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Constants\Permissions;

/**
 * Document Generation API Routes
 */
$router->group('/api/documents', function ($router) {
    $router->get('/preview',  [DocumentController::class, 'preview']);
    $router->get('/download', [DocumentController::class, 'download']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::GENERATE_DOCUMENTS)]);

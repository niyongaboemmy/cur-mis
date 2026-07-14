<?php

declare(strict_types=1);

use App\Controllers\SystemDocumentController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Constants\Permissions;

/**
 * System Documents API Routes
 * Documents are institutional files like fee structures, policies, etc.
 */

// Public routes (all authenticated users can view/download)
$router->group('/api/system-documents', function ($router) {
    $router->get('/', [SystemDocumentController::class, 'list']);
    $router->get('/categories', [SystemDocumentController::class, 'categories']);
    $router->get('/:id/download', [SystemDocumentController::class, 'download']);
}, [AuthMiddleware::class]);

// Admin routes (only admins can upload/delete)
$router->group('/api/system-documents', function ($router) {
    $router->post('/', [SystemDocumentController::class, 'upload']);
    $router->delete('/:id', [SystemDocumentController::class, 'delete']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_ACADEMIC_SETTINGS)]);

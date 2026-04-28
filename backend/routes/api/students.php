<?php

declare(strict_types=1);

use App\Controllers\StudentController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Constants\Permissions;

/**
 * Students API Routes
 */

// Read-only: any user with VIEW_STUDENTS
$router->group('/api/students', function ($router) {
    $router->get('/stats',                                [StudentController::class, 'stats']);
    $router->get('',                                      [StudentController::class, 'index']);
    $router->get('/:id',                                  [StudentController::class, 'show']);
    $router->get('/:id/documents',                        [StudentController::class, 'documents']);
    $router->get('/:id/documents/:document_id/download',  [StudentController::class, 'downloadDocument']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_STUDENTS)]);

// Write: requires MANAGE_STUDENTS
$router->group('/api/students', function ($router) {
    $router->post('',        [StudentController::class, 'create']);
    $router->put('/:id',     [StudentController::class, 'update']);
    $router->delete('/:id',  [StudentController::class, 'delete']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::MANAGE_STUDENTS)]);

<?php

declare(strict_types=1);

use App\Controllers\StudentController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Constants\Permissions;

/**
 * Students API Routes
 */

$router->group('/api/students', function ($router) {
    $router->get('',     [StudentController::class, 'index']);
    $router->get('/:id', [StudentController::class, 'show']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::VIEW_STUDENTS)]);

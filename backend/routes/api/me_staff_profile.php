<?php

declare(strict_types=1);

use App\Controllers\MyStaffProfileController;
use App\Middleware\AuthMiddleware;

/**
 * Self-service staff profile. Any signed-in account may use it, but only for
 * their own employee record: the controller resolves that record from the
 * caller's account and refuses students and applicants.
 */
$router->group('/api/me/staff-profile', function ($router) {
    $router->get('',                  [MyStaffProfileController::class, 'show']);
    // The web client sends updates as POST (the server does not accept PUT).
    $router->post('',                 [MyStaffProfileController::class, 'update']);
    $router->post('/documents',       [MyStaffProfileController::class, 'uploadDocument']);
}, [AuthMiddleware::class]);

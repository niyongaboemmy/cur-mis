<?php

declare(strict_types=1);

use App\Controllers\AcademicCertificateController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Constants\Permissions;

$router->group('/api/academic-certificates', function ($router) {
    $router->get('',                   [AcademicCertificateController::class, 'list']);
    $router->post('',                  [AcademicCertificateController::class, 'issue']);
    $router->put('/:id/dispatch',      [AcademicCertificateController::class, 'dispatch']);
    $router->put('/:id/revoke',        [AcademicCertificateController::class, 'revoke']);
    $router->delete('/:id',            [AcademicCertificateController::class, 'delete']);
}, [
    AuthMiddleware::class,
    new PermissionMiddleware(Permissions::MANAGE_ACADEMIC_CERTIFICATES),
]);

<?php

declare(strict_types=1);

use App\Controllers\GraduandController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Constants\Permissions;

$router->group('/api/graduands', function ($router) {
    // Read-only (VIEW_GRADUANDS is enough)
    $router->group('', function ($r) {
        $r->get('/eligibility', [GraduandController::class, 'eligibilityList']);
        $r->get('',             [GraduandController::class, 'list']);
    }, [new PermissionMiddleware(Permissions::VIEW_GRADUANDS)]);

    // Write actions
    $router->group('', function ($r) {
        $r->post('',                [GraduandController::class, 'add']);
        $r->put('/:id/approve',     [GraduandController::class, 'approve']);
        $r->put('/:id/graduate',    [GraduandController::class, 'graduate']);
        $r->put('/:id/defer',       [GraduandController::class, 'defer']);
        $r->delete('/:id',          [GraduandController::class, 'delete']);
    }, [new PermissionMiddleware(Permissions::MANAGE_GRADUANDS)]);
}, [AuthMiddleware::class]);

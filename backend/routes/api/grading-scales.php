<?php

declare(strict_types=1);

use App\Controllers\GradingScaleController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Constants\Permissions;

$router->group('/api/grading-scales', function ($router) {
    $router->get('', [GradingScaleController::class, 'list']);

    $router->group('', function ($r) {
        $r->post('',       [GradingScaleController::class, 'upsert']);
        $r->post('/reset',[GradingScaleController::class, 'reset']);
    }, [new PermissionMiddleware(Permissions::MANAGE_GRADING_SCALES)]);
}, [AuthMiddleware::class]);

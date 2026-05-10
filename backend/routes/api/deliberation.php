<?php

declare(strict_types=1);

use App\Controllers\DeliberationController;
use App\Middleware\AuthMiddleware;
use App\Middleware\MaybePermissionMiddleware;
use App\Constants\Permissions;

/**
 * Deliberation API Routes
 *
 * Reuses the marks/exams permission family — anyone who can view module
 * marks or manage the exams workflow can run deliberation queries.
 */

$router->group('/api/deliberation', function ($router) {
    $router->group('', function ($r) {
        $r->get('', [DeliberationController::class, 'grid']);
    }, [new MaybePermissionMiddleware([
        Permissions::VIEW_MODULE_MARKS,
        Permissions::RECORD_MODULE_MARKS,
        Permissions::MANAGE_MODULE_MARKS,
        Permissions::MANAGE_EXAMS,
    ])]);
}, [AuthMiddleware::class]);

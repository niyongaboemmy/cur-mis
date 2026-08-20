<?php

declare(strict_types=1);

use App\Controllers\TimetableController;
use App\Middleware\AuthMiddleware;
use App\Middleware\MaybePermissionMiddleware;
use App\Constants\Permissions;

/**
 * Institutional timetable — read surface over `module_schedules`.
 *
 * Writes are NOT duplicated here: creating and editing a session stays on
 * /api/modules/schedules, which already validates and conflict-checks, and
 * that group now accepts MANAGE_TIMETABLE alongside MANAGE_MODULE_SCHEDULES.
 */
$router->group('/api/timetable', function ($router) {
    $router->get('', [TimetableController::class, 'index']);
}, [AuthMiddleware::class, new MaybePermissionMiddleware([
    Permissions::VIEW_TIMETABLE,
    Permissions::MANAGE_TIMETABLE,
    // Whoever may edit the schedule may obviously read it.
    Permissions::MANAGE_MODULE_SCHEDULES,
])]);

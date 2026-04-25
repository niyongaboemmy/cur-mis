<?php

declare(strict_types=1);

use App\Controllers\AttendanceController;
use App\Middleware\AuthMiddleware;
use App\Middleware\MaybePermissionMiddleware;
use App\Constants\Permissions;

/**
 * Attendance API Routes
 *
 * Scoping:
 *   - Read-only endpoints require VIEW_ATTENDANCE or RECORD_ATTENDANCE or MANAGE_ATTENDANCE
 *   - Create/save endpoints require RECORD_ATTENDANCE (teacher) or MANAGE_ATTENDANCE (admin)
 *     — the controller further scopes teachers to modules they are assigned to.
 *   - Delete requires MANAGE_ATTENDANCE, or RECORD_ATTENDANCE on sessions the user owns.
 */

$router->group('/api/attendance', function ($router) {
    // Read-only
    $router->group('', function ($r) {
        $r->get('/sessions',                   [AttendanceController::class, 'listSessions']);
        $r->get('/sessions/find',              [AttendanceController::class, 'findSession']);
        $r->get('/sessions/:id',               [AttendanceController::class, 'showSession']);
        $r->get('/sessions/:id/report',        [AttendanceController::class, 'sessionReport']);
        $r->get('/modules/:moduleId/report',   [AttendanceController::class, 'moduleReport']);
        $r->get('/overview',                   [AttendanceController::class, 'overview']);
        $r->get('/teachable-modules',          [AttendanceController::class, 'myTeachableModules']);
        $r->get('/students/:regnumber/summary',[AttendanceController::class, 'studentSummary']);
    }, [new MaybePermissionMiddleware([
        Permissions::VIEW_ATTENDANCE,
        Permissions::RECORD_ATTENDANCE,
        Permissions::MANAGE_ATTENDANCE,
    ])]);

    // Writes (teacher + admin)
    $router->group('', function ($r) {
        $r->post('/sessions',              [AttendanceController::class, 'createSession']);
        $r->put('/sessions/:id/records',   [AttendanceController::class, 'saveRecords']);
        $r->post('/sessions/:id/reopen',   [AttendanceController::class, 'reopenSession']);
        $r->post('/sessions/:id/lock',     [AttendanceController::class, 'toggleLock']);
        $r->delete('/sessions/:id',        [AttendanceController::class, 'deleteSession']);
    }, [new MaybePermissionMiddleware([
        Permissions::RECORD_ATTENDANCE,
        Permissions::MANAGE_ATTENDANCE,
    ])]);
}, [AuthMiddleware::class]);

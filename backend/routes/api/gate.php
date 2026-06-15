<?php

declare(strict_types=1);

use App\Controllers\GateManagementController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Middleware\MaybePermissionMiddleware;
use App\Constants\Permissions;

/**
 * Gate Management API Routes
 *
 * Verify:  ACCESS_GATE or MANAGE_GATE
 * Reads:   VIEW_GATE_LOGS or MANAGE_GATE
 * Writes:  MANAGE_GATE
 */

$router->group('/api/gate', function ($router) {

    // ── Verification (gate officers) ──────────────────────────────────────────
    $router->group('', function ($r) {
        $r->post('/verify', [GateManagementController::class, 'verify']);
        $r->get('/student/:regnumber', [GateManagementController::class, 'studentStatus']);
    }, [new MaybePermissionMiddleware([
        Permissions::ACCESS_GATE,
        Permissions::MANAGE_GATE,
    ])]);

    // ── Logs & stats (read) ───────────────────────────────────────────────────
    $router->group('', function ($r) {
        $r->get('/logs',        [GateManagementController::class, 'listLogs']);
        $r->get('/logs/recent', [GateManagementController::class, 'recentLogs']);
        $r->get('/stats',       [GateManagementController::class, 'getStats']);
    }, [new MaybePermissionMiddleware([
        Permissions::VIEW_GATE_LOGS,
        Permissions::MANAGE_GATE,
    ])]);

}, [AuthMiddleware::class]);

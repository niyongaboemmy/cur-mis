<?php

declare(strict_types=1);

use App\Controllers\FinesController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Middleware\MaybePermissionMiddleware;
use App\Constants\Permissions;

/**
 * Fines & Overdue Alerts API Routes
 *
 * Read:   VIEW_FINES or MANAGE_FINES
 * Writes: MANAGE_FINES
 * Alerts: SEND_FEE_ALERTS or MANAGE_FINANCE
 */

$router->group('/api/fines', function ($router) {

    // ── Read-only ─────────────────────────────────────────────────────────────
    $router->group('', function ($r) {
        $r->get('',                   [FinesController::class, 'listFines']);
        $r->get('/alerts',            [FinesController::class, 'listAlerts']);
        $r->get('/alerts/overdue',    [FinesController::class, 'getOverdueInvoices']);
    }, [new MaybePermissionMiddleware([
        Permissions::VIEW_FINES,
        Permissions::MANAGE_FINES,
        Permissions::MANAGE_FINANCE,
        Permissions::SEND_FEE_ALERTS,
    ])]);

    // ── Fine management writes ────────────────────────────────────────────────
    $router->group('', function ($r) {
        $r->post('',              [FinesController::class, 'createFine']);
        $r->post('/:id',           [FinesController::class, 'updateFine']);
        $r->delete('/:id',        [FinesController::class, 'deleteFine']);
        $r->post('/:id/waive',   [FinesController::class, 'waiveFine']);
    }, [new PermissionMiddleware(Permissions::MANAGE_FINES)]);

    // ── Alert dispatch ────────────────────────────────────────────────────────
    $router->group('/alerts', function ($r) {
        $r->post('/send', [FinesController::class, 'sendOverdueAlerts']);
    }, [new MaybePermissionMiddleware([
        Permissions::SEND_FEE_ALERTS,
        Permissions::MANAGE_FINANCE,
    ])]);

}, [AuthMiddleware::class]);

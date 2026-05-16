<?php

declare(strict_types=1);

use App\Constants\Permissions;
use App\Controllers\UrubutoPayController;
use App\Middleware\AuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Middleware\UrubutoPayWebhookMiddleware;

/**
 * UrubutoPay Payment Routes
 *
 * Webhook routes (/api/payment/webhook/*) are called by UrubutoPay, not by
 * students. They use their own token scheme (api_authorization table) rather
 * than the main backend JWT, so they sit OUTSIDE the AuthMiddleware group.
 *
 * Student self-service routes (/api/payment/*) require the standard JWT.
 */

// ── UrubutoPay Webhooks ───────────────────────────────────────────────────────

// Token endpoint — no auth (UrubutoPay calls this to get a token)
$router->post('/api/payment/webhook/token', [UrubutoPayController::class, 'issueToken']);

// Payer verification + payment callback — validated by UrubutoPayWebhookMiddleware
$router->post(
    '/api/payment/webhook/verify',
    [UrubutoPayController::class, 'verifyPayer'],
    [new UrubutoPayWebhookMiddleware()]
);
$router->post(
    '/api/payment/webhook/callback',
    [UrubutoPayController::class, 'paymentCallback'],
    [new UrubutoPayWebhookMiddleware()]
);

// ── Student Self-Service ──────────────────────────────────────────────────────

$router->group('/api/payment', function ($r) {
    $r->get('/checkout-link', [UrubutoPayController::class, 'getCheckoutLink']);
    $r->get('/history',       [UrubutoPayController::class, 'getMobileHistory']);
}, [AuthMiddleware::class, new PermissionMiddleware(Permissions::ACCESS_STUDENT_PORTAL)]);

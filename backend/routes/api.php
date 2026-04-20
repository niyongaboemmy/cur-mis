<?php

declare(strict_types=1);

/**
 * Main API Route Entry Point.
 * 
 * This file dynamically loads all route files located in the `api/` subdirectory.
 * This keeps the routing modular and prevents a single massive file.
 */

// ── Health check ──────────────────────────────────────────────────────────────
$router->get('/api/health', function ($_request, $response) {
    $response->success([
        'status'    => 'ok',
        'timestamp' => time(),
        'version'   => $_ENV['APP_VERSION'] ?? '1.0.0',
    ], 'API is healthy.');
});

// ── Load All Modular Route Files ──────────────────────────────────────────────
$apiRouteFiles = glob(__DIR__ . '/api/*.php');

foreach ($apiRouteFiles as $file) {
    require_once $file;
}

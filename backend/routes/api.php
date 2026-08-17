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
    // ?deep=1 additionally probes the file-storage service. Kept opt-in so the
    // default health check stays a cheap liveness ping, while operators can
    // confirm FILE_SERVER_URL/FILE_SERVER_KEY are wired up without having to
    // reproduce a failing photo upload.
    $payload = [
        'status'    => 'ok',
        'timestamp' => time(),
        'version'   => $_ENV['APP_VERSION'] ?? '1.0.0',
    ];

    if (($_GET['deep'] ?? '') === '1') {
        $configured = ($_ENV['FILE_SERVER_URL'] ?? '') !== ''
                   && ($_ENV['FILE_SERVER_KEY'] ?? '') !== '';
        $payload['file_server'] = [
            'configured' => $configured,
            'reachable'  => $configured && (new \App\Helpers\FileServerClient())->healthy(),
        ];
    }

    $response->success($payload, 'API is healthy.');
});

// ── Load All Modular Route Files ──────────────────────────────────────────────
$apiRouteFiles = glob(__DIR__ . '/api/*.php');

foreach ($apiRouteFiles as $file) {
    require_once $file;
}

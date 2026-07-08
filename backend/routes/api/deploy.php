<?php

declare(strict_types=1);

/**
 * Internal deploy endpoints — called by GitHub Actions after each deployment.
 * Protected by DeployKeyMiddleware (Bearer token = DEPLOY_KEY env var).
 * Never exposed in public API docs.
 */

use App\Controllers\DeployController;
use App\Middleware\DeployKeyMiddleware;

$router->group('/api/deploy', function (\Core\Router $r) {
    $r->post('/migrate',     [DeployController::class, 'migrate']);
    $r->get('/status',       [DeployController::class, 'status']);
    $r->post('/seed',        [DeployController::class, 'seed']);
    $r->get('/seeders',      [DeployController::class, 'seeders']);
    $r->post('/cache-clear', [DeployController::class, 'clearCache']);
}, [DeployKeyMiddleware::class]);

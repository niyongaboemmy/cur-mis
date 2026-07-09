<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Helpers\ResponseHelper;
use Core\Request;
use Core\Response;

/**
 * Protects deploy endpoints (migrate, baseline, seed, cache-clear).
 * Expects:  Authorization: Bearer <DEPLOY_KEY>
 * DEPLOY_KEY must be set in .env and in the DEPLOY_KEY GitHub secret.
 */
class DeployKeyMiddleware
{
    public function handle(Request $request, Response $response): void
    {
        $configuredKey = $_ENV['DEPLOY_KEY'] ?? '';

        if ($configuredKey === '') {
            ResponseHelper::error('Deploy key not configured on server.', 500);
        }

        $provided = $request->bearerToken();

        if (!$provided || !hash_equals($configuredKey, $provided)) {
            ResponseHelper::error('Forbidden: invalid deploy key.', 403);
        }
    }
}

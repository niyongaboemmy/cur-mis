<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Services\MigrationService;
use Core\Request;
use Core\Response;

/**
 * Internal endpoints called by GitHub Actions after each deployment.
 * All routes require DeployKeyMiddleware.
 *
 * POST /api/deploy/migrate     — apply pending database migrations
 * GET  /api/deploy/status      — show migration status (pending vs applied)
 * POST /api/deploy/cache-clear — reset PHP OPcache so new code is served immediately
 */
class DeployController
{
    /**
     * Applies all pending migrations and returns a summary.
     * Safe to call multiple times — already-applied migrations are skipped.
     */
    public function migrate(Request $request, Response $response): void
    {
        $service = new MigrationService();
        $results = $service->runPending();

        $hasErrors = count($results['errors']) > 0;

        $response->status($hasErrors ? 500 : 200)->json([
            'success' => !$hasErrors,
            'message' => $hasErrors
                ? 'Migrations completed with errors.'
                : 'Migrations completed successfully.',
            'data'    => [
                'ran'     => $results['ran'],
                'skipped' => $results['skipped'],
                'errors'  => $results['errors'],
                'counts'  => [
                    'ran'     => count($results['ran']),
                    'skipped' => count($results['skipped']),
                    'errors'  => count($results['errors']),
                ],
            ],
        ]);
    }

    /**
     * Lists all migration files with their status (applied / skipped / pending).
     * Useful for verifying what's been applied after a deployment.
     */
    public function status(Request $request, Response $response): void
    {
        $service    = new MigrationService();
        $migrations = $service->status();

        $pending = array_filter($migrations, fn($m) => $m['status'] === 'pending');

        $response->json([
            'success' => true,
            'message' => 'Migration status retrieved.',
            'data'    => [
                'migrations'    => $migrations,
                'pending_count' => count($pending),
            ],
        ]);
    }

    /**
     * Resets PHP OPcache so the newly deployed PHP files are served immediately.
     * Without this, cPanel may continue serving stale compiled bytecode for minutes.
     */
    public function clearCache(Request $request, Response $response): void
    {
        $opcacheCleared = false;
        $opcacheEnabled = function_exists('opcache_get_status') && opcache_get_status() !== false;

        if ($opcacheEnabled && function_exists('opcache_reset')) {
            $opcacheCleared = opcache_reset();
        }

        $response->json([
            'success' => true,
            'message' => 'Cache cleared.',
            'data'    => [
                'opcache_enabled' => $opcacheEnabled,
                'opcache_reset'   => $opcacheCleared,
            ],
        ]);
    }
}

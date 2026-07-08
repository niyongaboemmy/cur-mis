<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Services\MigrationService;
use App\Services\SeederService;
use Core\Request;
use Core\Response;

/**
 * Internal endpoints called by GitHub Actions workflows. All routes require
 * DeployKeyMiddleware. These are three independent operations — deploying
 * source code, applying migrations, and seeding data are never bundled
 * together, so that a code deploy never touches schema or data.
 *
 * POST /api/deploy/migrate     — apply pending database migrations (structure only)
 * GET  /api/deploy/status      — show migration status (pending vs applied)
 * POST /api/deploy/seed        — run one named data seeder (never "all")
 * GET  /api/deploy/seeders     — list available seeder names
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
     * Runs exactly one named data seeder. Requires a "name" query/body param —
     * there is no "run everything" option, by design.
     */
    public function seed(Request $request, Response $response): void
    {
        $service = new SeederService();
        $name    = trim((string)($request->input('name') ?? $request->query('name') ?? ''));

        if ($name === '') {
            $response->status(400)->json([
                'success' => false,
                'message' => 'Missing required "name" parameter.',
                'data'    => ['available' => $service->available()],
            ]);
            return;
        }

        if (!$service->has($name)) {
            $response->status(404)->json([
                'success' => false,
                'message' => "Unknown seeder \"$name\".",
                'data'    => ['available' => $service->available()],
            ]);
            return;
        }

        try {
            $log = $service->run($name);
            $response->json([
                'success' => true,
                'message' => "Seeder \"$name\" completed.",
                'data'    => ['log' => $log],
            ]);
        } catch (\Throwable $e) {
            $response->status(500)->json([
                'success' => false,
                'message' => "Seeder \"$name\" failed: " . $e->getMessage(),
            ]);
        }
    }

    /** Lists all registered seeder names, for building the workflow_dispatch choice list. */
    public function seeders(Request $request, Response $response): void
    {
        $service = new SeederService();
        $response->json([
            'success' => true,
            'message' => 'Available seeders retrieved.',
            'data'    => ['available' => $service->available()],
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

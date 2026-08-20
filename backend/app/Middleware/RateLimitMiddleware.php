<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Helpers\ResponseHelper;
use Core\Request;
use Core\Response;

/**
 * Simple file-based rate limiter.
 *
 * Tracks request counts per IP in a temp directory.
 * For production at scale, swap the storage backend for Redis or Memcached.
 *
 * Usage in routes:
 *   $router->post('/api/auth/login', [AuthController::class, 'login'], [RateLimitMiddleware::class]);
 *
 * Limits: 60 requests per minute by default (configurable via constructor or env).
 */
class RateLimitMiddleware
{
    private int $maxRequests;
    private int $windowSeconds;
    private string $storageDir;

    public function __construct(int $maxRequests = 60, int $windowSeconds = 60)
    {
        $this->maxRequests   = (int)($_ENV['RATE_LIMIT_MAX']    ?? $maxRequests);
        $this->windowSeconds = (int)($_ENV['RATE_LIMIT_WINDOW'] ?? $windowSeconds);
        $appNameSlug        = preg_replace('/[^A-Za-z0-9_-]/', '_', strtolower($_ENV['APP_NAME'] ?? 'app'));
        $this->storageDir   = sys_get_temp_dir() . '/' . $appNameSlug . '_rate_limit';

        if (!is_dir($this->storageDir)) {
            mkdir($this->storageDir, 0700, true);
        }
    }

    public function handle(Request $request, Response $response): void
    {
        $ip  = $request->ip();
        $key = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $ip);
        $file = "{$this->storageDir}/{$key}.json";

        $now    = time();
        $window = $now - $this->windowSeconds;

        // Load existing request timestamps for this IP
        $timestamps = [];
        if (file_exists($file)) {
            $data = json_decode(file_get_contents($file), true);
            // Keep only timestamps within the current window
            $timestamps = array_filter($data ?? [], fn(int $ts) => $ts > $window);
        }

        $count = count($timestamps);

        // Set rate limit headers so clients know their remaining budget
        header("X-RateLimit-Limit: {$this->maxRequests}");
        header('X-RateLimit-Remaining: ' . max(0, $this->maxRequests - $count - 1));
        header('X-RateLimit-Reset: ' . ($now + $this->windowSeconds));

        if ($count >= $this->maxRequests) {
            header('Retry-After: ' . $this->windowSeconds);
            ResponseHelper::json([
                'success' => false,
                'message' => 'Too many requests. Please try again later.',
            ], 429);
        }

        // Record this request and persist
        $timestamps[] = $now;
        file_put_contents($file, json_encode(array_values($timestamps)), LOCK_EX);
    }
}

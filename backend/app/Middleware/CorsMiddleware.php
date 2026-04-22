<?php

declare(strict_types=1);

namespace App\Middleware;

class CorsMiddleware
{
    public function handle(mixed $request = null, mixed $response = null): void
    {
        $allowedOriginsStr = $_ENV['CORS_ALLOWED_ORIGINS'] ?? '*';
        $allowedOrigins = array_map('trim', explode(',', $allowedOriginsStr));

        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';

        // Handle Wildcard or Specific Match
        if (in_array('*', $allowedOrigins, true)) {
            // When Access-Control-Allow-Credentials is true, we cannot use '*' as the origin.
            // We must return the actual origin from the request to allow any site.
            if (!empty($origin)) {
                header("Access-Control-Allow-Origin: {$origin}");
                header('Vary: Origin');
            } else {
                header('Access-Control-Allow-Origin: *');
            }
        } elseif (!empty($origin) && in_array($origin, $allowedOrigins, true)) {
            header("Access-Control-Allow-Origin: {$origin}");
            header('Vary: Origin');
        }

        header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-HTTP-Method-Override, Accept');
        header('Access-Control-Allow-Credentials: true');
        header('Access-Control-Max-Age: 86400');

        if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
            http_response_code(204);
            exit;
        }
    }
}

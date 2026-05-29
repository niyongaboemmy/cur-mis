<?php

declare(strict_types=1);

namespace App\Middleware;

class CorsMiddleware
{
    public function handle(mixed $request = null, mixed $response = null): void
    {
        $allowedOriginsStr = $_ENV['CORS_ALLOWED_ORIGINS'] ?? '*';
        $allowedOrigins    = array_map('trim', explode(',', $allowedOriginsStr));

        // Apache does not always put Origin in $_SERVER['HTTP_ORIGIN'].
        // Try all known locations before giving up.
        $origin = $_SERVER['HTTP_ORIGIN']
            ?? $_SERVER['REDIRECT_HTTP_ORIGIN']
            ?? (function_exists('apache_request_headers')
                ? (apache_request_headers()['Origin'] ?? apache_request_headers()['origin'] ?? '')
                : '')
            ?? '';

        if (in_array('*', $allowedOrigins, true)) {
            // Wildcard config: echo back the actual request origin so that
            // Access-Control-Allow-Credentials: true can still be used.
            if ($origin !== '') {
                header("Access-Control-Allow-Origin: {$origin}");
                header('Vary: Origin');
            } else {
                header('Access-Control-Allow-Origin: *');
            }
        } elseif ($origin !== '' && in_array($origin, $allowedOrigins, true)) {
            header("Access-Control-Allow-Origin: {$origin}");
            header('Vary: Origin');
        } elseif ($origin === '' && !empty($allowedOrigins) && !in_array('*', $allowedOrigins, true)) {
            // Origin header is missing (e.g. same-host curl/Postman requests) — allow through.
            // Do NOT set the header; browsers always send Origin, so this only affects non-browser clients.
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

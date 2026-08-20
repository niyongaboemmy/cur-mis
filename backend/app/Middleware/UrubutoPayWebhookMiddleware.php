<?php

declare(strict_types=1);

namespace App\Middleware;

use Core\Database;
use Core\Request;
use Core\Response;

class UrubutoPayWebhookMiddleware
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    public function handle(Request $request, Response $response): void
    {
        // Use bearerToken() — it reads HTTP_AUTHORIZATION *and* the
        // REDIRECT_HTTP_AUTHORIZATION fallback that Apache/mod_rewrite produces
        // (header('Authorization') alone misses it on this server config) and
        // strips the "Bearer " prefix for us.
        $token = $request->bearerToken() ?? '';

        if ($token !== '') {
            $row = $this->db->fetchOne(
                'SELECT id FROM api_authorization
                  WHERE token = ?
                    AND (token_expires_at IS NULL OR token_expires_at > NOW())
                  LIMIT 1',
                [$token]
            );
            if ($row) {
                return;
            }
        }

        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'timestamp' => date('Y-m-d H:i:s'),
            'status'    => 401,
            'message'   => 'Wrong Authentication',
        ]);
        exit;
    }
}

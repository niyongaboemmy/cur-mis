<?php

declare(strict_types=1);

namespace App\Middleware;

use Core\Database;
use Core\Request;
use Core\Response;

class UrubutoPayWebhookMiddleware
{
<<<<<<< HEAD
    public function handle(Request $request, Response $response): void
    {
        $auth = $request->header('Authorization') ?? '';

        if (!str_starts_with($auth, 'Bearer ')) {
            http_response_code(401);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode([
                'timestamp' => date('Y-m-d\TH:i:s\Z'),
                'status'    => 401,
                'message'   => 'Wrong Authentication',
            ]);
            exit;
        }

        $token = substr($auth, 7); // strip "Bearer "

        $db  = Database::getInstance();
        $row = $db->fetchOne(
            'SELECT id FROM api_authorization WHERE token = ? LIMIT 1',
            [$token]
        );

        if (!$row) {
            http_response_code(401);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode([
                'timestamp' => date('Y-m-d\TH:i:s\Z'),
                'status'    => 401,
                'message'   => 'Wrong Authentication',
            ]);
            exit;
        }

=======
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    public function handle(Request $request, Response $response): void
    {
        $header = $request->header('Authorization') ?? '';
        $parts  = explode(' ', trim($header), 2);
        $token  = $parts[1] ?? '';

        if ($token !== '') {
            $row = $this->db->fetchOne(
                'SELECT id FROM api_authorization WHERE token = ? LIMIT 1',
                [$token]
            );
            if ($row) {
                return;
            }
        }

        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'timestamp' => date('Y-m-d\TH:i:s\Z'),
            'status'    => 401,
            'message'   => 'Wrong Authentication',
        ]);
        exit;
>>>>>>> emmy/emmy
    }
}

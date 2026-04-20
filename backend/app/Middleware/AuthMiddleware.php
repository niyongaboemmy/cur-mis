<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Services\AuthService;
use App\Helpers\ResponseHelper;
use Core\Request;
use Core\Response;

class AuthMiddleware
{
    public function handle(Request $request, Response $response): void
    {
        $token = $request->bearerToken();

        if (!$token) {
            ResponseHelper::json(['success' => false, 'message' => 'Unauthorized. No token provided.'], 401);
        }

        $authService = new AuthService();
        $decoded     = $authService->decodeToken($token);

        if (!$decoded) {
            ResponseHelper::json(['success' => false, 'message' => 'Unauthorized. Invalid or expired token.'], 401);
        }

        $request->setRouteParams(['_auth_user' => $decoded['user'] ?? $decoded]);
    }
}

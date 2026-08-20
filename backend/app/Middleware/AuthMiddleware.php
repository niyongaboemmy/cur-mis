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
        $token = $request->bearerToken() ?? $request->query('token');

        if (!$token) {
            ResponseHelper::json(['success' => false, 'message' => 'Unauthorized. No token provided.'], 401);
        }

        $authService = new AuthService();
        $decoded     = $authService->decodeToken($token);

        if (!$decoded) {
            ResponseHelper::json(['success' => false, 'message' => 'Unauthorized. Invalid or expired token.'], 401);
        }

        $tokenUser = (array) ($decoded['user'] ?? $decoded);

        // Authorisation is resolved from the database, not from the token.
        // The JWT's `role` / `permissions[]` claims are a snapshot taken at
        // login, so without this a permission granted to a role today would
        // not reach its holders until their week-long token expired and they
        // logged in again — while the frontend, which gates off the
        // DB-backed /api/auth/me, had already shown them the feature.
        $user = AuthService::hydrateAuthUser($tokenUser);

        if ($user === null) {
            ResponseHelper::json([
                'success' => false,
                'message' => 'Unauthorized. This account is no longer active.',
            ], 401);
        }

        $request->setRouteParams(['_auth_user' => $user]);
    }
}

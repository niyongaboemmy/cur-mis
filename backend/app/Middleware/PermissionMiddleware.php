<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Helpers\ResponseHelper;
use App\Services\AuthService;
use Core\Request;
use Core\Response;

/**
 * Middleware to check if the authenticated user has a specific permission.
 * 
 * Usage in Router:
 *   $router->get('/path', [Controller::class, 'method'], [AuthMiddleware::class, new PermissionMiddleware('slug')]);
 */
class PermissionMiddleware
{
    private string $permission;

    public function __construct(string $permission)
    {
        $this->permission = $permission;
    }

    public function handle(Request $request, Response $response): void
    {
        $user = $request->param('_auth_user');

        if (!$user) {
            ResponseHelper::json(['success' => false, 'message' => 'Unauthenticated.'], 401);
        }

        // Ensure $user is an array (JWT decode might return stdClass)
        $user = (array) $user;

        if (AuthService::isSuperadmin($user)) {
            return;
        }

        $permissions = (array) ($user['permissions'] ?? []);

        if (!in_array($this->permission, $permissions, true)) {
            ResponseHelper::json([
                'success' => false, 
                'message' => 'Forbidden. You do not have the required permission: ' . $this->permission
            ], 403);
        }
    }
}

<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Helpers\ResponseHelper;
use Core\Request;
use Core\Response;

/**
 * Middleware that passes if the authenticated user has ANY of the given permissions.
 *
 * Mirrors PermissionMiddleware but accepts a list. Superadmin always passes.
 *
 * Usage:
 *   $router->get('/path', [...], [new MaybePermissionMiddleware(['A_PERM', 'B_PERM'])]);
 */
class MaybePermissionMiddleware
{
    /** @var string[] */
    private array $permissions;

    public function __construct(array $permissions)
    {
        $this->permissions = $permissions;
    }

    public function handle(Request $request, Response $response): void
    {
        $user = $request->param('_auth_user');

        if (!$user) {
            ResponseHelper::json(['success' => false, 'message' => 'Unauthenticated.'], 401);
        }

        $user = (array) $user;

        if (isset($user['role']) && in_array($user['role'], ['superadmin', 'admin'], true)) {
            return;
        }

        $userPerms = (array) ($user['permissions'] ?? []);

        foreach ($this->permissions as $perm) {
            if (in_array($perm, $userPerms, true)) {
                return;
            }
        }

        ResponseHelper::json([
            'success' => false,
            'message' => 'Forbidden. Requires one of: ' . implode(', ', $this->permissions),
        ], 403);
    }
}

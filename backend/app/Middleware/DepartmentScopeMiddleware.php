<?php

declare(strict_types=1);

namespace App\Middleware;

use Core\Request;
use Core\Response;
use App\Helpers\ResponseHelper;

/**
 * Enforces department-level scoping for users with enforce_department_scope enabled.
 *
 * When a user's role has enforce_department_scope = 1, they can only:
 * - View/manage staff and students in their assigned departments
 * - Approve leave requests from staff in their departments
 * - Access module/marks data for their departments only
 *
 * Usage in Router:
 *   $router->get('/path', [Controller::class, 'method'], [AuthMiddleware::class, new DepartmentScopeMiddleware()]);
 */
class DepartmentScopeMiddleware
{
    public function handle(Request $request, Response $response): void
    {
        $user = $request->param('_auth_user');

        if (!$user) {
            ResponseHelper::json(['success' => false, 'message' => 'Unauthenticated.'], 401);
        }

        $user = (array) $user;

        // Superadmin and guests bypass scope checks
        if ($this->isSuperadmin($user) || !($user['enforce_department_scope'] ?? false)) {
            return;
        }

        // User must have at least one assigned department
        $assignedDepts = (array)($user['assigned_departments'] ?? []);

        if (empty($assignedDepts)) {
            ResponseHelper::json([
                'success' => false,
                'message' => 'You do not have any departments assigned. Contact your administrator.',
            ], 403);
        }

        // Store scope info in request for use by controllers
        $request->setParam('_department_scope', [
            'user_id' => $user['id'] ?? null,
            'assigned_departments' => array_map(fn($d) => (int)($d['id'] ?? $d['dep_id'] ?? 0), $assignedDepts),
        ]);
    }

    private function isSuperadmin(array $user): bool
    {
        return ($user['role_name'] ?? '') === 'superadmin' || ($user['role_name'] ?? '') === 'admin';
    }
}

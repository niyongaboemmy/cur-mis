<?php

declare(strict_types=1);

namespace App\Middleware;

use Core\Request;
use Core\Response;
use App\Helpers\ResponseHelper;

/**
 * Enforces faculty-level scoping for users with enforce_faculty_scope enabled.
 *
 * When a user's role has enforce_faculty_scope = 1, they can only:
 * - View/manage departments within their assigned faculties
 * - Approve leave requests from staff in their faculties
 * - Access academic data for their faculties only
 *
 * Usage in Router:
 *   $router->get('/path', [Controller::class, 'method'], [AuthMiddleware::class, new FacultyScopeMiddleware()]);
 */
class FacultyScopeMiddleware
{
    public function handle(Request $request, Response $response): void
    {
        $user = $request->param('_auth_user');

        if (!$user) {
            ResponseHelper::json(['success' => false, 'message' => 'Unauthenticated.'], 401);
        }

        $user = (array) $user;

        // Superadmin and guests bypass scope checks
        if ($this->isSuperadmin($user) || !($user['enforce_faculty_scope'] ?? false)) {
            return;
        }

        // User must have at least one assigned faculty
        $assignedFaculties = (array)($user['assigned_faculties'] ?? []);

        if (empty($assignedFaculties)) {
            ResponseHelper::json([
                'success' => false,
                'message' => 'You do not have any faculties assigned. Contact your administrator.',
            ], 403);
        }

        // Store scope info in request for use by controllers
        $request->setParam('_faculty_scope', [
            'user_id' => $user['id'] ?? null,
            'assigned_faculties' => array_map(fn($f) => (int)($f['id'] ?? $f['fac_id'] ?? 0), $assignedFaculties),
        ]);
    }

    private function isSuperadmin(array $user): bool
    {
        return ($user['role_name'] ?? '') === 'superadmin' || ($user['role_name'] ?? '') === 'admin';
    }
}

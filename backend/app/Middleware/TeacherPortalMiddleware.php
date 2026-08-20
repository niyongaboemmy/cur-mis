<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Constants\Permissions;
use App\Helpers\LecturerScope;
use App\Helpers\ResponseHelper;
use App\Services\AuthService;
use Core\Database;
use Core\Request;
use Core\Response;

/**
 * Gate for the teacher workspace (/api/teacher/*).
 *
 * Access follows the ASSIGNMENT first and the role second. A plain
 * PermissionMiddleware(ACCESS_TEACHER_PORTAL) would lock out anyone who is
 * actually teaching a module but whose role is not `lecturer`/`HOD` — a
 * registrar, an HR manager or a dean who picks up a class still has students,
 * attendance and marks to manage, and no admin should have to hand-edit RBAC
 * for that to work.
 *
 * Allowed when ANY of these hold:
 *   1. superadmin (bypasses every permission check app-wide)
 *   2. the account holds ACCESS_TEACHER_PORTAL
 *   3. the account is assigned to at least one module
 *
 * Note that this only opens the DOOR. Every endpoint behind it is still scoped
 * to the caller's own assignments by LecturerScope, so a non-lecturer who is
 * assigned one module sees exactly that one module — never anyone else's.
 */
class TeacherPortalMiddleware
{
    public function handle(Request $request, Response $response): void
    {
        $user = $request->param('_auth_user');

        if (!$user) {
            ResponseHelper::json(['success' => false, 'message' => 'Unauthenticated.'], 401);
        }

        $user = (array) $user;

        if (AuthService::isSuperadmin($user)) {
            return;
        }

        $permissions = (array) ($user['permissions'] ?? []);
        if (in_array(Permissions::ACCESS_TEACHER_PORTAL, $permissions, true)) {
            return;
        }

        // No grant — fall back to "is this person actually teaching something?".
        $userId = (int) ($user['id'] ?? 0);
        if ($userId > 0 && LecturerScope::moduleIds(Database::getInstance(), $userId) !== []) {
            return;
        }

        ResponseHelper::json([
            'success' => false,
            'message' => 'Forbidden. You are not assigned to teach any module.',
        ], 403);
    }
}

<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Constants\Permissions;
use App\Services\AcademicScopeService;
use App\Services\AuthService;
use Core\Database;
use Core\Request;
use Core\Response;

/**
 * Academic secretaries: assign or remove one per department, or one for a whole
 * faculty. Admin can assign anywhere; a Dean can assign inside their faculty; an
 * HOD can assign inside their department. A secretary cannot assign secretaries.
 */
class AcademicSecretaryController extends BaseController
{
    /** GET — secretaries the caller may see (admin: all; Dean / HOD: inside their scope). */
    public function list(Request $request, Response $response): never
    {
        $authUser = (array) ($request->param('_auth_user') ?? []);
        $isAdmin  = self::isAdmin($authUser);
        $scope    = AcademicScopeService::forUser($authUser);
        if (!$isAdmin && $scope === null) {
            $this->error($response, 'Forbidden.', 403);
        }

        $rows = Database::getInstance()->fetchAll(
            "SELECT a.id, a.user_id, a.fac_id, a.dep_id, a.assigned_at,
                    u.full_name, u.username, f.fac_name, d.dep_name
               FROM academic_secretaries a
               JOIN users u ON u.id = a.user_id
               LEFT JOIN faculty f ON f.fac_id = a.fac_id
               LEFT JOIN departements d ON d.dep_id = a.dep_id
              ORDER BY u.full_name"
        );

        if ($scope !== null) {
            $rows = array_values(array_filter($rows, fn ($r) => self::inScope($scope, $r['fac_id'], $r['dep_id'])));
        }
        $this->success($response, $rows);
    }

    /** POST — assign a secretary. Body: { user_id, fac_id? , dep_id? } (exactly one of fac / dep). */
    public function assign(Request $request, Response $response): never
    {
        $authUser = (array) ($request->param('_auth_user') ?? []);
        $isAdmin  = self::isAdmin($authUser);
        $scope    = AcademicScopeService::forUser($authUser);
        if (!$isAdmin && ($scope === null || $scope['kind'] !== 'head')) {
            $this->error($response, 'Only the Dean or HOD can assign academic secretaries.', 403);
        }

        $userId = (int) $request->input('user_id');
        $facId  = $request->input('fac_id') ? (int) $request->input('fac_id') : null;
        $depId  = $request->input('dep_id') ? (int) $request->input('dep_id') : null;
        if ($userId <= 0 || (($facId === null) === ($depId === null))) {
            $this->error($response, 'Choose a user and either a faculty or a department.', 422);
        }

        $db = Database::getInstance();
        if (!$db->fetchOne('SELECT id FROM users WHERE id = ?', [$userId])) {
            $this->error($response, 'User not found.', 404);
        }
        if ($facId !== null && !$db->fetchOne('SELECT fac_id FROM faculty WHERE fac_id = ?', [$facId])) {
            $this->error($response, 'Faculty not found.', 422);
        }
        if ($depId !== null && !$db->fetchOne('SELECT dep_id FROM departements WHERE dep_id = ?', [$depId])) {
            $this->error($response, 'Department not found.', 422);
        }

        // A Dean or HOD may only assign inside their own scope.
        if (!$isAdmin && !self::inScope($scope, $facId, $depId)) {
            $this->error($response, 'You can only assign secretaries inside your own faculty or department.', 403);
        }

        $actor = (int) ($authUser['id'] ?? 0);
        $db->execute(
            'INSERT INTO academic_secretaries (user_id, fac_id, dep_id, assigned_by) VALUES (?, ?, ?, ?)',
            [$userId, $facId, $depId, $actor ?: null]
        );
        $this->audit($request, $actor, 'secretary_assigned', ['user_id' => $userId, 'fac_id' => $facId, 'dep_id' => $depId]);

        $this->success($response, ['user_id' => $userId, 'fac_id' => $facId, 'dep_id' => $depId], 'Secretary assigned.', 201);
    }

    /** POST — remove an assignment. Path: /academic-scope/secretaries/:id/remove */
    public function remove(Request $request, Response $response): never
    {
        $authUser = (array) ($request->param('_auth_user') ?? []);
        $isAdmin  = self::isAdmin($authUser);
        $scope    = AcademicScopeService::forUser($authUser);
        if (!$isAdmin && ($scope === null || $scope['kind'] !== 'head')) {
            $this->error($response, 'Only the Dean or HOD can remove academic secretaries.', 403);
        }

        $id  = (int) $request->param('id');
        $db  = Database::getInstance();
        $row = $db->fetchOne('SELECT id, user_id, fac_id, dep_id FROM academic_secretaries WHERE id = ?', [$id]);
        if (!$row) {
            $this->error($response, 'Assignment not found.', 404);
        }
        if (!$isAdmin && !self::inScope($scope, $row['fac_id'], $row['dep_id'])) {
            $this->error($response, 'You can only remove secretaries inside your own faculty or department.', 403);
        }

        $db->execute('DELETE FROM academic_secretaries WHERE id = ?', [$id]);
        $actor = (int) ($authUser['id'] ?? 0);
        $this->audit($request, $actor, 'secretary_removed', ['user_id' => (int) $row['user_id'], 'fac_id' => $row['fac_id'], 'dep_id' => $row['dep_id']]);
        $this->success($response, ['id' => $id], 'Secretary removed.');
    }

    private static function isAdmin(array $authUser): bool
    {
        if (AuthService::isSuperadmin($authUser)) {
            return true;
        }
        return in_array(Permissions::MANAGE_USERS, (array) ($authUser['permissions'] ?? []), true);
    }

    /** True when the faculty or department falls inside the Dean / HOD scope. */
    private static function inScope(?array $scope, mixed $facId, mixed $depId): bool
    {
        if ($scope === null) {
            return false;
        }
        if ($depId !== null && in_array((int) $depId, $scope['department_ids'], true)) {
            return true;
        }
        return $depId === null && $facId !== null && in_array((int) $facId, $scope['faculty_ids'], true);
    }

    private function audit(Request $request, int $actor, string $action, array $details): void
    {
        Database::getInstance()->execute(
            'INSERT INTO leave_audit_log (entity, entity_id, user_id, action, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
            ['academic_secretary', (string) ($details['user_id'] ?? ''), $actor ?: null, $action, json_encode($details, JSON_UNESCAPED_UNICODE), $request->ip()]
        );
    }
}

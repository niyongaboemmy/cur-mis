<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Services\AcademicScopeService;
use Core\Database;
use Core\Request;
use Core\Response;

/**
 * Signed-in user's own scope: what they can see, and whether they still need
 * to choose a faculty or department (and wait for approval).
 */
class AcademicScopeController extends BaseController
{
    /** GET — scope flags for the sidebar and the choose / waiting screen. */
    public function me(Request $request, Response $response): never
    {
        $authUser = (array) ($request->param('_auth_user') ?? []);
        $scope    = AcademicScopeService::forUser($authUser);
        $latest   = $this->latestRequest((int)($authUser['id'] ?? 0));

        // Scoped role with nothing approved yet: the account must choose, or wait.
        $gated       = $scope !== null && $scope['level'] === 'none';
        $needsChoice = $gated && (!$latest || $latest['status'] === 'rejected');

        $this->success($response, [
            'scoped'         => $scope !== null,
            'level'          => $scope['level'] ?? null,
            'faculty_ids'    => $scope['faculty_ids'] ?? [],
            'department_ids' => $scope['department_ids'] ?? [],
            'needs_choice'   => $needsChoice,
            'waiting'        => $gated && !$needsChoice,
            'request'        => $latest,
        ]);
    }

    /** GET — faculties and departments to choose from (names only). */
    public function options(Request $request, Response $response): never
    {
        $db = Database::getInstance();
        $this->success($response, [
            'faculties'   => $db->fetchAll('SELECT fac_id, fac_name FROM faculty ORDER BY fac_name'),
            'departments' => $db->fetchAll('SELECT dep_id, dep_name, fac_id FROM departements ORDER BY dep_name'),
            'options'     => $db->fetchAll('SELECT id, name, department_id FROM options WHERE is_active = 1 OR is_active IS NULL ORDER BY name'),
        ]);
    }

    /**
     * POST — a Dean or HOD asks for a faculty or department. Body: { fac_id } or { dep_id }.
     * Only scoped-role accounts can ask, and only one request may be pending.
     */
    public function createRequest(Request $request, Response $response): never
    {
        $authUser = (array) ($request->param('_auth_user') ?? []);
        $userId   = (int)($authUser['id'] ?? 0);

        if (!AcademicScopeService::hasScopedRole($authUser)) {
            $this->error($response, 'Only Dean or Head of Department accounts can request a scope.', 403);
        }

        $facId = $request->input('fac_id') ? (int)$request->input('fac_id') : null;
        $depId = $request->input('dep_id') ? (int)$request->input('dep_id') : null;
        if (($facId === null) === ($depId === null)) {
            $this->error($response, 'Choose either a faculty or a department.', 422);
        }

        $db = Database::getInstance();
        if ($facId !== null && !$db->fetchOne('SELECT fac_id FROM faculty WHERE fac_id = ?', [$facId])) {
            $this->error($response, 'Faculty not found.', 422);
        }
        if ($depId !== null && !$db->fetchOne('SELECT dep_id FROM departements WHERE dep_id = ?', [$depId])) {
            $this->error($response, 'Department not found.', 422);
        }

        $latest = $this->latestRequest($userId);
        if ($latest && $latest['status'] === 'pending') {
            $this->error($response, 'Your request is already waiting for approval.', 409);
        }

        $db->execute(
            'INSERT INTO academic_scope_requests (user_id, fac_id, dep_id, status) VALUES (?, ?, ?, ?)',
            [$userId, $facId, $depId, 'pending']
        );

        $db->execute(
            'INSERT INTO leave_audit_log (entity, entity_id, user_id, action, details, ip_address)
             VALUES (?, ?, ?, ?, ?, ?)',
            [
                'academic_scope_request',
                (string)$db->fetchOne('SELECT LAST_INSERT_ID() AS id')['id'],
                $userId,
                'request_submitted',
                json_encode(['fac_id' => $facId, 'dep_id' => $depId], JSON_UNESCAPED_UNICODE),
                $request->ip(),
            ]
        );

        $this->success($response, $this->latestRequest($userId), 'Request sent. Waiting for approval.', 201);
    }

    /** @return array<string,mixed>|null */
    private function latestRequest(int $userId): ?array
    {
        if ($userId <= 0) {
            return null;
        }
        $row = Database::getInstance()->fetchOne(
            'SELECT r.id, r.fac_id, r.dep_id, r.status, r.requested_at, r.decision_note,
                    f.fac_name, d.dep_name
               FROM academic_scope_requests r
               LEFT JOIN faculty f ON f.fac_id = r.fac_id
               LEFT JOIN departements d ON d.dep_id = r.dep_id
              WHERE r.user_id = ?
              ORDER BY r.id DESC LIMIT 1',
            [$userId]
        );
        return $row ?: null;
    }
}

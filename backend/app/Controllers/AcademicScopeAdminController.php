<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Database;
use Core\Request;
use Core\Response;

/**
 * Admin screens for connecting organisation units to MIS faculties and
 * departments, and for placing the Dean / HOD and their staff.
 *
 * Writes the same tables the leave system reads (leave_org_units,
 * leave_org_members), so a head assigned here also signs leave requests.
 * Every change is written to leave_audit_log.
 *
 * Protected by MANAGE_USERS in routes/api/auth.php.
 */
class AcademicScopeAdminController extends BaseController
{
    /** GET — faculties, departments, and every active org unit with its link and head. */
    public function overview(Request $request, Response $response): never
    {
        $db = Database::getInstance();

        $faculties = $db->fetchAll(
            "SELECT fac_id, fac_name FROM faculty ORDER BY fac_name"
        );
        $departments = $db->fetchAll(
            "SELECT dep_id, dep_name, fac_id FROM departements ORDER BY dep_name"
        );
        $units = $db->fetchAll(
            "SELECT u.id, u.parent_id, u.name, u.head_title, u.head_user_id,
                    hu.full_name AS head_name,
                    u.acting_user_id, au.full_name AS acting_name, u.acting_until,
                    l.fac_id, l.dep_id,
                    (SELECT COUNT(*) FROM leave_org_members m WHERE m.unit_id = u.id) AS member_count
               FROM leave_org_units u
               LEFT JOIN leave_org_unit_academic_links l ON l.unit_id = u.id
               LEFT JOIN users hu ON hu.id = u.head_user_id
               LEFT JOIN users au ON au.id = u.acting_user_id
              WHERE u.is_active = 1
              ORDER BY u.sort_order, u.id"
        );

        $this->success($response, [
            'faculties'   => $faculties,
            'departments' => $departments,
            'units'       => $units,
        ]);
    }

    /** GET — staff placed in one unit. */
    public function members(Request $request, Response $response): never
    {
        $unitId = (int)$request->param('id');
        $db     = Database::getInstance();

        if (!$this->unitExists($unitId)) {
            $this->error($response, 'Unit not found.', 404);
        }

        $rows = $db->fetchAll(
            "SELECT m.user_id, m.job_title, u.full_name, u.username
               FROM leave_org_members m
               JOIN users u ON u.id = m.user_id
              WHERE m.unit_id = ?
              ORDER BY u.full_name",
            [$unitId]
        );

        $this->success($response, $rows);
    }

    /**
     * PUT — connect a unit to a faculty (Dean) or a department (HOD).
     * Body: { fac_id?: int|null, dep_id?: int|null }. Both empty removes the link.
     */
    public function setLink(Request $request, Response $response): never
    {
        $unitId = (int)$request->param('id');
        if (!$this->unitExists($unitId)) {
            $this->error($response, 'Unit not found.', 404);
        }

        $facId = $request->input('fac_id') ? (int)$request->input('fac_id') : null;
        $depId = $request->input('dep_id') ? (int)$request->input('dep_id') : null;
        $db    = Database::getInstance();

        if ($facId !== null && !$db->fetchOne('SELECT fac_id FROM faculty WHERE fac_id = ?', [$facId])) {
            $this->error($response, 'Faculty not found.', 422);
        }
        if ($depId !== null && !$db->fetchOne('SELECT dep_id FROM departements WHERE dep_id = ?', [$depId])) {
            $this->error($response, 'Department not found.', 422);
        }

        if ($facId === null && $depId === null) {
            $db->execute('DELETE FROM leave_org_unit_academic_links WHERE unit_id = ?', [$unitId]);
        } else {
            $db->execute(
                'INSERT INTO leave_org_unit_academic_links (unit_id, fac_id, dep_id)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE fac_id = VALUES(fac_id), dep_id = VALUES(dep_id)',
                [$unitId, $facId, $depId]
            );
        }

        $this->audit($request, 'academic_link', $unitId, 'link_set', [
            'fac_id' => $facId,
            'dep_id' => $depId,
        ]);
        $this->success($response, ['unit_id' => $unitId, 'fac_id' => $facId, 'dep_id' => $depId], 'Link saved.');
    }

    /**
     * PUT — set the head (Dean / HOD) of a unit. Body: { user_id: int|null }.
     */
    public function setHead(Request $request, Response $response): never
    {
        $unitId = (int)$request->param('id');
        if (!$this->unitExists($unitId)) {
            $this->error($response, 'Unit not found.', 404);
        }

        $userId = $request->input('user_id') ? (int)$request->input('user_id') : null;
        $db     = Database::getInstance();

        if ($userId !== null && !$db->fetchOne('SELECT id FROM users WHERE id = ?', [$userId])) {
            $this->error($response, 'User not found.', 422);
        }

        $db->execute(
            'UPDATE leave_org_units SET head_user_id = ? WHERE id = ?',
            [$userId, $unitId]
        );

        $this->audit($request, 'academic_link', $unitId, 'head_set', ['head_user_id' => $userId]);
        $this->success($response, ['unit_id' => $unitId, 'head_user_id' => $userId], 'Head saved.');
    }

    /**
     * PUT — replace the staff placed in a unit. Body: { user_ids: int[] }.
     * Staff moved here leave their previous unit. Staff removed are unplaced.
     */
    public function setMembers(Request $request, Response $response): never
    {
        $unitId = (int)$request->param('id');
        if (!$this->unitExists($unitId)) {
            $this->error($response, 'Unit not found.', 404);
        }

        $wanted = array_values(array_unique(array_map('intval', (array)$request->input('user_ids', []))));
        $wanted = array_values(array_filter($wanted, static fn (int $id) => $id > 0));
        $db     = Database::getInstance();

        if ($wanted) {
            $ph    = implode(',', array_fill(0, count($wanted), '?'));
            $valid = $db->fetchAll("SELECT id FROM users WHERE id IN ({$ph})", $wanted);
            if (count($valid) !== count($wanted)) {
                $this->error($response, 'One or more users were not found.', 422);
            }
        }

        $current = $db->fetchAll('SELECT user_id FROM leave_org_members WHERE unit_id = ?', [$unitId]);
        $currentIds = array_map(static fn ($r) => (int)$r['user_id'], $current);

        $removed = array_values(array_diff($currentIds, $wanted));
        $added   = array_values(array_diff($wanted, $currentIds));
        $actor   = (int)(((array)($request->param('_auth_user') ?? []))['id'] ?? 0);

        if ($removed) {
            $ph = implode(',', array_fill(0, count($removed), '?'));
            $db->execute("DELETE FROM leave_org_members WHERE unit_id = ? AND user_id IN ({$ph})", array_merge([$unitId], $removed));
        }
        foreach ($added as $uid) {
            $db->execute(
                'INSERT INTO leave_org_members (user_id, unit_id, updated_by)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE unit_id = VALUES(unit_id), updated_by = VALUES(updated_by)',
                [$uid, $unitId, $actor ?: null]
            );
        }

        $this->audit($request, 'academic_link', $unitId, 'members_set', [
            'added'   => $added,
            'removed' => $removed,
        ]);
        $this->success($response, ['unit_id' => $unitId, 'count' => count($wanted)], 'Staff saved.');
    }

    /** GET — requests waiting for a decision, with the unit they would take over. */
    public function listRequests(Request $request, Response $response): never
    {
        $status = (string)($request->query('status') ?? 'pending');
        if (!in_array($status, ['pending', 'approved', 'rejected'], true)) {
            $status = 'pending';
        }

        $rows = Database::getInstance()->fetchAll(
            "SELECT r.id, r.user_id, r.fac_id, r.dep_id, r.status, r.requested_at, r.decision_note,
                    u.full_name, u.username, u.role_id,
                    (SELECT LOWER(TRIM(rl.name)) FROM roles rl WHERE rl.id = u.role_id) AS requester_role,
                    f.fac_name, d.dep_name,
                    l.unit_id, ou.name AS unit_name, ou.head_user_id AS unit_head_id, hu.full_name AS unit_head_name
               FROM academic_scope_requests r
               JOIN users u ON u.id = r.user_id
               LEFT JOIN faculty f ON f.fac_id = r.fac_id
               LEFT JOIN departements d ON d.dep_id = r.dep_id
               LEFT JOIN leave_org_unit_academic_links l
                      ON (r.fac_id IS NOT NULL AND l.fac_id = r.fac_id)
                      OR (r.dep_id IS NOT NULL AND l.dep_id = r.dep_id)
               LEFT JOIN leave_org_units ou ON ou.id = l.unit_id
               LEFT JOIN users hu ON hu.id = ou.head_user_id
              WHERE r.status = ?
              ORDER BY r.requested_at ASC, r.id ASC",
            [$status]
        );

        $this->success($response, $rows);
    }

    /**
     * POST — approve a request: the requester becomes head of the org unit linked
     * to the requested faculty or department. Any previous head is replaced and
     * recorded in the audit log.
     */
    public function approveRequest(Request $request, Response $response): never
    {
        $requestId = (int)$request->param('id');
        $db        = Database::getInstance();
        $req       = $db->fetchOne('SELECT * FROM academic_scope_requests WHERE id = ?', [$requestId]);
        if (!$req) {
            $this->error($response, 'Request not found.', 404);
        }
        if ($req['status'] !== 'pending') {
            $this->error($response, 'This request has already been decided.', 409);
        }

        $actor = (int)(((array)($request->param('_auth_user') ?? []))['id'] ?? 0);

        // An academic secretary is assigned to the faculty or department; they do not become head of a unit.
        $roleRow = $db->fetchOne(
            'SELECT r.name FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = ?',
            [(int)$req['user_id']]
        ) ?: [];
        if (strtolower(trim((string)($roleRow['name'] ?? ''))) === 'academic secretary') {
            $db->execute(
                'INSERT INTO academic_secretaries (user_id, fac_id, dep_id, assigned_by) VALUES (?, ?, ?, ?)',
                [(int)$req['user_id'], $req['fac_id'], $req['dep_id'], $actor ?: null]
            );
            $db->execute(
                "UPDATE academic_scope_requests SET status = 'approved', decided_by = ?, decided_at = NOW() WHERE id = ?",
                [$actor ?: null, $requestId]
            );
            $this->audit($request, 'academic_secretary', (int)$req['user_id'], 'request_approved', [
                'request_id' => $requestId,
                'fac_id'     => $req['fac_id'],
                'dep_id'     => $req['dep_id'],
            ]);
            $this->success($response, ['request_id' => $requestId], 'Secretary approved.');
        }

        $unit = $req['fac_id'] !== null
            ? $db->fetchOne('SELECT unit_id FROM leave_org_unit_academic_links WHERE fac_id = ? LIMIT 1', [(int)$req['fac_id']])
            : $db->fetchOne('SELECT unit_id FROM leave_org_unit_academic_links WHERE dep_id = ? LIMIT 1', [(int)$req['dep_id']]);
        if (!$unit) {
            $this->error($response, 'No organisation unit is linked to this faculty or department yet. Link it on the Academic Scope page first.', 422);
        }
        $unitId = (int)$unit['unit_id'];
        $prev   = $db->fetchOne('SELECT head_user_id FROM leave_org_units WHERE id = ?', [$unitId]);
        $actor  = (int)(((array)($request->param('_auth_user') ?? []))['id'] ?? 0);

        $db->execute('UPDATE leave_org_units SET head_user_id = ? WHERE id = ?', [(int)$req['user_id'], $unitId]);
        $db->execute(
            "UPDATE academic_scope_requests SET status = 'approved', decided_by = ?, decided_at = NOW() WHERE id = ?",
            [$actor ?: null, $requestId]
        );

        $this->audit($request, 'academic_link', $unitId, 'request_approved', [
            'request_id'        => $requestId,
            'user_id'           => (int)$req['user_id'],
            'previous_head_id'  => $prev['head_user_id'] ?? null,
        ]);
        $this->success($response, ['request_id' => $requestId, 'unit_id' => $unitId], 'Request approved.');
    }

    /** POST — reject a request. Body: { note?: string }. */
    public function rejectRequest(Request $request, Response $response): never
    {
        $requestId = (int)$request->param('id');
        $db        = Database::getInstance();
        $req       = $db->fetchOne('SELECT id, status, user_id FROM academic_scope_requests WHERE id = ?', [$requestId]);
        if (!$req) {
            $this->error($response, 'Request not found.', 404);
        }
        if ($req['status'] !== 'pending') {
            $this->error($response, 'This request has already been decided.', 409);
        }

        $note  = mb_substr(trim((string)$request->input('note', '')), 0, 255) ?: null;
        $actor = (int)(((array)($request->param('_auth_user') ?? []))['id'] ?? 0);
        $db->execute(
            "UPDATE academic_scope_requests SET status = 'rejected', decided_by = ?, decided_at = NOW(), decision_note = ? WHERE id = ?",
            [$actor ?: null, $note, $requestId]
        );

        $this->audit($request, 'academic_request', $requestId, 'request_rejected', [
            'user_id' => (int)$req['user_id'],
            'note'    => $note,
        ]);
        $this->success($response, ['request_id' => $requestId], 'Request rejected.');
    }

    private function unitExists(int $unitId): bool
    {
        return (bool) Database::getInstance()->fetchOne('SELECT id FROM leave_org_units WHERE id = ?', [$unitId]);
    }

    /** @param array<string,mixed> $details */
    private function audit(Request $request, string $entity, int $entityId, string $action, array $details): void
    {
        $actor = (int)(((array)($request->param('_auth_user') ?? []))['id'] ?? 0);
        Database::getInstance()->execute(
            'INSERT INTO leave_audit_log (entity, entity_id, user_id, action, details, ip_address)
             VALUES (?, ?, ?, ?, ?, ?)',
            [
                $entity,
                (string)$entityId,
                $actor ?: null,
                $action,
                json_encode($details, JSON_UNESCAPED_UNICODE),
                $request->ip(),
            ]
        );
    }
}

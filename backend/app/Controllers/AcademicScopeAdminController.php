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

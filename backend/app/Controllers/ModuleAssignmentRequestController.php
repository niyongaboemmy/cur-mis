<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Constants\Permissions;
use App\Helpers\AcademicContext;
use App\Helpers\InstructorDirectory;
use App\Helpers\LecturerScope;
use App\Services\AcademicScopeService;
use App\Services\AuthService;
use Core\Database;
use Core\Request;
use Core\Response;

/**
 * A lecturer with no modules assigned asks for the modules they teach. An admin, or
 * the Dean / HOD / secretary of the module's department, approves. Approval creates
 * the module assignment, and the lecturer's data follows that assignment.
 */
class ModuleAssignmentRequestController extends BaseController
{
    /** GET — whether this account must request modules, or is waiting for approval. */
    public function status(Request $request, Response $response): never
    {
        $authUser = (array) ($request->param('_auth_user') ?? []);
        $db       = Database::getInstance();
        $uid      = (int) ($authUser['id'] ?? 0);

        $isLecturer = in_array(Permissions::ACCESS_TEACHER_PORTAL, (array) ($authUser['permissions'] ?? []), true);
        $exempt     = AuthService::isSuperadmin($authUser)
            || in_array(Permissions::MANAGE_USERS, (array) ($authUser['permissions'] ?? []), true)
            || AcademicScopeService::forUser($authUser) !== null; // Dean / HOD / secretary have their own gate

        $assigned = count(LecturerScope::moduleIds($db, $uid));
        $pending  = (int) ($db->fetchOne(
            "SELECT COUNT(*) AS n FROM module_assignment_requests WHERE user_id = ? AND status = 'pending'",
            [$uid]
        )['n'] ?? 0);

        $applies = $isLecturer && !$exempt && $uid > 0 && $assigned === 0;

        $this->success($response, [
            'applies'        => $applies,
            'needs_request'  => $applies && $pending === 0,
            'waiting'        => $applies && $pending > 0,
            'assigned_count' => $assigned,
            'pending_count'  => $pending,
        ]);
    }

    /** GET — modules the lecturer may ask for (their placed department, if any). */
    public function options(Request $request, Response $response): never
    {
        $authUser = (array) ($request->param('_auth_user') ?? []);
        $db       = Database::getInstance();
        $uid      = (int) ($authUser['id'] ?? 0);

        $dep = $db->fetchOne('SELECT dep_id FROM lecturer_placements WHERE user_id = ?', [$uid]);
        $depId = $dep && $dep['dep_id'] !== null ? (int) $dep['dep_id'] : null;

        $sql    = "SELECT m.module_id, m.module_code, m.module_name, m.department, d.dep_name
                     FROM modules m
                     LEFT JOIN departements d ON d.dep_id = m.department
                    WHERE m.status = 'active'";
        $params = [];
        if ($depId !== null) {
            $sql    .= ' AND m.department = ?';
            $params[] = $depId;
        }
        $sql .= ' ORDER BY m.module_code ASC LIMIT 500';

        $this->success($response, [
            'department_id' => $depId,
            'modules'       => $db->fetchAll($sql, $params),
        ]);
    }

    /** POST — ask for modules. Body: { module_ids: int[] }. */
    public function submit(Request $request, Response $response): never
    {
        $authUser = (array) ($request->param('_auth_user') ?? []);
        $db       = Database::getInstance();
        $uid      = (int) ($authUser['id'] ?? 0);

        if (count(LecturerScope::moduleIds($db, $uid)) > 0) {
            $this->error($response, 'You already have modules assigned.', 409);
        }

        $ids = array_values(array_unique(array_filter(array_map('intval', (array) $request->input('module_ids', [])))));
        if ($ids === []) {
            $this->error($response, 'Choose at least one module.', 422);
        }

        $ph = implode(',', array_fill(0, count($ids), '?'));
        $valid = $db->fetchAll("SELECT module_id FROM modules WHERE status = 'active' AND module_id IN ({$ph})", $ids);
        if (count($valid) !== count($ids)) {
            $this->error($response, 'One or more modules were not found.', 422);
        }

        [$yearId, $termId] = $this->currentYearTerm();
        $actor = $uid;
        $sent  = 0;
        foreach ($ids as $mid) {
            $dup = $db->fetchOne(
                "SELECT id FROM module_assignment_requests WHERE user_id = ? AND module_id = ? AND status = 'pending'",
                [$uid, $mid]
            );
            if ($dup) {
                continue;
            }
            $db->execute(
                'INSERT INTO module_assignment_requests (user_id, module_id, academic_year_id, academic_term_id, status) VALUES (?, ?, ?, ?, ?)',
                [$uid, $mid, $yearId, $termId, 'pending']
            );
            $sent++;
        }
        $this->audit($request, $actor, 'module_request_submitted', ['module_ids' => $ids]);

        $this->success($response, ['sent' => $sent], 'Request sent. Waiting for approval.', 201);
    }

    /** GET — pending requests the caller may decide (admin: all; Dean / HOD / secretary: their modules). */
    public function pending(Request $request, Response $response): never
    {
        $authUser = (array) ($request->param('_auth_user') ?? []);
        $isAdmin  = $this->isAdmin($authUser);
        $scope    = AcademicScopeService::forUser($authUser);
        if (!$isAdmin && ($scope === null || $scope['level'] === 'none')) {
            $this->error($response, 'Forbidden.', 403);
        }

        $rows = Database::getInstance()->fetchAll(
            "SELECT r.id, r.user_id, r.module_id, r.requested_at,
                    u.full_name, u.username,
                    m.module_code, m.module_name, m.department, d.dep_name
               FROM module_assignment_requests r
               JOIN users u   ON u.id = r.user_id
               JOIN modules m ON m.module_id = r.module_id
               LEFT JOIN departements d ON d.dep_id = m.department
              WHERE r.status = 'pending'
              ORDER BY r.requested_at ASC, r.id ASC"
        );
        if (!$isAdmin) {
            $rows = array_values(array_filter($rows, fn ($r) => AcademicScopeService::allowsDepartment($scope, $r['department'])));
        }
        $this->success($response, $rows);
    }

    /** POST — approve: the lecturer is assigned to the module for the requested term. */
    public function approve(Request $request, Response $response): never
    {
        $authUser = (array) ($request->param('_auth_user') ?? []);
        $db       = Database::getInstance();
        $req      = $this->loadPendingForDecision($request, $response, $authUser);

        if ($req['academic_year_id'] === null || $req['academic_term_id'] === null) {
            $this->error($response, 'No current academic year or term is set. Set one in Years & terms first.', 422);
        }

        $exists = $db->fetchOne(
            'SELECT id FROM module_assignments WHERE module_id = ? AND user_id = ? AND academic_term_id = ? LIMIT 1',
            [(int) $req['module_id'], (int) $req['user_id'], (int) $req['academic_term_id']]
        );
        if (!$exists) {
            $db->execute(
                "INSERT INTO module_assignments (module_id, staff_id, user_id, academic_year_id, academic_term_id, role, hours_per_week, notes, created_by)
                 VALUES (?, ?, ?, ?, ?, 'primary', 0, 'Approved module request', ?)",
                [
                    (int) $req['module_id'],
                    InstructorDirectory::USER_OFFSET + (int) $req['user_id'],
                    (int) $req['user_id'],
                    (int) $req['academic_year_id'],
                    (int) $req['academic_term_id'],
                    (int) (((array) ($request->param('_auth_user') ?? []))['id'] ?? 0) ?: null,
                ]
            );
        }

        $actor = (int) (((array) ($request->param('_auth_user') ?? []))['id'] ?? 0);
        $db->execute(
            "UPDATE module_assignment_requests SET status = 'approved', decided_by = ?, decided_at = NOW() WHERE id = ?",
            [$actor ?: null, (int) $req['id']]
        );
        $this->audit($request, $actor, 'module_request_approved', ['request_id' => (int) $req['id'], 'module_id' => (int) $req['module_id'], 'user_id' => (int) $req['user_id']]);

        $this->success($response, ['request_id' => (int) $req['id']], 'Module assigned.');
    }

    /** POST — reject. Body: { note?: string }. */
    public function reject(Request $request, Response $response): never
    {
        $authUser = (array) ($request->param('_auth_user') ?? []);
        $db       = Database::getInstance();
        $req      = $this->loadPendingForDecision($request, $response, $authUser);

        $note  = mb_substr(trim((string) $request->input('note', '')), 0, 255) ?: null;
        $actor = (int) (((array) ($request->param('_auth_user') ?? []))['id'] ?? 0);
        $db->execute(
            "UPDATE module_assignment_requests SET status = 'rejected', decided_by = ?, decided_at = NOW(), decision_note = ? WHERE id = ?",
            [$actor ?: null, $note, (int) $req['id']]
        );
        $this->audit($request, $actor, 'module_request_rejected', ['request_id' => (int) $req['id'], 'note' => $note]);

        $this->success($response, ['request_id' => (int) $req['id']], 'Request rejected.');
    }

    /** Loads a pending request and checks the caller may decide it. */
    private function loadPendingForDecision(Request $request, Response $response, array $authUser): array
    {
        $db  = Database::getInstance();
        $req = $db->fetchOne(
            'SELECT r.*, m.department FROM module_assignment_requests r JOIN modules m ON m.module_id = r.module_id WHERE r.id = ?',
            [(int) $request->param('id')]
        );
        if (!$req) {
            $this->error($response, 'Request not found.', 404);
        }
        if ($req['status'] !== 'pending') {
            $this->error($response, 'This request has already been decided.', 409);
        }

        $isAdmin = $this->isAdmin($authUser);
        $scope   = AcademicScopeService::forUser($authUser);
        $canDecide = $isAdmin
            || ($scope !== null && $scope['level'] !== 'none' && AcademicScopeService::allowsDepartment($scope, $req['department']));
        if (!$canDecide) {
            $this->error($response, 'You can only decide requests for modules in your own faculty or department.', 403);
        }
        return $req;
    }

    /** Current academic year and term ids (or nulls). */
    private function currentYearTerm(): array
    {
        return \App\Helpers\AcademicYearTerm::current();
    }

    private function isAdmin(array $authUser): bool
    {
        if (AuthService::isSuperadmin($authUser)) {
            return true;
        }
        return in_array(Permissions::MANAGE_USERS, (array) ($authUser['permissions'] ?? []), true);
    }

    private function audit(Request $request, int $actor, string $action, array $details): void
    {
        Database::getInstance()->execute(
            'INSERT INTO leave_audit_log (entity, entity_id, user_id, action, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
            ['module_assignment_request', (string) ($details['request_id'] ?? ''), $actor ?: null, $action, json_encode($details, JSON_UNESCAPED_UNICODE), $request->ip()]
        );
    }
}

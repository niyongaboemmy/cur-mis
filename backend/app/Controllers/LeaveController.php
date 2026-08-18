<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\LeaveTypeModel;
use App\Models\LeaveRequestModel;
use App\Models\LeaveBalanceModel;
use App\Models\HrEmployeeModel;
use App\Helpers\ValidationHelper;
use App\Services\LeaveApprovalService;
use App\Services\SystemLogService;
use App\Constants\Permissions;
use App\Services\AuthService;

/**
 * Leave types, requests, balances and stats.
 *
 * Anything that changes a request's state goes through LeaveApprovalService —
 * the stage-chain state machine — so the approval rules live in exactly one
 * place regardless of which endpoint was called.
 */
class LeaveController extends BaseController
{
    private LeaveTypeModel      $typeModel;
    private LeaveRequestModel   $requestModel;
    private LeaveBalanceModel   $balanceModel;
    private HrEmployeeModel     $employeeModel;
    private LeaveApprovalService $approvals;

    public function __construct()
    {
        $this->typeModel     = new LeaveTypeModel();
        $this->requestModel  = new LeaveRequestModel();
        $this->balanceModel  = new LeaveBalanceModel();
        $this->employeeModel = new HrEmployeeModel();
        $this->approvals     = new LeaveApprovalService();
    }

    // ──────────────────────────────────────────────────────────
    // Leave Types
    // ──────────────────────────────────────────────────────────

    /**
     * GET /api/hr/leave/types
     */
    public function leaveTypes(Request $request, Response $response): never
    {
        $types = $this->typeModel->db()->fetchAll(
            "SELECT lt.*,
                    (SELECT COUNT(*) FROM leave_approval_stages s WHERE s.leave_type_id = lt.id) AS stage_count
             FROM leave_types lt
             ORDER BY lt.name ASC"
        );
        $this->success($response, $types, 'Leave types fetched.');
    }

    /**
     * POST /api/hr/leave/types
     */
    public function createLeaveType(Request $request, Response $response): never
    {
        $data   = $request->body();
        $errors = ValidationHelper::validate($data, [
            'name'         => ['required'],
            'days_allowed' => ['required', 'numeric'],
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $id = (int) $this->typeModel->create([
            'name'         => trim($data['name']        ?? ''),
            'description'  => trim($data['description'] ?? ''),
            'days_allowed' => (int)($data['days_allowed'] ?? 0),
            'is_paid'      => isset($data['is_paid']) ? (int)(bool)$data['is_paid'] : 1,
            'color'        => trim($data['color']        ?? '#4FB4FF'),
            'is_active'    => isset($data['is_active']) ? (int)(bool)$data['is_active'] : 1,
        ]);

        // Give the new type the same default chain the migration seeds for every
        // existing type, so it is approvable the moment it is created. Either
        // the caller supplies a chain or we fall back to supervisor → HR.
        try {
            $this->approvals->replaceChain($id, $this->chainFromBodyOrDefault($data));
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 422);
        }

        $actor = (array) $request->param('_auth_user');
        SystemLogService::log('CREATE', 'HR', "Created leave type '{$data['name']}' (ID {$id}).", $id, 'leave_type', null, $actor ?: null);
        $this->success($response, $this->typeModel->find($id), 'Leave type created.', 201);
    }

    /**
     * POST /api/hr/leave/types/:id
     */
    public function updateLeaveType(Request $request, Response $response): never
    {
        $id   = (int)$request->param('id');
        $type = $this->typeModel->find($id);
        if (!$type) {
            $this->error($response, 'Leave type not found.', 404);
        }

        $data = $request->body();
        $this->typeModel->update($id, [
            'name'         => trim($data['name']        ?? $type['name']),
            'description'  => trim($data['description'] ?? $type['description']),
            'days_allowed' => (int)($data['days_allowed'] ?? $type['days_allowed']),
            'is_paid'      => isset($data['is_paid']) ? (int)(bool)$data['is_paid'] : (int)$type['is_paid'],
            'color'        => trim($data['color']      ?? $type['color']),
            'is_active'    => isset($data['is_active']) ? (int)(bool)$data['is_active'] : (int)$type['is_active'],
        ]);

        if (isset($data['stages']) && is_array($data['stages'])) {
            try {
                $this->approvals->replaceChain($id, $data['stages']);
            } catch (\RuntimeException $e) {
                $this->error($response, $e->getMessage(), 422);
            }
        }

        $actor = (array) $request->param('_auth_user');
        SystemLogService::log('UPDATE', 'HR', "Updated leave type ID {$id} ('{$type['name']}').", $id, 'leave_type', null, $actor ?: null);
        $this->success($response, $this->typeModel->find($id), 'Leave type updated.');
    }

    /**
     * DELETE /api/hr/leave/types/:id
     */
    public function deleteLeaveType(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        if (!$this->typeModel->find($id)) {
            $this->error($response, 'Leave type not found.', 404);
        }

        // Refuse if referenced by existing requests
        $inUse = $this->typeModel->db()->fetchOne(
            "SELECT COUNT(*) AS n FROM leave_requests WHERE leave_type_id = ?",
            [$id]
        );
        if ((int)($inUse['n'] ?? 0) > 0) {
            $this->error($response, 'Cannot delete: leave type is used in existing requests.', 409);
        }

        // leave_approval_stages cascades on the FK.
        $this->typeModel->delete($id);
        $actor = (array) $request->param('_auth_user');
        SystemLogService::log('DELETE', 'HR', "Deleted leave type ID {$id}.", $id, 'leave_type', null, $actor ?: null);
        $this->success($response, null, 'Leave type deleted.');
    }

    /**
     * Callers may post a chain alongside a new leave type; otherwise apply the
     * institution's own signature sequence — the same one migration 134 seeds
     * for every existing type, so a leave type created later does not quietly
     * get a different approval path:
     *
     *   Prepared by (Responsible Officer)  ← the submission
     *   → Vice Chancellor
     *   → HR — Recommendation
     *   → DAF — Director of Administration & Finance
     *   → Vice Chancellor — Final Authorization  (grants the leave)
     */
    public const DEFAULT_CHAIN = [
        [
            'stage_key'                => 'vice_chancellor',
            'stage_label'              => 'Vice Chancellor',
            'required_permission_slug' => Permissions::APPROVE_LEAVE_VC,
            'is_final_approval'        => 0,
            'sla_hours'                => 48,
        ],
        [
            'stage_key'                => 'hr_recommendation',
            'stage_label'              => 'HR — Recommendation',
            'required_permission_slug' => Permissions::APPROVE_LEAVE_HR,
            'is_final_approval'        => 0,
            'sla_hours'                => 48,
        ],
        [
            'stage_key'                => 'daf_review',
            'stage_label'              => 'DAF — Director of Administration & Finance',
            'required_permission_slug' => Permissions::APPROVE_LEAVE_DAF,
            'is_final_approval'        => 0,
            'sla_hours'                => 48,
        ],
        [
            'stage_key'                => 'vc_final_authorization',
            'stage_label'              => 'Vice Chancellor — Final Authorization',
            'required_permission_slug' => Permissions::APPROVE_LEAVE_FINAL,
            'is_final_approval'        => 1,
            'sla_hours'                => 48,
        ],
    ];

    private function chainFromBodyOrDefault(array $data): array
    {
        if (isset($data['stages']) && is_array($data['stages']) && $data['stages'] !== []) {
            return $data['stages'];
        }

        return self::DEFAULT_CHAIN;
    }

    // ──────────────────────────────────────────────────────────
    // Leave Requests — admin
    // ──────────────────────────────────────────────────────────

    /**
     * GET /api/hr/leave/requests
     * All leave requests with filters: status, employee_id, leave_type_id, year, stage
     */
    public function index(Request $request, Response $response): never
    {
        $page    = max(1, (int)($request->query('page')     ?? 1));
        $perPage = min(100, max(1, (int)($request->query('per_page') ?? 20)));
        $search  = trim((string)($request->query('q') ?? ''));
        $status  = $request->query('status')        ?? '';
        $typeId  = $request->query('leave_type_id') ?? '';
        $year    = $request->query('year')           ?? '';
        $empId   = $request->query('employee_id')   ?? '';
        $stage   = $request->query('stage_order')   ?? '';

        $clauses  = [];
        $bindings = [];

        if ($search !== '') {
            $clauses[]  = "(CONCAT(e.employee_fname,' ',e.employee_lname) LIKE ? OR u.full_name LIKE ?)";
            $bindings[] = "%{$search}%";
            $bindings[] = "%{$search}%";
        }
        if ($status !== '') {
            $clauses[]  = "lr.status = ?";
            $bindings[] = $status;
        }
        if ($typeId !== '') {
            $clauses[]  = "lr.leave_type_id = ?";
            $bindings[] = (int)$typeId;
        }
        if ($year !== '') {
            $clauses[]  = "YEAR(lr.start_date) = ?";
            $bindings[] = (int)$year;
        }
        if ($empId !== '') {
            $clauses[]  = "lr.employee_id = ?";
            $bindings[] = (int)$empId;
        }
        if ($stage !== '') {
            $clauses[]  = "lr.current_stage_order = ?";
            $bindings[] = (int)$stage;
        }

        $where  = $clauses ? 'WHERE ' . implode(' AND ', $clauses) : '';
        $offset = ($page - 1) * $perPage;
        $db     = $this->requestModel->db();

        $countRow = $db->fetchOne(
            "SELECT COUNT(*) AS n
             FROM leave_requests lr
             LEFT JOIN employees e ON e.employee_id = lr.employee_id
             LEFT JOIN users     u ON u.id = lr.user_id
             $where",
            $bindings
        );
        $total = (int)($countRow['n'] ?? 0);

        $rows = $db->fetchAll(
            LeaveRequestModel::detailQuery("$where ORDER BY lr.created_at DESC LIMIT ? OFFSET ?"),
            array_merge($bindings, [$perPage, $offset])
        );

        $this->success($response, [
            'data'         => array_values($rows),
            'total'        => $total,
            'per_page'     => $perPage,
            'current_page' => $page,
            'last_page'    => (int)ceil($total / max(1, $perPage)),
        ], 'Leave requests fetched.');
    }

    /**
     * GET /api/hr/leave/requests/:id
     */
    public function show(Request $request, Response $response): never
    {
        $row = $this->requestModel->findDetailed((int)$request->param('id'));
        if (!$row) {
            $this->error($response, 'Leave request not found.', 404);
        }

        $this->success($response, $row, 'Leave request fetched.');
    }

    /**
     * POST /api/hr/leave/requests
     * HR files a request on behalf of an employee. Enters the chain at stage 1.
     */
    public function store(Request $request, Response $response): never
    {
        $data   = $request->body();
        $errors = ValidationHelper::validate($data, [
            'employee_id'   => ['required', 'numeric'],
            'leave_type_id' => ['required', 'numeric'],
            'start_date'    => ['required'],
            'end_date'      => ['required'],
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $empId = (int)$data['employee_id'];
        if (!$this->employeeModel->find($empId)) {
            $this->error($response, 'Employee not found.', 404);
        }

        try {
            $row = $this->approvals->submit(
                'employee_id',
                $empId,
                (int)$data['leave_type_id'],
                (string)$data['start_date'],
                (string)$data['end_date'],
                trim((string)($data['reason'] ?? '')),
                (array) $request->param('_auth_user')
            );
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 422);
        }

        $this->success($response, $row, 'Leave request submitted.', 201);
    }

    /**
     * POST /api/hr/leave/requests/:id/approve
     * Thin wrapper over the stage decision, kept so the HR list view can
     * approve inline. It advances one stage — it does not skip the chain.
     */
    public function approve(Request $request, Response $response): never
    {
        $this->decideVia($request, $response, 'approved', 'Decision recorded.');
    }

    /**
     * POST /api/hr/leave/requests/:id/reject
     */
    public function reject(Request $request, Response $response): never
    {
        $this->decideVia($request, $response, 'rejected', 'Leave request rejected.');
    }

    /**
     * POST /api/hr/leave/requests/:id/request-changes
     */
    public function requestChanges(Request $request, Response $response): never
    {
        $this->decideVia($request, $response, 'changes_requested', 'Changes requested.');
    }

    private function decideVia(Request $request, Response $response, string $decision, string $message): never
    {
        $actor = (array) $request->param('_auth_user');
        $perms = AuthService::isSuperadmin($actor)
            ? array_merge(LeaveApprovalService::STAGE_PERMISSIONS, [Permissions::MANAGE_LEAVE_REQUESTS])
            : (array) ($actor['permissions'] ?? []);

        try {
            $updated = $this->approvals->decide(
                (int)$request->param('id'),
                $decision,
                $perms,
                $actor,
                $request->body()['comment'] ?? null
            );
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 422);
        }

        $this->success($response, $updated, $message);
    }

    /**
     * DELETE /api/hr/leave/requests/:id
     * Administrative cancellation — may also cancel an already-granted leave,
     * which credits the balance back.
     */
    public function cancel(Request $request, Response $response): never
    {
        try {
            $updated = $this->approvals->cancel(
                (int)$request->param('id'),
                null,
                (array) $request->param('_auth_user'),
                trim((string)($request->body()['comment'] ?? '')) ?: null
            );
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 422);
        }

        $this->success($response, $updated, 'Leave request cancelled.');
    }

    // ──────────────────────────────────────────────────────────
    // Leave Requests — self-service (any staff)
    // ──────────────────────────────────────────────────────────

    /**
     * GET /api/hr/leave/my-requests
     * The signed-in user's own leave requests, each with its current stage.
     */
    public function myRequests(Request $request, Response $response): never
    {
        $userId = $this->currentUserId($request, $response);

        $rows = $this->requestModel->db()->fetchAll(
            LeaveRequestModel::detailQuery('WHERE lr.user_id = ? ORDER BY lr.created_at DESC'),
            [$userId]
        );

        $this->success($response, $rows, 'Your leave requests fetched.');
    }

    /**
     * POST /api/hr/leave/my-requests
     * File a leave request for yourself.
     */
    public function submitOwn(Request $request, Response $response): never
    {
        $userId = $this->currentUserId($request, $response);

        $data   = $request->body();
        $errors = ValidationHelper::validate($data, [
            'leave_type_id' => ['required', 'numeric'],
            'start_date'    => ['required'],
            'end_date'      => ['required'],
        ]);
        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        try {
            $row = $this->approvals->submit(
                'user_id',
                $userId,
                (int)$data['leave_type_id'],
                (string)$data['start_date'],
                (string)$data['end_date'],
                trim((string)($data['reason'] ?? '')),
                (array) $request->param('_auth_user')
            );
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 422);
        }

        $this->success($response, $row, 'Leave request submitted.', 201);
    }

    /**
     * POST /api/hr/leave/my-requests/:id/resubmit
     * Answer a reviewer's "changes requested" — re-enters review at the same stage.
     */
    public function resubmitOwn(Request $request, Response $response): never
    {
        $userId = $this->currentUserId($request, $response);

        try {
            $row = $this->approvals->resubmit(
                (int)$request->param('id'),
                $userId,
                $request->body(),
                (array) $request->param('_auth_user')
            );
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 422);
        }

        $this->success($response, $row, 'Leave request resubmitted.');
    }

    /**
     * DELETE /api/hr/leave/my-requests/:id
     * Cancel your own request while it is still under review.
     */
    public function cancelOwn(Request $request, Response $response): never
    {
        $userId = $this->currentUserId($request, $response);

        try {
            $row = $this->approvals->cancel(
                (int)$request->param('id'),
                $userId,
                (array) $request->param('_auth_user')
            );
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 422);
        }

        $this->success($response, $row, 'Leave request cancelled.');
    }

    /**
     * GET /api/hr/leave/my-requests/:id/progress
     * Own-request progress. Scoped to the requester so one staff member can't
     * read another's trail through this endpoint.
     */
    public function myProgress(Request $request, Response $response): never
    {
        $userId = $this->currentUserId($request, $response);
        $id     = (int)$request->param('id');

        $row = $this->requestModel->find($id);
        if (!$row || (int)($row['user_id'] ?? 0) !== $userId) {
            $this->error($response, 'Leave request not found.', 404);
        }

        $this->success($response, $this->approvals->progress($id), 'Leave request progress fetched.');
    }

    private function currentUserId(Request $request, Response $response): int
    {
        $actor  = (array) $request->param('_auth_user');
        $userId = (int)($actor['id'] ?? 0);
        if ($userId <= 0) {
            $this->error($response, 'Unable to identify the current user.', 401);
        }
        return $userId;
    }

    // ──────────────────────────────────────────────────────────
    // Leave Balances
    // ──────────────────────────────────────────────────────────

    /**
     * GET /api/hr/leave/balances
     * Query: ?employee_id=&year=&leave_type_id=
     */
    public function balances(Request $request, Response $response): never
    {
        $empId  = $request->query('employee_id')   ?? '';
        $year   = $request->query('year')           ?? date('Y');
        $typeId = $request->query('leave_type_id') ?? '';

        $clauses  = ["lb.year = ?"];
        $bindings = [(int)$year];

        if ($empId !== '') {
            $clauses[]  = "lb.employee_id = ?";
            $bindings[] = (int)$empId;
        }
        if ($typeId !== '') {
            $clauses[]  = "lb.leave_type_id = ?";
            $bindings[] = (int)$typeId;
        }

        $where = 'WHERE ' . implode(' AND ', $clauses);
        $db    = $this->balanceModel->db();

        $rows = $db->fetchAll(
            "SELECT
               lb.id,
               lb.employee_id,
               CONCAT(e.employee_fname,' ',e.employee_lname) AS employee_name,
               e.employee_post  AS department,
               lb.leave_type_id,
               lt.name AS leave_type_name, lt.color,
               lb.year,
               lb.total_days,
               lb.used_days,
               (lb.total_days - lb.used_days) AS remaining_days
             FROM leave_balances lb
             JOIN employees  e  ON e.employee_id = lb.employee_id
             JOIN leave_types lt ON lt.id = lb.leave_type_id
             $where
             ORDER BY e.employee_fname ASC, lt.name ASC",
            $bindings
        );

        $this->success($response, $rows, 'Leave balances fetched.');
    }

    /**
     * POST /api/hr/leave/balances
     * Upsert a leave balance row for an employee.
     */
    public function upsertBalance(Request $request, Response $response): never
    {
        $data   = $request->body();
        $errors = ValidationHelper::validate($data, [
            'employee_id'   => ['required', 'numeric'],
            'leave_type_id' => ['required', 'numeric'],
            'year'          => ['required', 'numeric'],
            'total_days'    => ['required', 'numeric'],
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $db = $this->balanceModel->db();
        $db->execute(
            "INSERT INTO leave_balances (employee_id, leave_type_id, year, total_days, used_days)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               total_days = VALUES(total_days),
               used_days  = VALUES(used_days)",
            [
                (int)$data['employee_id'],
                (int)$data['leave_type_id'],
                (int)$data['year'],
                (float)$data['total_days'],
                (float)($data['used_days'] ?? 0),
            ]
        );

        $actor = (array) $request->param('_auth_user');
        SystemLogService::log('UPDATE', 'HR', "Upserted leave balance for employee {$data['employee_id']} (type {$data['leave_type_id']}, year {$data['year']}): {$data['total_days']} days.", null, 'leave_balance', ['employee_id' => (int) $data['employee_id'], 'leave_type_id' => (int) $data['leave_type_id'], 'total_days' => (float) $data['total_days']], $actor ?: null);
        $this->success($response, null, 'Leave balance saved.', 201);
    }

    // ──────────────────────────────────────────────────────────
    // Stats
    // ──────────────────────────────────────────────────────────

    /**
     * GET /api/hr/leave/stats
     */
    public function stats(Request $request, Response $response): never
    {
        $db    = $this->requestModel->db();
        $today = date('Y-m-d');
        $year  = (int)date('Y');

        $counts = $db->fetchOne("
            SELECT
              SUM(CASE WHEN status = 'Pending'          THEN 1 ELSE 0 END) AS pending,
              SUM(CASE WHEN status = 'ChangesRequested' THEN 1 ELSE 0 END) AS changes_requested,
              SUM(CASE WHEN status = 'Approved'         THEN 1 ELSE 0 END) AS approved,
              SUM(CASE WHEN status = 'Rejected'         THEN 1 ELSE 0 END) AS rejected,
              COUNT(*) AS total
            FROM leave_requests
            WHERE YEAR(created_at) = ?
        ", [$year]) ?: [];

        $onLeaveToday = (int)($db->fetchOne("
            SELECT COUNT(*) AS n FROM leave_requests
            WHERE status = 'Approved'
              AND start_date <= ? AND end_date >= ?
        ", [$today, $today])['n'] ?? 0);

        $approvedThisMonth = (int)($db->fetchOne("
            SELECT COUNT(*) AS n FROM leave_requests
            WHERE status = 'Approved'
              AND YEAR(reviewed_at)  = ?
              AND MONTH(reviewed_at) = ?
        ", [$year, (int)date('n')])['n'] ?? 0);

        // By leave type distribution (approved)
        $byType = $db->fetchAll("
            SELECT lt.name, lt.color, COUNT(*) AS total,
                   SUM(lr.days_requested) AS total_days
            FROM leave_requests lr
            JOIN leave_types lt ON lt.id = lr.leave_type_id
            WHERE lr.status = 'Approved' AND YEAR(lr.start_date) = ?
            GROUP BY lt.id, lt.name, lt.color
            ORDER BY total_days DESC
        ", [$year]);

        // Monthly trend (approved, current year)
        $monthly = $db->fetchAll("
            SELECT MONTH(start_date) AS month, COUNT(*) AS count
            FROM leave_requests
            WHERE status = 'Approved' AND YEAR(start_date) = ?
            GROUP BY MONTH(start_date)
            ORDER BY month ASC
        ", [$year]);

        // Where the in-flight requests are sitting in their chains, and how many
        // at each stage have blown that stage's SLA — the approval-flow
        // equivalent of a per-stage backlog with an ageing column.
        $byStage = $db->fetchAll("
            SELECT lr.current_stage_order AS stage_order,
                   COALESCE(s.stage_label, 'Unconfigured stage') AS stage_label,
                   COUNT(*) AS total,
                   SUM(CASE
                         WHEN s.sla_hours IS NOT NULL
                          AND TIMESTAMPDIFF(HOUR, COALESCE(
                                (SELECT MAX(a.decided_at) FROM leave_request_approvals a
                                  WHERE a.leave_request_id = lr.id),
                                lr.created_at
                              ), NOW()) > s.sla_hours
                         THEN 1 ELSE 0
                       END) AS overdue
            FROM leave_requests lr
            LEFT JOIN leave_approval_stages s
                   ON s.leave_type_id = lr.leave_type_id
                  AND s.stage_order   = lr.current_stage_order
            WHERE lr.status = 'Pending'
            GROUP BY lr.current_stage_order, s.stage_label
            ORDER BY lr.current_stage_order ASC
        ");

        $overdue = array_sum(array_map(static fn(array $r): int => (int) $r['overdue'], $byStage));

        $this->success($response, [
            'pending'             => (int)($counts['pending']           ?? 0),
            'changes_requested'   => (int)($counts['changes_requested'] ?? 0),
            'approved'            => (int)($counts['approved']          ?? 0),
            'rejected'            => (int)($counts['rejected']          ?? 0),
            'total'               => (int)($counts['total']             ?? 0),
            'on_leave_today'      => $onLeaveToday,
            'approved_this_month' => $approvedThisMonth,
            'by_type'             => $byType,
            'by_stage'            => $byStage,
            'overdue'             => $overdue,
            'monthly_trend'       => $monthly,
        ], 'Leave stats fetched.');
    }
}

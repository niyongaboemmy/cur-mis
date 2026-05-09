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
use App\Services\SystemLogService;

class LeaveController extends BaseController
{
    private LeaveTypeModel    $typeModel;
    private LeaveRequestModel $requestModel;
    private LeaveBalanceModel $balanceModel;
    private HrEmployeeModel   $employeeModel;

    public function __construct()
    {
        $this->typeModel    = new LeaveTypeModel();
        $this->requestModel = new LeaveRequestModel();
        $this->balanceModel = new LeaveBalanceModel();
        $this->employeeModel = new HrEmployeeModel();
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
            "SELECT * FROM leave_types ORDER BY name ASC"
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

        $id = $this->typeModel->create([
            'name'         => trim($data['name']        ?? ''),
            'description'  => trim($data['description'] ?? ''),
            'days_allowed' => (int)($data['days_allowed'] ?? 0),
            'is_paid'      => isset($data['is_paid']) ? (int)(bool)$data['is_paid'] : 1,
            'color'        => trim($data['color']        ?? '#4FB4FF'),
            'is_active'    => isset($data['is_active']) ? (int)(bool)$data['is_active'] : 1,
        ]);

        $actor = (array) $request->param('_auth_user');
        SystemLogService::log('CREATE', 'HR', "Created leave type '{$data['name']}' (ID {$id}).", (int) $id, 'leave_type', null, $actor ?: null);
        $new = $this->typeModel->find($id);
        $this->success($response, $new, 'Leave type created.', 201);
    }

    /**
     * PUT /api/hr/leave/types/:id
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

        $actor = (array) $request->param('_auth_user');
        SystemLogService::log('UPDATE', 'HR', "Updated leave type ID {$id} ('{$data['name']}').", $id, 'leave_type', null, $actor ?: null);
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

        $this->typeModel->delete($id);
        $actor = (array) $request->param('_auth_user');
        SystemLogService::log('DELETE', 'HR', "Deleted leave type ID {$id}.", $id, 'leave_type', null, $actor ?: null);
        $this->success($response, null, 'Leave type deleted.');
    }

    // ──────────────────────────────────────────────────────────
    // Leave Requests — admin
    // ──────────────────────────────────────────────────────────

    /**
     * GET /api/hr/leave/requests
     * All leave requests with filters: status, employee_id, leave_type_id, year
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

        $clauses  = [];
        $bindings = [];

        if ($search !== '') {
            $clauses[]  = "(CONCAT(e.employee_fname,' ',e.employee_lname) LIKE ?)";
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

        $where  = $clauses ? 'WHERE ' . implode(' AND ', $clauses) : '';
        $offset = ($page - 1) * $perPage;
        $db     = $this->requestModel->db();

        $countRow = $db->fetchOne(
            "SELECT COUNT(*) AS n
             FROM leave_requests lr
             JOIN employees e ON e.employee_id = lr.employee_id
             $where",
            $bindings
        );
        $total = (int)($countRow['n'] ?? 0);

        $rows = $db->fetchAll(
            "SELECT
               lr.id,
               lr.employee_id,
               CONCAT(e.employee_fname,' ',e.employee_lname) AS employee_name,
               e.employee_post      AS department,
               e.employee_position  AS position,
               lr.leave_type_id,
               lt.name              AS leave_type_name,
               lt.color             AS leave_type_color,
               lt.is_paid,
               lr.start_date,
               lr.end_date,
               lr.days_requested,
               lr.reason,
               lr.status,
               lr.review_comment,
               lr.reviewed_at,
               lr.created_at
             FROM leave_requests lr
             JOIN employees  e  ON e.employee_id = lr.employee_id
             JOIN leave_types lt ON lt.id = lr.leave_type_id
             $where
             ORDER BY lr.created_at DESC
             LIMIT ? OFFSET ?",
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
        $id  = (int)$request->param('id');
        $db  = $this->requestModel->db();
        $row = $db->fetchOne(
            "SELECT
               lr.id, lr.employee_id,
               CONCAT(e.employee_fname,' ',e.employee_lname) AS employee_name,
               e.employee_post AS department, e.employee_position AS position,
               lr.leave_type_id,
               lt.name AS leave_type_name, lt.color AS leave_type_color, lt.is_paid,
               lr.start_date, lr.end_date, lr.days_requested,
               lr.reason, lr.status, lr.review_comment, lr.reviewed_at, lr.created_at
             FROM leave_requests lr
             JOIN employees e   ON e.employee_id = lr.employee_id
             JOIN leave_types lt ON lt.id = lr.leave_type_id
             WHERE lr.id = ? LIMIT 1",
            [$id]
        );

        if (!$row) {
            $this->error($response, 'Leave request not found.', 404);
        }

        $this->success($response, $row, 'Leave request fetched.');
    }

    /**
     * POST /api/hr/leave/requests
     * Submit a new leave request.
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

        $empId  = (int)$data['employee_id'];
        $typeId = (int)$data['leave_type_id'];

        if (!$this->employeeModel->find($empId)) {
            $this->error($response, 'Employee not found.', 404);
        }
        if (!$this->typeModel->find($typeId)) {
            $this->error($response, 'Leave type not found.', 404);
        }

        $start = $data['start_date'];
        $end   = $data['end_date'];

        // Business days calculation (Mon–Fri only)
        $days = $this->calcBusinessDays($start, $end);

        if ($days <= 0) {
            $this->error($response, 'End date must be on or after start date and include at least one working day.', 422);
        }

        // Check for overlapping approved/pending requests
        $overlap = $this->requestModel->db()->fetchOne(
            "SELECT COUNT(*) AS n FROM leave_requests
             WHERE employee_id = ?
               AND status IN ('Pending','Approved')
               AND start_date <= ? AND end_date >= ?",
            [$empId, $end, $start]
        );
        if ((int)($overlap['n'] ?? 0) > 0) {
            $this->error($response, 'Employee already has a pending or approved leave overlapping these dates.', 409);
        }

        $id = $this->requestModel->create([
            'employee_id'   => $empId,
            'leave_type_id' => $typeId,
            'start_date'    => $start,
            'end_date'      => $end,
            'days_requested'=> $days,
            'reason'        => trim($data['reason'] ?? ''),
            'status'        => 'Pending',
        ]);

        $actor = (array) $request->param('_auth_user');
        SystemLogService::log('CREATE', 'HR', "Leave request submitted for employee {$empId} ({$days} days, {$start} to {$end}).", (int) $id, 'leave_request', ['employee_id' => $empId, 'days' => $days, 'start' => $start, 'end' => $end], $actor ?: null);
        $new = $this->requestModel->find($id);
        $this->success($response, $new, 'Leave request submitted.', 201);
    }

    /**
     * PATCH /api/hr/leave/requests/:id/approve
     */
    public function approve(Request $request, Response $response): never
    {
        $id  = (int)$request->param('id');
        $row = $this->requestModel->find($id);
        if (!$row) {
            $this->error($response, 'Leave request not found.', 404);
        }
        if ($row['status'] !== 'Pending') {
            $this->error($response, "Cannot approve a request with status '{$row['status']}'.", 409);
        }

        $body      = $request->body();
        $comment   = trim((string)($body['comment'] ?? ''));
        $reviewerId = (int)($body['reviewer_id'] ?? 0);

        $this->requestModel->update($id, [
            'status'         => 'Approved',
            'review_comment' => $comment,
            'reviewed_by'    => $reviewerId ?: null,
            'reviewed_at'    => date('Y-m-d H:i:s'),
        ]);

        // Update leave balance — add used days
        $this->adjustBalance(
            (int)$row['employee_id'],
            (int)$row['leave_type_id'],
            (float)$row['days_requested'],
            +1
        );

        $actor = (array) $request->param('_auth_user');
        SystemLogService::log('APPROVE', 'HR', "Approved leave request ID {$id} for employee {$row['employee_id']} ({$row['days_requested']} days).", $id, 'leave_request', ['employee_id' => $row['employee_id'], 'days' => $row['days_requested']], $actor ?: null);
        $this->success($response, null, 'Leave request approved.');
    }

    /**
     * PATCH /api/hr/leave/requests/:id/reject
     */
    public function reject(Request $request, Response $response): never
    {
        $id  = (int)$request->param('id');
        $row = $this->requestModel->find($id);
        if (!$row) {
            $this->error($response, 'Leave request not found.', 404);
        }
        if ($row['status'] !== 'Pending') {
            $this->error($response, "Cannot reject a request with status '{$row['status']}'.", 409);
        }

        $body    = $request->body();
        $comment = trim((string)($body['comment'] ?? ''));
        $reviewerId = (int)($body['reviewer_id'] ?? 0);

        if ($comment === '') {
            $this->error($response, 'A rejection reason/comment is required.', 422);
        }

        $this->requestModel->update($id, [
            'status'         => 'Rejected',
            'review_comment' => $comment,
            'reviewed_by'    => $reviewerId ?: null,
            'reviewed_at'    => date('Y-m-d H:i:s'),
        ]);

        $actor = (array) $request->param('_auth_user');
        SystemLogService::log('REJECT', 'HR', "Rejected leave request ID {$id} for employee {$row['employee_id']}. Reason: {$comment}.", $id, 'leave_request', ['employee_id' => $row['employee_id'], 'comment' => $comment], $actor ?: null);
        $this->success($response, null, 'Leave request rejected.');
    }

    /**
     * DELETE /api/hr/leave/requests/:id
     * Cancel own pending request (admin can cancel any).
     */
    public function cancel(Request $request, Response $response): never
    {
        $id  = (int)$request->param('id');
        $row = $this->requestModel->find($id);
        if (!$row) {
            $this->error($response, 'Leave request not found.', 404);
        }

        if ($row['status'] === 'Approved') {
            // Reverse the balance deduction
            $this->adjustBalance(
                (int)$row['employee_id'],
                (int)$row['leave_type_id'],
                (float)$row['days_requested'],
                -1
            );
        }

        $this->requestModel->update($id, ['status' => 'Cancelled']);
        $actor = (array) $request->param('_auth_user');
        SystemLogService::log('UPDATE', 'HR', "Cancelled leave request ID {$id} for employee {$row['employee_id']}.", $id, 'leave_request', ['employee_id' => $row['employee_id']], $actor ?: null);
        $this->success($response, null, 'Leave request cancelled.');
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
        $db   = $this->requestModel->db();
        $today = date('Y-m-d');
        $year  = (int)date('Y');

        $counts = $db->fetchOne("
            SELECT
              SUM(CASE WHEN status = 'Pending'  THEN 1 ELSE 0 END) AS pending,
              SUM(CASE WHEN status = 'Approved' THEN 1 ELSE 0 END) AS approved,
              SUM(CASE WHEN status = 'Rejected' THEN 1 ELSE 0 END) AS rejected,
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

        $this->success($response, [
            'pending'             => (int)($counts['pending']  ?? 0),
            'approved'            => (int)($counts['approved'] ?? 0),
            'rejected'            => (int)($counts['rejected'] ?? 0),
            'total'               => (int)($counts['total']    ?? 0),
            'on_leave_today'      => $onLeaveToday,
            'approved_this_month' => $approvedThisMonth,
            'by_type'             => $byType,
            'monthly_trend'       => $monthly,
        ], 'Leave stats fetched.');
    }

    // ──────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────

    /** Count business days (Mon–Fri) between two date strings inclusive. */
    private function calcBusinessDays(string $start, string $end): float
    {
        $s   = new \DateTime($start);
        $e   = new \DateTime($end);
        if ($s > $e) return 0;

        $days = 0;
        $cur  = clone $s;
        while ($cur <= $e) {
            $dow = (int)$cur->format('N'); // 1=Mon … 7=Sun
            if ($dow <= 5) $days++;
            $cur->modify('+1 day');
        }
        return (float)$days;
    }

    /** Add or subtract used_days from a leave balance, creating the row if absent. */
    private function adjustBalance(int $empId, int $typeId, float $days, int $sign): void
    {
        $year = (int)date('Y');
        $db   = $this->balanceModel->db();

        // Ensure a balance row exists (default total_days from leave_type)
        $type = $this->typeModel->find($typeId);
        $defaultDays = (float)($type['days_allowed'] ?? 0);

        $db->execute(
            "INSERT INTO leave_balances (employee_id, leave_type_id, year, total_days, used_days)
             VALUES (?, ?, ?, ?, 0)
             ON DUPLICATE KEY UPDATE id = id",
            [$empId, $typeId, $year, $defaultDays]
        );

        $used = max(0, $sign > 0 ? $days : -$days);
        $db->execute(
            "UPDATE leave_balances
             SET used_days = GREATEST(0, used_days + ?)
             WHERE employee_id = ? AND leave_type_id = ? AND year = ?",
            [$sign * $days, $empId, $typeId, $year]
        );
    }
}

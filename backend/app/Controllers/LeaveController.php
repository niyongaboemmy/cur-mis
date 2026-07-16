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
use App\Helpers\EmailTemplateHelper;
use App\Services\SystemLogService;
use App\Services\MailService;

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
            "SELECT
               lr.id,
               lr.employee_id,
               lr.user_id,
               COALESCE(CONCAT(e.employee_fname,' ',e.employee_lname), u.full_name, 'Unknown') AS employee_name,
               COALESCE(e.employee_post, '')     AS department,
               COALESCE(e.employee_position, '') AS position,
               u.email              AS requester_email,
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
             LEFT JOIN employees  e  ON e.employee_id = lr.employee_id
             LEFT JOIN users      u  ON u.id = lr.user_id
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
               lr.id, lr.employee_id, lr.user_id,
               COALESCE(CONCAT(e.employee_fname,' ',e.employee_lname), u.full_name, 'Unknown') AS employee_name,
               COALESCE(e.employee_post, '') AS department, COALESCE(e.employee_position, '') AS position,
               u.email AS requester_email,
               lr.leave_type_id,
               lt.name AS leave_type_name, lt.color AS leave_type_color, lt.is_paid,
               lr.start_date, lr.end_date, lr.days_requested,
               lr.reason, lr.status, lr.review_comment, lr.reviewed_at, lr.created_at
             FROM leave_requests lr
             LEFT JOIN employees e   ON e.employee_id = lr.employee_id
             LEFT JOIN users     u   ON u.id = lr.user_id
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

        $actor      = (array) $request->param('_auth_user');
        $reviewerId = (int)($actor['id'] ?? 0);

        if ($reviewerId > 0 && (int)($row['user_id'] ?? 0) === $reviewerId) {
            $this->error($response, 'You cannot approve your own leave request.', 403);
        }

        $body    = $request->body();
        $comment = trim((string)($body['comment'] ?? ''));

        $this->requestModel->update($id, [
            'status'         => 'Approved',
            'review_comment' => $comment,
            'reviewed_by'    => $reviewerId ?: null,
            'reviewed_at'    => date('Y-m-d H:i:s'),
        ]);

        // Update leave balance — add used days (employee-based requests only;
        // self-service user requests have no employee balance row).
        if (!empty($row['employee_id'])) {
            $this->adjustBalance(
                (int)$row['employee_id'],
                (int)$row['leave_type_id'],
                (float)$row['days_requested'],
                +1
            );
        }

        // Notify the requester by email.
        $this->notifyRequester($row, 'Approved', $comment);

        SystemLogService::log('APPROVE', 'HR', "Approved leave request ID {$id} ({$row['days_requested']} days).", $id, 'leave_request', ['employee_id' => $row['employee_id'], 'user_id' => $row['user_id'] ?? null, 'days' => $row['days_requested']], $actor ?: null);
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

        $actor      = (array) $request->param('_auth_user');
        $reviewerId = (int)($actor['id'] ?? 0);

        if ($reviewerId > 0 && (int)($row['user_id'] ?? 0) === $reviewerId) {
            $this->error($response, 'You cannot reject your own leave request.', 403);
        }

        $body    = $request->body();
        $comment = trim((string)($body['comment'] ?? ''));

        if ($comment === '') {
            $this->error($response, 'A rejection reason/comment is required.', 422);
        }

        $this->requestModel->update($id, [
            'status'         => 'Rejected',
            'review_comment' => $comment,
            'reviewed_by'    => $reviewerId ?: null,
            'reviewed_at'    => date('Y-m-d H:i:s'),
        ]);

        // Notify the requester by email.
        $this->notifyRequester($row, 'Rejected', $comment);

        SystemLogService::log('REJECT', 'HR', "Rejected leave request ID {$id}. Reason: {$comment}.", $id, 'leave_request', ['employee_id' => $row['employee_id'], 'user_id' => $row['user_id'] ?? null, 'comment' => $comment], $actor ?: null);
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

        if ($row['status'] === 'Approved' && !empty($row['employee_id'])) {
            // Reverse the balance deduction
            $this->adjustBalance(
                (int)$row['employee_id'],
                (int)$row['leave_type_id'],
                (float)$row['days_requested'],
                -1
            );
        }

        $this->requestModel->update($id, ['status' => 'Cancelled']);

        // Notify the requester by email.
        $this->notifyRequester($row, 'Cancelled');

        $actor = (array) $request->param('_auth_user');
        SystemLogService::log('UPDATE', 'HR', "Cancelled leave request ID {$id}.", $id, 'leave_request', ['employee_id' => $row['employee_id'], 'user_id' => $row['user_id'] ?? null], $actor ?: null);
        $this->success($response, null, 'Leave request cancelled.');
    }

    // ──────────────────────────────────────────────────────────
    // Leave Requests — self-service (any staff)
    // ──────────────────────────────────────────────────────────

    /**
     * GET /api/hr/leave/my-requests
     * The signed-in user's own leave requests.
     */
    public function myRequests(Request $request, Response $response): never
    {
        $actor  = (array) $request->param('_auth_user');
        $userId = (int)($actor['id'] ?? 0);
        if ($userId <= 0) {
            $this->error($response, 'Unable to identify the current user.', 401);
        }

        $rows = $this->requestModel->db()->fetchAll(
            "SELECT
               lr.id,
               lr.leave_type_id,
               lt.name  AS leave_type_name,
               lt.color AS leave_type_color,
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
             JOIN leave_types lt ON lt.id = lr.leave_type_id
             WHERE lr.user_id = ?
             ORDER BY lr.created_at DESC",
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
        $actor  = (array) $request->param('_auth_user');
        $userId = (int)($actor['id'] ?? 0);
        if ($userId <= 0) {
            $this->error($response, 'Unable to identify the current user.', 401);
        }

        $data   = $request->body();
        $errors = ValidationHelper::validate($data, [
            'leave_type_id' => ['required', 'numeric'],
            'start_date'    => ['required'],
            'end_date'      => ['required'],
        ]);
        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $typeId = (int)$data['leave_type_id'];
        if (!$this->typeModel->find($typeId)) {
            $this->error($response, 'Leave type not found.', 404);
        }

        $start = $data['start_date'];
        $end   = $data['end_date'];
        $days  = $this->calcBusinessDays($start, $end);
        if ($days <= 0) {
            $this->error($response, 'End date must be on or after start date and include at least one working day.', 422);
        }

        // Block overlapping pending/approved requests for the same user.
        $overlap = $this->requestModel->db()->fetchOne(
            "SELECT COUNT(*) AS n FROM leave_requests
             WHERE user_id = ?
               AND status IN ('Pending','Approved')
               AND start_date <= ? AND end_date >= ?",
            [$userId, $end, $start]
        );
        if ((int)($overlap['n'] ?? 0) > 0) {
            $this->error($response, 'You already have a pending or approved leave overlapping these dates.', 409);
        }

        $id = $this->requestModel->create([
            'user_id'        => $userId,
            'leave_type_id'  => $typeId,
            'start_date'     => $start,
            'end_date'       => $end,
            'days_requested' => $days,
            'reason'         => trim($data['reason'] ?? ''),
            'status'         => 'Pending',
        ]);

        SystemLogService::log('CREATE', 'HR', "Self-service leave request submitted ({$days} days, {$start} to {$end}).", (int)$id, 'leave_request', ['user_id' => $userId, 'days' => $days, 'start' => $start, 'end' => $end], $actor ?: null);

        $this->success($response, $this->requestModel->find($id), 'Leave request submitted.', 201);
    }

    /**
     * DELETE /api/hr/leave/my-requests/:id
     * Cancel your own pending request.
     */
    public function cancelOwn(Request $request, Response $response): never
    {
        $actor  = (array) $request->param('_auth_user');
        $userId = (int)($actor['id'] ?? 0);
        $id     = (int)$request->param('id');

        $row = $this->requestModel->find($id);
        if (!$row || (int)($row['user_id'] ?? 0) !== $userId) {
            $this->error($response, 'Leave request not found.', 404);
        }
        if ($row['status'] !== 'Pending') {
            $this->error($response, "Only pending requests can be cancelled. This request is '{$row['status']}'.", 409);
        }

        $this->requestModel->update($id, ['status' => 'Cancelled']);
        SystemLogService::log('UPDATE', 'HR', "Self-service leave request ID {$id} cancelled by requester.", $id, 'leave_request', ['user_id' => $userId], $actor ?: null);
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

    /**
     * Resolve the email recipient for a request row. Self-service requests are
     * linked to a login (users.id); legacy employee requests have no email on
     * record, so they cannot be notified.
     *
     * @return array{email:string,name:string}|null
     */
    private function resolveRecipient(array $row): ?array
    {
        if (!empty($row['user_id'])) {
            $u = $this->requestModel->db()->fetchOne(
                "SELECT email, full_name FROM users WHERE id = ? LIMIT 1",
                [(int)$row['user_id']]
            );
            if ($u && !empty($u['email'])) {
                return ['email' => $u['email'], 'name' => (string)($u['full_name'] ?? '')];
            }
        }
        return null;
    }

    /**
     * Email the requester when their leave request status changes.
     * Never throws — email failure must not roll back the status change.
     */
    private function notifyRequester(array $row, string $status, string $comment = ''): void
    {
        $recipient = $this->resolveRecipient($row);
        if (!$recipient) {
            return;
        }

        $type     = $this->typeModel->find((int)$row['leave_type_id']);
        $typeName = htmlspecialchars($type['name'] ?? 'Leave');
        $name     = htmlspecialchars($recipient['name'] !== '' ? $recipient['name'] : 'there');
        $days     = rtrim(rtrim(number_format((float)$row['days_requested'], 1), '0'), '.');

        try {
            $start = (new \DateTime($row['start_date']))->format('j M Y');
            $end   = (new \DateTime($row['end_date']))->format('j M Y');
        } catch (\Exception) {
            $start = (string)$row['start_date'];
            $end   = (string)$row['end_date'];
        }

        $color = match ($status) {
            'Approved'  => '#059669',
            'Rejected'  => '#dc2626',
            'Cancelled' => '#d97706',
            default     => '#1e40af',
        };

        $lead = match ($status) {
            'Approved'  => "Good news — your leave request has been <strong style=\"color:{$color}\">approved</strong>.",
            'Rejected'  => "Your leave request has been <strong style=\"color:{$color}\">rejected</strong>.",
            'Cancelled' => "Your leave request has been <strong style=\"color:{$color}\">cancelled</strong>.",
            default     => "Your leave request status is now <strong>{$status}</strong>.",
        };

        $commentHtml = '';
        if (trim($comment) !== '') {
            $label = $status === 'Rejected' ? 'Reason' : 'Note from reviewer';
            $commentHtml = "<p style='margin:14px 0 0 0;'><strong>{$label}:</strong> " . htmlspecialchars($comment) . '</p>';
        }

        $content = "
            Dear {$name},<br><br>
            {$lead}<br><br>
            <div style='background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:18px 20px;margin:18px 0;'>
                <p style='margin:0 0 6px 0;'><strong>Leave type:</strong> {$typeName}</p>
                <p style='margin:0 0 6px 0;'><strong>Dates:</strong> {$start} &rarr; {$end}</p>
                <p style='margin:0 0 6px 0;'><strong>Working days:</strong> {$days}</p>
                <p style='margin:0;'><strong>Status:</strong> <span style='color:{$color};font-weight:700;'>{$status}</span></p>
                {$commentHtml}
            </div>
            You can review your leave history any time from your staff portal.
        ";

        $title = "Leave Request {$status}";

        try {
            (new MailService())->send(
                ['email' => $recipient['email'], 'name' => $recipient['name']],
                $title,
                EmailTemplateHelper::wrap($title, $content)
            );
        } catch (\Throwable $e) {
            error_log('Leave notification email failed: ' . $e->getMessage());
        }
    }

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

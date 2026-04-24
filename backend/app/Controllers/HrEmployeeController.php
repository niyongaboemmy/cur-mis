<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\HrEmployeeModel;
use App\Helpers\ValidationHelper;

class HrEmployeeController extends BaseController
{
    private HrEmployeeModel $employeeModel;

    public function __construct()
    {
        $this->employeeModel = new HrEmployeeModel();
    }

    /**
     * List all HR employees with pagination and search.
     */
    public function index(Request $request, Response $response): never
    {
        $page    = (int)($request->query('page') ?? 1);
        $perPage = (int)($request->query('per_page') ?? 15);
        $search  = $request->query('search') ?? $request->query('q') ?? '';

        // Sorting
        $sortBy  = $request->query('sort_by') ?? 'id';
        $sortDir = strtoupper((string)($request->query('sort_dir') ?? 'DESC'));
        if (!in_array($sortDir, ['ASC', 'DESC'], true)) {
            $sortDir = 'DESC';
        }

        // Validate sort column to prevent SQL injection
        $allowedSort = [
            'id', 'emp_code', 'full_name', 'gender', 'department',
            'position', 'contract_type', 'start_date', 'salary', 'email', 'status'
        ];
        if (!in_array($sortBy, $allowedSort, true)) {
            $sortBy = 'id';
        }

        $clauses  = [];
        $bindings = [];

        if ($search !== '') {
            $clauses[]  = "(full_name LIKE ? OR emp_code LIKE ? OR email LIKE ? OR position LIKE ? OR department LIKE ?)";
            $bindings[] = "%$search%";
            $bindings[] = "%$search%";
            $bindings[] = "%$search%";
            $bindings[] = "%$search%";
            $bindings[] = "%$search%";
        }

        $filterable = ['status', 'gender', 'department', 'position', 'contract_type'];
        foreach ($filterable as $col) {
            $val = $request->query($col);
            if ($val !== null && $val !== '') {
                $lower = strtolower((string)$val);
                if ($col === 'gender' && $lower === 'unknown') {
                    $clauses[] = "(gender IS NULL OR gender = '' OR gender NOT IN ('M','F'))";
                } elseif (($col === 'department' || $col === 'position') && $lower === 'unknown') {
                    $clauses[] = "(`$col` IS NULL OR `$col` = '')";
                } else {
                    $clauses[]  = "`$col` = ?";
                    $bindings[] = $val;
                }
            }
        }

        // Convenience boolean flag for new hires (last 30 days)
        if ($request->query('joined_last_30d')) {
            $clauses[] = "start_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)";
        }

        $where = $clauses ? implode(' AND ', $clauses) : '';

        $paginated = $this->employeeModel->paginate($page, $perPage, $where, $bindings, $sortBy, $sortDir);

        $this->success($response, $paginated, 'HR Employees fetched successfully.');
    }

    /**
     * Get a single employee.
     */
    public function show(Request $request, Response $response): never
    {
        $id       = (int)$request->param('id');
        $employee = $this->employeeModel->find($id);

        if (!$employee) {
            $this->error($response, 'Employee not found', 404);
        }

        $this->success($response, $employee, 'Employee details fetched.');
    }

    /**
     * Create a new HR employee.
     */
    public function create(Request $request, Response $response): never
    {
        $data = $request->body();

        $errors = ValidationHelper::validate($data, [
            'emp_code'      => ['required'],
            'full_name'     => ['required', 'min:3'],
            'gender'        => ['required'],
            'department'    => ['required'],
            'position'      => ['required'],
            'contract_type' => ['required'],
            'start_date'    => ['required'],
            'salary'        => ['required', 'numeric'],
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed', 422, $errors);
        }

        if ($this->employeeModel->exists('emp_code', $data['emp_code'])) {
            $this->error($response, 'Employee code already in use.', 409);
        }

        $id = $this->employeeModel->create([
            'emp_code'      => trim($data['emp_code']),
            'staff_id'      => isset($data['staff_id']) ? (int)$data['staff_id'] : null,
            'full_name'     => trim($data['full_name']),
            'gender'        => $data['gender'],
            'department'    => trim($data['department']),
            'position'      => trim($data['position']),
            'contract_type' => $data['contract_type'],
            'start_date'    => $data['start_date'],
            'end_date'      => $data['end_date'] ?? null,
            'salary'        => (float)$data['salary'],
            'phone'         => $data['phone'] ?? null,
            'email'         => $data['email'] ?? null,
            'status'        => $data['status'] ?? 'Active',
        ]);

        $this->success($response, ['id' => $id], 'Employee created successfully.', 201);
    }

    /**
     * Update an HR employee.
     */
    public function update(Request $request, Response $response): never
    {
        $id       = (int)$request->param('id');
        $data     = $request->body();
        $employee = $this->employeeModel->find($id);

        if (!$employee) {
            $this->error($response, 'Employee not found', 404);
        }

        $errors = ValidationHelper::validate($data, [
            'emp_code'      => ['required'],
            'full_name'     => ['required', 'min:3'],
            'gender'        => ['required'],
            'department'    => ['required'],
            'position'      => ['required'],
            'contract_type' => ['required'],
            'start_date'    => ['required'],
            'salary'        => ['required', 'numeric'],
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed', 422, $errors);
        }

        if ($this->employeeModel->exists('emp_code', $data['emp_code'], $id)) {
            $this->error($response, 'Employee code already in use.', 409);
        }

        $this->employeeModel->update($id, [
            'emp_code'      => trim($data['emp_code']),
            'staff_id'      => isset($data['staff_id']) ? (int)$data['staff_id'] : null,
            'full_name'     => trim($data['full_name']),
            'gender'        => $data['gender'],
            'department'    => trim($data['department']),
            'position'      => trim($data['position']),
            'contract_type' => $data['contract_type'],
            'start_date'    => $data['start_date'],
            'end_date'      => $data['end_date'] ?? null,
            'salary'        => (float)$data['salary'],
            'phone'         => $data['phone'] ?? null,
            'email'         => $data['email'] ?? null,
            'status'        => $data['status'] ?? $employee['status'],
        ]);

        $this->success($response, null, 'Employee updated successfully.');
    }

    /**
     * Delete an HR employee.
     */
    public function delete(Request $request, Response $response): never
    {
        $id       = (int)$request->param('id');
        $employee = $this->employeeModel->find($id);

        if (!$employee) {
            $this->error($response, 'Employee not found', 404);
        }

        $this->employeeModel->delete($id);
        $this->success($response, null, 'Employee deleted successfully.');
    }

    /**
     * Aggregated overview metrics for the HR Management dashboard.
     * One round-trip, one SQL statement — no row-by-row loops.
     */
    public function stats(Request $request, Response $response): never
    {
        $db = $this->employeeModel->db();

        $row = $db->fetchOne("
            SELECT
              COUNT(*)                                                        AS `total`,
              SUM(CASE WHEN status = 'Active'     THEN 1 ELSE 0 END)           AS `active`,
              SUM(CASE WHEN status = 'Inactive'   THEN 1 ELSE 0 END)           AS `inactive`,
              SUM(CASE WHEN status = 'Terminated' THEN 1 ELSE 0 END)           AS `terminated`,
              SUM(CASE WHEN gender = 'M'          THEN 1 ELSE 0 END)           AS `male`,
              SUM(CASE WHEN gender = 'F'          THEN 1 ELSE 0 END)           AS `female`,
              SUM(CASE WHEN contract_type = 'Permanent' THEN 1 ELSE 0 END)     AS `permanent`,
              SUM(CASE WHEN contract_type = 'Temporal'  THEN 1 ELSE 0 END)     AS `temporal`,
              SUM(CASE WHEN contract_type = 'Part-time' THEN 1 ELSE 0 END)     AS `part_time`,
              SUM(CASE WHEN start_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS `joined_last_30d`,
              COUNT(DISTINCT department) AS `departments`,

              -- ─── Active-only slices ───
              SUM(CASE WHEN status = 'Active' AND gender = 'M' THEN 1 ELSE 0 END) AS active_male,
              SUM(CASE WHEN status = 'Active' AND gender = 'F' THEN 1 ELSE 0 END) AS active_female,
              SUM(CASE WHEN status = 'Active' AND (gender IS NULL OR gender = '' OR gender NOT IN ('M','F')) THEN 1 ELSE 0 END) AS active_unknown_gender,
              SUM(CASE WHEN status = 'Active' AND contract_type = 'Permanent' THEN 1 ELSE 0 END) AS active_permanent,
              SUM(CASE WHEN status = 'Active' AND contract_type = 'Temporal'  THEN 1 ELSE 0 END) AS active_temporal,
              SUM(CASE WHEN status = 'Active' AND contract_type = 'Part-time' THEN 1 ELSE 0 END) AS active_part_time,
              SUM(CASE WHEN status = 'Active' AND start_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS active_joined_last_30d,
              COUNT(DISTINCT CASE WHEN status = 'Active' AND department <> '' THEN department END) AS active_departments,
              COUNT(DISTINCT CASE WHEN status = 'Active' AND position   <> '' THEN position   END) AS active_positions
            FROM hr_employees
        ") ?: [];

        // Staff currently on leave — Approved leaves whose window contains today,
        // restricted to active staff. Gracefully returns 0 if the leaves table
        // isn't present in this environment.
        $onLeaveToday = 0;
        try {
            $lv = $db->fetchOne("
                SELECT COUNT(DISTINCT l.emp_id) AS n
                FROM hr_leaves l
                JOIN hr_employees e ON e.id = l.emp_id
                WHERE l.status = 'Approved'
                  AND e.status = 'Active'
                  AND CURDATE() BETWEEN l.start_date AND l.end_date
            ");
            $onLeaveToday = (int)($lv['n'] ?? 0);
        } catch (\Throwable $_) {
            $onLeaveToday = 0;
        }

        // Active-only breakdowns (match the Students dashboard pattern)
        $byDept = $db->fetchAll("
            SELECT department AS value, department AS label, COUNT(*) AS total
            FROM hr_employees
            WHERE status = 'Active' AND department IS NOT NULL AND department <> ''
            GROUP BY department
            ORDER BY total DESC
            LIMIT 12
        ");

        $byPosition = $db->fetchAll("
            SELECT position AS value, position AS label, COUNT(*) AS total
            FROM hr_employees
            WHERE status = 'Active' AND position IS NOT NULL AND position <> ''
            GROUP BY position
            ORDER BY total DESC
            LIMIT 12
        ");

        $byContract = $db->fetchAll("
            SELECT contract_type AS value, contract_type AS label, COUNT(*) AS total
            FROM hr_employees
            WHERE status = 'Active' AND contract_type IS NOT NULL AND contract_type <> ''
            GROUP BY contract_type
            ORDER BY total DESC
        ");

        // Distinct filter values for the "All staff" filter dropdowns.
        $departments = $db->fetchAll("SELECT DISTINCT department AS v FROM hr_employees WHERE department IS NOT NULL AND department <> '' ORDER BY department ASC");
        $positions   = $db->fetchAll("SELECT DISTINCT position   AS v FROM hr_employees WHERE position   IS NOT NULL AND position   <> '' ORDER BY position   ASC");

        $asPairs = function (array $rows): array {
            $out = [];
            foreach ($rows as $r) {
                $v = (string)($r['v'] ?? '');
                if ($v === '') continue;
                $out[] = ['value' => $v, 'label' => $v];
            }
            return $out;
        };
        $wrap = fn(array $vals) => array_map(fn($v) => ['value' => $v, 'label' => $v], $vals);

        $this->success($response, [
            'total'            => (int)($row['total']           ?? 0),
            'active'           => (int)($row['active']          ?? 0),
            'inactive'         => (int)($row['inactive']        ?? 0),
            'terminated'       => (int)($row['terminated']      ?? 0),
            'male'             => (int)($row['male']            ?? 0),
            'female'           => (int)($row['female']          ?? 0),
            'permanent'        => (int)($row['permanent']       ?? 0),
            'temporal'         => (int)($row['temporal']        ?? 0),
            'part_time'        => (int)($row['part_time']       ?? 0),
            'joined_last_30d'  => (int)($row['joined_last_30d'] ?? 0),
            'departments'      => (int)($row['departments']     ?? 0),

            // Active-only aggregates
            'active_male'            => (int)($row['active_male']            ?? 0),
            'active_female'          => (int)($row['active_female']          ?? 0),
            'active_unknown_gender'  => (int)($row['active_unknown_gender']  ?? 0),
            'active_permanent'       => (int)($row['active_permanent']       ?? 0),
            'active_temporal'        => (int)($row['active_temporal']        ?? 0),
            'active_part_time'       => (int)($row['active_part_time']       ?? 0),
            'active_joined_last_30d' => (int)($row['active_joined_last_30d'] ?? 0),
            'active_departments'     => (int)($row['active_departments']     ?? 0),
            'active_positions'       => (int)($row['active_positions']       ?? 0),
            'active_on_leave_today'  => $onLeaveToday,

            'by_department'    => $byDept,
            'active_breakdown' => [
                'by_department' => $byDept,
                'by_position'   => $byPosition,
                'by_contract'   => $byContract,
            ],
            'facets'           => [
                'department'    => $asPairs($departments),
                'position'      => $asPairs($positions),
                'contract_type' => $wrap(['Permanent', 'Temporal', 'Part-time']),
                'status'        => $wrap(['Active', 'Inactive', 'Terminated']),
                'gender'        => [
                    ['value' => 'M', 'label' => 'Male'],
                    ['value' => 'F', 'label' => 'Female'],
                ],
            ],
        ], 'HR stats fetched.');
    }

    /**
     * Toggle employee status between Active and Inactive.
     */
    public function toggleStatus(Request $request, Response $response): never
    {
        $id       = (int)$request->param('id');
        $employee = $this->employeeModel->find($id);

        if (!$employee) {
            $this->error($response, 'Employee not found', 404);
        }

        $newStatus = ($employee['status'] === 'Active') ? 'Inactive' : 'Active';
        $this->employeeModel->update($id, ['status' => $newStatus]);

        $this->success($response, ['status' => $newStatus], 'Employee status updated.');
    }
}

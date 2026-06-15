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

    /* ── helpers ──────────────────────────────────────────────────────── */

    /** SELECT clause that maps employees columns → frontend-expected names */
    private function selectClause(): string
    {
        return "
            e.employee_id                                    AS id,
            e.employee_idcard                                AS emp_code,
            CONCAT(e.employee_fname, ' ', e.employee_lname)  AS full_name,
            e.employee_fname                                 AS first_name,
            e.employee_lname                                 AS last_name,
            e.employee_gender                                AS gender,
            e.employee_post                                  AS department,
            e.employee_position                              AS position,
            e.employee_status                                AS contract_type,
            e.account_status                                 AS status,
            e.employee_phone                                 AS phone,
            e.employee_reg_date                              AS start_date,
            e.salary,
            e.employee_bank                                  AS bank,
            e.employee_account                               AS bank_account,
            e.employee_address                               AS address,
            e.faculty
        ";
    }

    /**
     * GET /api/employees
     * Paginated list with search + account_status filter.
     */
    public function index(Request $request, Response $response): never
    {
        $page    = max(1, (int)($request->query('page') ?? 1));
        $perPage = min(100, max(1, (int)($request->query('per_page') ?? 15)));
        $search  = trim((string)($request->query('search') ?? $request->query('q') ?? ''));

        // The directory is the union of the HR `employees` table and every
        // non-student USER account (so staff/admin/finance/etc. users show up
        // here too, not only people in the legacy employees table). User-sourced
        // rows are tagged `source='user'` and are read-only in the UI. Users
        // already represented as an employee (matched by email) are not
        // duplicated.
        $union = "
            SELECT
              CAST(e.employee_id AS CHAR)                      AS id,
              e.employee_idcard                                AS emp_code,
              CONCAT(e.employee_fname, ' ', e.employee_lname)  AS full_name,
              e.employee_fname                                 AS first_name,
              e.employee_lname                                 AS last_name,
              e.employee_gender                                AS gender,
              e.employee_post                                  AS department,
              e.employee_position                              AS position,
              e.employee_status                                AS contract_type,
              e.account_status                                 AS status,
              e.employee_phone                                 AS phone,
              e.employee_username                              AS email,
              e.employee_reg_date                              AS start_date,
              e.salary                                         AS salary,
              e.employee_bank                                  AS bank,
              e.employee_account                               AS bank_account,
              e.employee_address                               AS address,
              e.faculty                                        AS faculty,
              'employee'                                       AS source
            FROM employees e
            UNION ALL
            SELECT
              CONCAT('user-', u.id)                            AS id,
              u.username                                       AS emp_code,
              u.full_name                                      AS full_name,
              NULL                                             AS first_name,
              NULL                                             AS last_name,
              NULL                                             AS gender,
              r.name                                           AS department,
              r.name                                           AS position,
              'User account'                                   AS contract_type,
              CASE WHEN u.is_active = 1 THEN 'Active' ELSE 'Inactive' END AS status,
              u.phone                                          AS phone,
              u.email                                          AS email,
              NULL                                             AS start_date,
              NULL                                             AS salary,
              NULL                                             AS bank,
              NULL                                             AS bank_account,
              NULL                                             AS address,
              NULL                                             AS faculty,
              'user'                                           AS source
            FROM users u
            JOIN roles r ON r.id = u.role_id
            WHERE r.name NOT IN ('student','applicant')
              -- Not already linked to an employee record (created-together), and
              -- not matching an employee by email (legacy rows).
              AND u.id NOT IN (SELECT user_id FROM employees WHERE user_id IS NOT NULL)
              AND (u.email IS NULL OR u.email = '' OR u.email NOT IN (
                    SELECT employee_username FROM employees WHERE employee_username IS NOT NULL AND employee_username <> ''
                  ))
        ";

        $clauses  = [];
        $bindings = [];

        if ($search !== '') {
            $clauses[]  = "(t.full_name LIKE ? OR t.emp_code LIKE ? OR t.position LIKE ? OR t.department LIKE ? OR t.phone LIKE ? OR t.email LIKE ?)";
            $bindings   = array_merge($bindings, array_fill(0, 6, "%$search%"));
        }

        // account_status filter — 'Terminated' catches Terminated + NULL + any unknown value
        $statusVal = $request->query('status') ?? $request->query('account_status');
        if ($statusVal === 'Terminated') {
            $clauses[] = "(t.status IS NULL OR t.status NOT IN ('Active','Inactive'))";
        } elseif ($statusVal !== null && $statusVal !== '') {
            $clauses[]  = "t.status = ?";
            $bindings[] = $statusVal;
        }

        // gender filter — accepts M/Male and F/Female interchangeably; 'unknown' matches NULL/empty
        $genderVal = $request->query('gender');
        if ($genderVal !== null && $genderVal !== '') {
            if ($genderVal === 'unknown') {
                $clauses[] = "(t.gender IS NULL OR t.gender = '' OR t.gender NOT IN ('Male','M','Female','F'))";
            } elseif (in_array($genderVal, ['M', 'Male'], true)) {
                $clauses[] = "t.gender IN ('M','Male')";
            } elseif (in_array($genderVal, ['F', 'Female'], true)) {
                $clauses[] = "t.gender IN ('F','Female')";
            }
        }

        $where  = $clauses ? 'WHERE ' . implode(' AND ', $clauses) : '';
        $offset = ($page - 1) * $perPage;
        $db     = $this->employeeModel->db();

        $countRow = $db->fetchOne("SELECT COUNT(*) AS n FROM ({$union}) t $where", $bindings);
        $total    = (int)($countRow['n'] ?? 0);

        $rows = $db->fetchAll(
            "SELECT t.* FROM ({$union}) t
             $where
             ORDER BY t.full_name ASC
             LIMIT ? OFFSET ?",
            array_merge($bindings, [$perPage, $offset])
        );

        $this->success($response, [
            'data'         => array_values($rows),
            'total'        => $total,
            'per_page'     => $perPage,
            'current_page' => $page,
            'last_page'    => (int)ceil($total / max(1, $perPage)),
        ], 'Employees fetched successfully.');
    }

    /**
     * GET /api/employees/:id
     */
    public function show(Request $request, Response $response): never
    {
        $id  = (int)$request->param('id');
        $db  = $this->employeeModel->db();
        $row = $db->fetchOne(
            "SELECT {$this->selectClause()} FROM employees e WHERE e.employee_id = ? LIMIT 1",
            [$id]
        );

        if (!$row) {
            $this->error($response, 'Employee not found', 404);
        }

        $this->success($response, $row, 'Employee details fetched.');
    }

    /**
     * POST /api/employees
     */
    public function create(Request $request, Response $response): never
    {
        $data   = $request->body();
        $errors = ValidationHelper::validate($data, [
            'first_name' => ['required'],
            'last_name'  => ['required'],
            'position'   => ['required'],
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed', 422, $errors);
        }

        $id = $this->employeeModel->create([
            'employee_fname'    => trim($data['first_name']   ?? ''),
            'employee_lname'    => trim($data['last_name']    ?? ''),
            'employee_gender'   => $data['gender']            ?? '',
            'employee_post'     => trim($data['department']   ?? ''),
            'employee_position' => trim($data['position']     ?? ''),
            'employee_status'   => trim($data['contract_type'] ?? ''),
            'account_status'    => $data['status']            ?? 'Active',
            'employee_phone'    => $data['phone']             ?? '',
            'employee_idcard'   => trim($data['emp_code']     ?? ''),
            'employee_reg_date' => $data['start_date']        ?? date('Y-m-d'),
            'salary'            => isset($data['salary']) && $data['salary'] !== '' ? (float)$data['salary'] : null,
            'employee_bank'     => $data['bank']              ?? '',
            'employee_account'  => $data['bank_account']      ?? '',
            'employee_address'  => $data['address']           ?? '',
            'employee_age'      => $data['age']               ?? '',
            'employee_username' => $data['username']          ?? '',
            'employee_password' => '',
            'employee_author'   => '',
            'employee_photo'    => '',
            'employe_qr'        => '',
            'faculty'           => (int)($data['faculty']    ?? 0),
            'school_id'         => (int)($data['school_id']  ?? 0),
        ]);

        $this->success($response, ['id' => $id], 'Employee created successfully.', 201);
    }

    /**
     * PUT /api/employees/:id
     * Supports full and partial updates — missing fields keep existing DB values.
     */
    public function update(Request $request, Response $response): never
    {
        $id  = (int)$request->param('id');
        $row = $this->employeeModel->find($id);

        if (!$row) {
            $this->error($response, 'Employee not found', 404);
        }

        $data = $request->body();

        // Only reject a field that is explicitly provided but empty.
        $errors = [];
        foreach (['first_name', 'last_name', 'position'] as $field) {
            if (array_key_exists($field, $data) && trim((string)($data[$field] ?? '')) === '') {
                $errors[$field] = ["The {$field} field cannot be empty."];
            }
        }
        if (!empty($errors)) {
            $this->error($response, 'Validation failed', 422, $errors);
        }

        $this->employeeModel->update($id, [
            'employee_fname'    => trim($data['first_name']    ?? $row['employee_fname']),
            'employee_lname'    => trim($data['last_name']     ?? $row['employee_lname']),
            'employee_gender'   => $data['gender']             ?? $row['employee_gender'],
            'employee_post'     => trim($data['department']    ?? $row['employee_post']),
            'employee_position' => trim($data['position']      ?? $row['employee_position']),
            'employee_status'   => trim($data['contract_type'] ?? $row['employee_status']),
            'account_status'    => $data['status']             ?? $row['account_status'],
            'employee_phone'    => $data['phone']              ?? $row['employee_phone'],
            'employee_idcard'   => trim($data['emp_code']      ?? $row['employee_idcard']),
            'employee_reg_date' => $data['start_date']         ?? $row['employee_reg_date'],
            'salary'            => isset($data['salary']) && $data['salary'] !== '' ? (float)$data['salary'] : ($row['salary'] ?? null),
            'employee_bank'     => $data['bank']               ?? $row['employee_bank'],
            'employee_account'  => $data['bank_account']       ?? $row['employee_account'],
            'employee_address'  => $data['address']            ?? $row['employee_address'],
        ]);

        $this->success($response, null, 'Employee updated successfully.');
    }

    /**
     * DELETE /api/employees/:id
     */
    public function delete(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');

        if (!$this->employeeModel->find($id)) {
            $this->error($response, 'Employee not found', 404);
        }

        $this->employeeModel->delete($id);
        $this->success($response, null, 'Employee deleted successfully.');
    }

    /**
     * GET /api/employees/stats
     */
    public function stats(Request $request, Response $response): never
    {
        $db = $this->employeeModel->db();

        $row = $db->fetchOne("
            SELECT
              COUNT(*)                                                                        AS `total`,
              SUM(CASE WHEN account_status = 'Active'   THEN 1 ELSE 0 END)                  AS `active`,
              SUM(CASE WHEN account_status = 'Inactive' THEN 1 ELSE 0 END)                  AS `inactive`,
              SUM(CASE WHEN account_status IS NULL OR account_status NOT IN ('Active','Inactive') THEN 1 ELSE 0 END) AS `terminated`,
              SUM(CASE WHEN employee_gender IN ('Male','M')   THEN 1 ELSE 0 END)             AS `male`,
              SUM(CASE WHEN employee_gender IN ('Female','F') THEN 1 ELSE 0 END)             AS `female`,
              SUM(CASE WHEN account_status = 'Active' AND employee_gender IN ('Male','M')   THEN 1 ELSE 0 END) AS active_male,
              SUM(CASE WHEN account_status = 'Active' AND employee_gender IN ('Female','F') THEN 1 ELSE 0 END) AS active_female,
              COUNT(DISTINCT employee_post) AS `departments`,
              COUNT(DISTINCT employee_position) AS `active_positions`
            FROM employees
        ") ?: [];

        $byDept = $db->fetchAll("
            SELECT employee_post AS value, employee_post AS label, COUNT(*) AS total
            FROM employees
            WHERE account_status = 'Active' AND employee_post IS NOT NULL AND employee_post <> ''
            GROUP BY employee_post ORDER BY total DESC LIMIT 12
        ");

        $byPosition = $db->fetchAll("
            SELECT employee_position AS value, employee_position AS label, COUNT(*) AS total
            FROM employees
            WHERE account_status = 'Active' AND employee_position IS NOT NULL AND employee_position <> ''
            GROUP BY employee_position ORDER BY total DESC LIMIT 12
        ");

        $deptFacet = $db->fetchAll("SELECT DISTINCT employee_post AS v FROM employees WHERE employee_post IS NOT NULL AND employee_post <> '' ORDER BY employee_post ASC");
        $posFacet  = $db->fetchAll("SELECT DISTINCT employee_position AS v FROM employees WHERE employee_position IS NOT NULL AND employee_position <> '' ORDER BY employee_position ASC");

        $asPairs = fn(array $rows) => array_values(array_filter(array_map(
            fn($r) => ($v = (string)($r['v'] ?? '')) !== '' ? ['value' => $v, 'label' => $v] : null,
            $rows
        )));

        $this->success($response, [
            'total'                  => (int)($row['total']           ?? 0),
            'active'                 => (int)($row['active']          ?? 0),
            'inactive'               => (int)($row['inactive']        ?? 0),
            'terminated'             => (int)($row['terminated']      ?? 0),
            'male'                   => (int)($row['male']            ?? 0),
            'female'                 => (int)($row['female']          ?? 0),
            'permanent'              => 0,
            'temporal'               => 0,
            'part_time'              => 0,
            'joined_last_30d'        => 0,
            'departments'            => (int)($row['departments']     ?? 0),
            'active_male'            => (int)($row['active_male']     ?? 0),
            'active_female'          => (int)($row['active_female']   ?? 0),
            'active_unknown_gender'  => max(0, (int)($row['active'] ?? 0) - (int)($row['active_male'] ?? 0) - (int)($row['active_female'] ?? 0)),
            'active_permanent'       => 0,
            'active_temporal'        => 0,
            'active_part_time'       => 0,
            'active_joined_last_30d' => 0,
            'active_departments'     => (int)($row['departments']     ?? 0),
            'active_positions'       => (int)($row['active_positions'] ?? 0),
            'active_on_leave_today'  => 0,
            'by_department'          => $byDept,
            'active_breakdown'       => [
                'by_department' => $byDept,
                'by_position'   => $byPosition,
                'by_contract'   => [],
            ],
            'facets' => [
                'department'    => $asPairs($deptFacet),
                'position'      => $asPairs($posFacet),
                'contract_type' => [],
                'status'        => [
                    ['value' => 'Active',   'label' => 'Active'],
                    ['value' => 'Inactive', 'label' => 'Inactive'],
                ],
                'gender' => [
                    ['value' => 'Male',   'label' => 'Male'],
                    ['value' => 'Female', 'label' => 'Female'],
                ],
            ],
        ], 'HR stats fetched.');
    }

    /**
     * PATCH /api/employees/:id/toggle-status
     * Toggles account_status between Active and Inactive.
     */
    public function toggleStatus(Request $request, Response $response): never
    {
        $id  = (int)$request->param('id');
        $row = $this->employeeModel->find($id);

        if (!$row) {
            $this->error($response, 'Employee not found', 404);
        }

        $newStatus = ($row['account_status'] === 'Active') ? 'Inactive' : 'Active';
        $this->employeeModel->update($id, ['account_status' => $newStatus]);

        $this->success($response, ['status' => $newStatus], 'Employee status updated.');
    }
}

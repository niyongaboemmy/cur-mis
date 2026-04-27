<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\HrPayrollModel;
use App\Models\HrEmployeeModel;
use App\Helpers\ValidationHelper;

class HrPayrollController extends BaseController
{
    private HrPayrollModel  $payrollModel;
    private HrEmployeeModel $employeeModel;

    public function __construct()
    {
        $this->payrollModel  = new HrPayrollModel();
        $this->employeeModel = new HrEmployeeModel();
    }

    /**
     * GET /api/hr/payroll
     * Paginated employee list, joined with payroll data for the requested period.
     * Mirrors the /api/employees endpoint filtering pattern.
     */
    public function index(Request $request, Response $response): never
    {
        $page    = max(1, (int)($request->query('page')     ?? 1));
        $perPage = min(100, max(1, (int)($request->query('per_page') ?? 20)));
        $search  = trim((string)($request->query('q') ?? ''));
        $year    = (int)($request->query('period_year')  ?? date('Y'));
        $month   = (int)($request->query('period_month') ?? date('n'));

        // Build WHERE clauses (all scoped to e.* alias)
        $clauses  = [];
        $bindings = [];

        if ($search !== '') {
            $clauses[]  = "(CONCAT(e.employee_fname,' ',e.employee_lname) LIKE ? OR e.employee_idcard LIKE ? OR e.employee_position LIKE ? OR e.employee_post LIKE ?)";
            $bindings[] = "%$search%";
            $bindings[] = "%$search%";
            $bindings[] = "%$search%";
            $bindings[] = "%$search%";
        }

        // account_status filter (Active / Inactive / null=All)
        $statusVal = $request->query('status');
        if ($statusVal !== null && $statusVal !== '') {
            $clauses[]  = "e.account_status = ?";
            $bindings[] = $statusVal;
        }

        foreach (['employee_gender'] as $col) {
            $val = $request->query($col);
            if ($val !== null && $val !== '') {
                $clauses[]  = "e.`$col` = ?";
                $bindings[] = $val;
            }
        }

        // Convenience filter: recent hires
        if ($request->query('joined_last_30d')) {
            $clauses[] = "e.start_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)";
        }

        $where  = $clauses ? 'WHERE ' . implode(' AND ', $clauses) : '';
        $offset = ($page - 1) * $perPage;
        $db     = $this->payrollModel->db();

        // Count
        $countRow = $db->fetchOne(
            "SELECT COUNT(*) AS n FROM employees e $where",
            $bindings
        );
        $total = (int)($countRow['n'] ?? 0);

        // Paginated employee list LEFT JOIN payroll for the requested period.
        // Column aliases map employees table names → frontend-expected names.
        $rows = $db->fetchAll(
            "SELECT
               e.employee_id                                   AS id,
               e.employee_idcard                               AS emp_code,
               CONCAT(e.employee_fname, ' ', e.employee_lname) AS full_name,
               e.employee_gender                               AS gender,
               e.employee_post                                 AS department,
               e.employee_position                             AS position,
               e.employee_phone                                AS phone,
               e.employee_status                               AS contract_type,
               e.account_status                                AS status,
               e.employee_reg_date                             AS start_date,
               NULL                                            AS end_date,
               e.salary                                        AS salary,
               NULL                                            AS email,
               e.employee_bank                                 AS bank,
               e.employee_account                              AS bank_account,

               p.id                               AS payroll_id,
               p.pay_month,
               p.period_year,
               p.period_month,
               p.basic_salary,
               p.housing_allowance,
               p.transport_allowance,
               p.other_allowances,
               p.gross                            AS gross_salary,
               p.tax                              AS paye,
               (p.pension + p.rama + p.maternity) AS rssb,
               p.cbhi,
               p.net                              AS net_salary,
               p.status                           AS payroll_status
             FROM employees e
             LEFT JOIN hr_payroll p
               ON p.emp_id = e.employee_id
               AND p.period_year  = ?
               AND p.period_month = ?
             $where
             ORDER BY e.employee_fname ASC, e.employee_lname ASC
             LIMIT ? OFFSET ?",
            array_merge([$year, $month], $bindings, [$perPage, $offset])
        );

        // Facets
        $positions = $db->fetchAll("SELECT DISTINCT employee_position AS v FROM employees WHERE employee_position IS NOT NULL AND employee_position <> '' ORDER BY employee_position ASC");
        $posts     = $db->fetchAll("SELECT DISTINCT employee_post     AS v FROM employees WHERE employee_post     IS NOT NULL AND employee_post     <> '' ORDER BY employee_post     ASC");

        $asPairs = static function (array $rows): array {
            $out = [];
            foreach ($rows as $r) {
                $v = (string)($r['v'] ?? '');
                if ($v !== '') $out[] = ['value' => $v, 'label' => $v];
            }
            return $out;
        };

        $this->success($response, [
            'data'         => array_values($rows),
            'total'        => $total,
            'per_page'     => $perPage,
            'current_page' => $page,
            'last_page'    => (int)ceil($total / max(1, $perPage)),
            'period_year'  => $year,
            'period_month' => $month,
            'facets'       => [
                'position'      => $asPairs($positions),
                'department'    => $asPairs($posts),
            ],
        ], 'Payroll list fetched.');
    }

    /**
     * GET /api/hr/payroll/:emp_id/slips
     * All payslips for an employee with optional date-range filter.
     */
    public function slips(Request $request, Response $response): never
    {
        $empId = (int)$request->param('emp_id');
        $db    = $this->payrollModel->db();

        $employee = $db->fetchOne(
            "SELECT
               e.employee_id                                   AS id,
               e.employee_idcard                               AS emp_code,
               CONCAT(e.employee_fname, ' ', e.employee_lname) AS full_name,
               e.employee_gender                               AS gender,
               e.employee_post                                 AS department,
               e.employee_position                             AS position,
               e.employee_status                               AS contract_type,
               e.account_status                                AS status,
               e.employee_reg_date                             AS start_date,
               e.employee_phone                                AS phone,
               NULL                                            AS email,
               e.salary                                        AS salary
             FROM employees e WHERE e.employee_id = ? LIMIT 1",
            [$empId]
        );

        if (!$employee) {
            $this->error($response, 'Employee not found.', 404);
        }

        $fromYear  = $request->query('from_year')  !== null ? (int)$request->query('from_year')  : null;
        $fromMonth = $request->query('from_month') !== null ? (int)$request->query('from_month') : null;
        $toYear    = $request->query('to_year')    !== null ? (int)$request->query('to_year')    : null;
        $toMonth   = $request->query('to_month')   !== null ? (int)$request->query('to_month')   : null;

        $slips = $this->payrollModel->getSlips($empId, $fromYear, $fromMonth, $toYear, $toMonth);

        $this->success($response, [
            'employee' => $employee,
            'slips'    => $slips,
        ], 'Payslips fetched.');
    }

    /**
     * POST /api/hr/payroll
     * Create or update (upsert) a payroll entry for a given employee + period.
     */
    public function upsert(Request $request, Response $response): never
    {
        $data = $request->body();

        $errors = ValidationHelper::validate($data, [
            'emp_id'       => ['required', 'numeric'],
            'period_year'  => ['required', 'numeric'],
            'period_month' => ['required', 'numeric'],
            'gross_salary' => ['required', 'numeric'],
        ]);

        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $empId = (int)$data['emp_id'];
        $year  = (int)$data['period_year'];
        $month = (int)$data['period_month'];

        if (!$this->employeeModel->find($empId)) {
            $this->error($response, 'Employee not found.', 404);
        }

        $monthNames = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'];
        $payMonth = ($monthNames[$month - 1] ?? '') . ' ' . $year;

        // Map frontend field names → real DB column names.
        // RSSB total is stored in `pension`; rama and maternity default to 0.
        $payload = [
            'emp_id'              => $empId,
            'pay_month'           => $payMonth,
            'period_year'         => $year,
            'period_month'        => $month,
            'basic_salary'        => (float)($data['basic_salary']        ?? 0),
            'housing_allowance'   => (float)($data['housing_allowance']   ?? 0),
            'transport_allowance' => (float)($data['transport_allowance'] ?? 0),
            'other_allowances'    => (float)($data['other_allowances']    ?? 0),
            'gross'               => (float)($data['gross_salary']        ?? 0),
            'tax'                 => (float)($data['paye']                ?? 0),
            'pension'             => (float)($data['rssb']                ?? 0),
            'rama'                => 0,
            'maternity'           => (float)($data['maternity']           ?? 0),
            'cbhi'                => (float)($data['cbhi']                ?? 0),
            'net'                 => (float)($data['net_salary']          ?? 0),
            'status'              => $data['payroll_status'] ?? 'Pending',
        ];

        // Keep employees.salary in sync with the latest gross entered
        $this->employeeModel->update($empId, ['salary' => $payload['gross']]);

        $existing = $this->payrollModel->findByPeriod($empId, $year, $month);

        if ($existing) {
            $this->payrollModel->update((int)$existing['id'], $payload);
            $updated = $this->payrollModel->find((int)$existing['id']);
            $this->success($response, $updated, 'Payroll entry updated.');
        } else {
            $id  = $this->payrollModel->create($payload);
            $new = $this->payrollModel->find($id);
            $this->success($response, $new, 'Payroll entry created.', 201);
        }
    }

    /**
     * PATCH /api/hr/payroll/:id/status
     * Set payroll entry status: Pending | Paid | Approved
     */
    public function setStatus(Request $request, Response $response): never
    {
        $id     = (int)$request->param('id');
        $body   = $request->body();
        $status = trim((string)($body['status'] ?? ''));

        $allowed = ['Pending', 'Paid', 'Approved'];
        if (!in_array($status, $allowed, true)) {
            $this->error($response, 'Invalid status. Must be one of: ' . implode(', ', $allowed), 422);
        }

        $existing = $this->payrollModel->find($id);
        if (!$existing) {
            $this->error($response, 'Payroll entry not found.', 404);
        }

        $this->payrollModel->update($id, ['status' => $status]);
        $this->success($response, null, "Payroll marked as {$status}.");
    }

    /**
     * POST /api/hr/payroll/copy-period
     * Copy all payroll entries from one period to another (skip if destination already exists).
     *
     * Body: { from_year, from_month, to_year, to_month }
     */
    public function copyPeriod(Request $request, Response $response): never
    {
        $body      = $request->body();
        $fromYear  = (int)($body['from_year']  ?? 0);
        $fromMonth = (int)($body['from_month'] ?? 0);
        $toYear    = (int)($body['to_year']    ?? 0);
        $toMonth   = (int)($body['to_month']   ?? 0);

        if (!$fromYear || !$fromMonth || !$toYear || !$toMonth) {
            $this->error($response, 'from_year, from_month, to_year, to_month are all required.', 422);
        }

        if ($fromYear === $toYear && $fromMonth === $toMonth) {
            $this->error($response, 'Source and destination period must differ.', 422);
        }

        $monthNames = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'];
        $toPayMonth = ($monthNames[$toMonth - 1] ?? '') . ' ' . $toYear;

        $db     = $this->payrollModel->db();
        $source = $db->fetchAll(
            "SELECT emp_id, basic_salary, housing_allowance, transport_allowance,
                    other_allowances, gross, tax, pension, rama, maternity, cbhi, net
             FROM hr_payroll
             WHERE period_year = ? AND period_month = ?",
            [$fromYear, $fromMonth]
        );

        $copied  = 0;
        $skipped = 0;

        foreach ($source as $row) {
            $exists = $this->payrollModel->findByPeriod((int)$row['emp_id'], $toYear, $toMonth);
            if ($exists) { $skipped++; continue; }

            $this->payrollModel->create([
                'emp_id'              => $row['emp_id'],
                'pay_month'           => $toPayMonth,
                'period_year'         => $toYear,
                'period_month'        => $toMonth,
                'basic_salary'        => $row['basic_salary'],
                'housing_allowance'   => $row['housing_allowance'],
                'transport_allowance' => $row['transport_allowance'],
                'other_allowances'    => $row['other_allowances'],
                'gross'               => $row['gross'],
                'tax'                 => $row['tax'],
                'pension'             => $row['pension'],
                'rama'                => $row['rama'],
                'maternity'           => $row['maternity'],
                'cbhi'                => $row['cbhi'],
                'net'                 => $row['net'],
                'status'              => 'Pending',
            ]);
            $copied++;
        }

        $this->success($response, [
            'copied'  => $copied,
            'skipped' => $skipped,
            'period'  => $toPayMonth,
        ], "Copied {$copied} payroll entries to {$toPayMonth}.");
    }

    /**
     * DELETE /api/hr/payroll/:id
     */
    public function destroy(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');

        if (!$this->payrollModel->find($id)) {
            $this->error($response, 'Payroll entry not found.', 404);
        }

        $this->payrollModel->delete($id);
        $this->success($response, null, 'Payroll entry deleted.');
    }

    /**
     * POST /api/hr/payroll/import-excel
     *
     * Matches employees from the `employees` table (employee_fname / employee_lname)
     * Matches employees in `employees` table; creates minimal employee records
     * for any not found, then upserts payroll entries into `hr_payroll`.
     *
     * Body params:
     *   period_year  (int, default: current year)
     *   period_month (int, default: current month)
     *   rows         (array of {fname, lname, gross, paye})
     *                If omitted, the hardcoded April-2026 HR Excel data is used.
     */
    public function importFromExcel(Request $request, Response $response): never
    {
        $body        = $request->body();
        $periodYear  = (int)($body['period_year']  ?? date('Y'));
        $periodMonth = (int)($body['period_month'] ?? date('n'));

        $monthNames = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'];
        $payMonth = ($monthNames[$periodMonth - 1] ?? '') . ' ' . $periodYear;

        // Excel rows from HR — fname = employee_fname (surname), lname = employee_lname (given name)
        $defaultRows = [
            ['fname' => 'NTAGANDA',      'lname' => 'Laurent',     'gross' => 1756795, 'paye' => 491038],
            ['fname' => 'NZABONALIBA',   'lname' => 'Albert',      'gross' => 1465744, 'paye' => 403723],
            ['fname' => 'GASANGO',       'lname' => 'Lilianne',    'gross' => 1465744, 'paye' => 403723],
            ['fname' => 'NSHIMIYIMANA',  'lname' => 'Hélène',      'gross' => 657472,  'paye' => 161242],
            ['fname' => 'MUREKEYISONI',  'lname' => 'Julienne',    'gross' => 657472,  'paye' => 161242],
            ['fname' => 'MUKAMURENZI',   'lname' => 'Clarisse',    'gross' => 548112,  'paye' => 128434],
            ['fname' => 'MUTANGANA',     'lname' => 'Innocent',    'gross' => 480407,  'paye' => 108122],
            ['fname' => 'IDUKUNDA',      'lname' => 'Lengo Lione', 'gross' => 480407,  'paye' => 108122],
            ['fname' => 'UMUGWANEZA',    'lname' => 'Lydie',       'gross' => 416850,  'paye' => 89055],
            ['fname' => 'KARASIRA',      'lname' => 'Theophille',  'gross' => 423458,  'paye' => 91037],
            ['fname' => 'NSHIMIYIMANA',  'lname' => 'Emmanuel',    'gross' => 341834,  'paye' => 66550],
            ['fname' => 'BIZIMANA',      'lname' => 'Protais',     'gross' => 341834,  'paye' => 66550],
            ['fname' => 'NDAYISHIMIYE',  'lname' => 'Placide',     'gross' => 341834,  'paye' => 66550],
            ['fname' => 'NGOGA',         'lname' => 'Tito',        'gross' => 341834,  'paye' => 66550],
            ['fname' => 'UMUTESI',       'lname' => 'Alice',       'gross' => 341834,  'paye' => 66550],
            ['fname' => 'NIYONSABA',     'lname' => 'Esperance',   'gross' => 341834,  'paye' => 66550],
            ['fname' => 'KAMPARAYE',     'lname' => 'Iphigénie',   'gross' => 341834,  'paye' => 66550],
            ['fname' => 'UWIMANA',       'lname' => 'Jeanne',      'gross' => 341834,  'paye' => 66550],
            ['fname' => 'MUSABYEMARIYA', 'lname' => 'Gaudiose',    'gross' => 341834,  'paye' => 66550],
            ['fname' => 'NIKOMBABONA',   'lname' => 'Etienne',     'gross' => 341834,  'paye' => 66550],
            ['fname' => 'SIBOMANA',      'lname' => 'Eric',        'gross' => 341834,  'paye' => 66550],
            ['fname' => 'HAKIZIMANA',    'lname' => 'Martin',      'gross' => 341834,  'paye' => 66550],
            ['fname' => 'NDAYISHIMIYE',  'lname' => 'Jean Damas',  'gross' => 545741,  'paye' => 127722],
            ['fname' => 'UWISHEMA',      'lname' => 'Charles',     'gross' => 182497,  'paye' => 20499],
            ['fname' => 'SAGE',          'lname' => 'Emmanuel',    'gross' => 130000,  'paye' => 10000],
            ['fname' => 'NTWARI',        'lname' => 'Innocent',    'gross' => 125000,  'paye' => 9000],
        ];

        $excelRows = !empty($body['rows']) && is_array($body['rows']) ? $body['rows'] : $defaultRows;

        $db      = $this->payrollModel->db();
        $results = [];
        $inserted = 0;
        $skipped  = 0;

        foreach ($excelRows as $row) {
            $fname = trim((string)($row['fname'] ?? ''));
            $lname = trim((string)($row['lname'] ?? ''));
            $gross = (float)($row['gross'] ?? 0);
            $paye  = (float)($row['paye']  ?? 0);
            $net   = max(0, $gross - $paye);

            if ($fname === '' || $lname === '' || $gross <= 0) {
                $results[] = ['row' => "{$fname} {$lname}", 'status' => 'skipped', 'reason' => 'Missing data'];
                $skipped++;
                continue;
            }

            // Strip academic/honorary titles from fname for DB lookup
            $fnameClean = preg_replace('/^(Dr|DR|Prof|Mr|Mrs|Ms)\.?\s+/i', '', $fname);

            // 1. Find in `employees` by employee_lname LIKE (given name column)
            $candidates = $db->fetchAll(
                "SELECT employee_id, employee_fname, employee_lname
                 FROM employees WHERE employee_lname LIKE ? LIMIT 5",
                ["%{$lname}%"]
            );

            $emp = null;
            if (count($candidates) === 1) {
                $emp = $candidates[0];
            } elseif (count($candidates) > 1) {
                foreach ($candidates as $c) {
                    if (stripos((string)$c['employee_fname'], $fnameClean) !== false) {
                        $emp = $c;
                        break;
                    }
                }
                if (!$emp) $emp = $candidates[0];
            }

            // 1b. Fallback: search by all-caps surname in both fname and lname columns
            if (!$emp) {
                $candidates2 = $db->fetchAll(
                    "SELECT employee_id, employee_fname, employee_lname
                     FROM employees
                     WHERE employee_fname LIKE ? OR employee_lname LIKE ? LIMIT 5",
                    ["%{$fnameClean}%", "%{$fnameClean}%"]
                );
                if (count($candidates2) === 1) {
                    $emp = $candidates2[0];
                } elseif (count($candidates2) > 1) {
                    foreach ($candidates2 as $c) {
                        if (stripos((string)$c['employee_fname'], $lname) !== false ||
                            stripos((string)$c['employee_lname'], $lname) !== false) {
                            $emp = $c;
                            break;
                        }
                    }
                    if (!$emp) $emp = $candidates2[0];
                }
            }

            // 1c. Still not found — create a minimal employee record
            if (!$emp) {
                $db->execute(
                    "INSERT INTO employees (employee_fname, employee_lname, employee_status, account_status, employee_reg_date)
                     VALUES (?, ?, 'Permanent', 'Active', CURDATE())",
                    [$fnameClean, $lname]
                );
                $newEmpId = (int)$db->lastInsertId();
                $emp = ['employee_id' => $newEmpId, 'employee_fname' => $fnameClean, 'employee_lname' => $lname];
                $results[] = ['row' => "{$fname} {$lname}", 'status' => 'created', 'reason' => 'New employee added to employees table'];
            }

            $empId = (int)$emp['employee_id'];

            // 2. Upsert into hr_payroll using employees.employee_id as emp_id
            $db->execute(
                "INSERT INTO hr_payroll
                   (emp_id, pay_month, period_year, period_month,
                    basic_salary, housing_allowance, transport_allowance, other_allowances,
                    gross, tax, pension, rama, maternity, cbhi, net, status)
                 VALUES (?, ?, ?, ?,  ?, 0, 0, 0,  ?, ?, 0, 0, 0, 0, ?, 'Approved')
                 ON DUPLICATE KEY UPDATE
                   pay_month    = VALUES(pay_month),
                   basic_salary = VALUES(basic_salary),
                   gross        = VALUES(gross),
                   tax          = VALUES(tax),
                   net          = VALUES(net),
                   status       = VALUES(status)",
                [
                    $empId, $payMonth, $periodYear, $periodMonth,
                    $gross, $gross, $paye, $net,
                ]
            );

            $results[] = [
                'row'    => $emp['employee_fname'] . ' ' . $emp['employee_lname'],
                'emp_id' => $empId,
                'gross'  => $gross,
                'paye'   => $paye,
                'net'    => $net,
                'status' => 'imported',
            ];
            $inserted++;
        }

        $this->success($response, [
            'period'   => $payMonth,
            'inserted' => $inserted,
            'skipped'  => $skipped,
            'detail'   => $results,
        ], "Import complete: {$inserted} payroll records upserted for {$payMonth}.");
    }
}

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
               NULL                                            AS salary,
               NULL                                            AS email,

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
        $empId    = (int)$request->param('emp_id');
        $employee = $this->employeeModel->find($empId);

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
            'maternity'           => 0,
            'cbhi'                => (float)($data['cbhi']                ?? 0),
            'net'                 => (float)($data['net_salary']          ?? 0),
            'status'              => $data['payroll_status'] ?? 'Pending',
        ];

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
}

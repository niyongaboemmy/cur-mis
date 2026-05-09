<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\HrPayrollModel;

/**
 * Per-employee voluntary/assigned deductions.
 * HR can add deductions of type Loan, School Fees, Restoration, Other
 * with a fixed monthly RWF amount that is automatically subtracted from net salary.
 */
class EmployeeDeductionController extends BaseController
{
    private function db(): \Core\Database
    {
        return (new HrPayrollModel())->db();
    }

    /**
     * After any deduction change, recalculate other_deductions and net for
     * every hr_payroll row belonging to this employee so the stored values
     * stay consistent without requiring a manual payroll re-save.
     */
    private function recalcPayrollNets(int $empId): void
    {
        $db = $this->db();
        $payrolls = $db->fetchAll(
            "SELECT id, period_year, period_month, gross, tax, pension, cbhi
             FROM hr_payroll WHERE emp_id = ?",
            [$empId]
        ) ?: [];

        foreach ($payrolls as $p) {
            $year  = (int)$p['period_year'];
            $month = (int)$p['period_month'];

            $dedRows = $db->fetchAll(
                "SELECT monthly_amount FROM hr_employee_deductions
                 WHERE emp_id = ?
                   AND status = 'Active'
                   AND (start_year < ? OR (start_year = ? AND start_month <= ?))
                   AND (end_year IS NULL
                        OR end_year > ?
                        OR (end_year = ? AND end_month >= ?))",
                [$empId, $year, $year, $month, $year, $year, $month]
            ) ?: [];

            $otherDed = array_sum(array_column($dedRows, 'monthly_amount'));
            $net      = max(0,
                (float)$p['gross']
                - (float)$p['tax']
                - (float)$p['pension']
                - (float)$p['cbhi']
                - $otherDed
            );

            $db->execute(
                "UPDATE hr_payroll SET other_deductions = ?, net = ? WHERE id = ?",
                [$otherDed, $net, (int)$p['id']]
            );
        }
    }

    private function ensureTable(): void
    {
        $this->db()->execute("
            CREATE TABLE IF NOT EXISTS `hr_employee_deductions` (
              `id`             INT UNSIGNED    NOT NULL AUTO_INCREMENT,
              `emp_id`         INT             NOT NULL,
              `deduction_type` VARCHAR(60)     NOT NULL DEFAULT 'Other',
              `label`          VARCHAR(120)    NOT NULL,
              `monthly_amount` DECIMAL(14,2)   NOT NULL DEFAULT 0.00,
              `total_amount`   DECIMAL(14,2)   DEFAULT NULL,
              `paid_amount`    DECIMAL(14,2)   NOT NULL DEFAULT 0.00,
              `notes`          VARCHAR(255)    DEFAULT NULL,
              `start_year`     SMALLINT        NOT NULL,
              `start_month`    TINYINT         NOT NULL,
              `end_year`       SMALLINT        DEFAULT NULL,
              `end_month`      TINYINT         DEFAULT NULL,
              `status`         ENUM('Active','Completed','Cancelled') NOT NULL DEFAULT 'Active',
              `created_at`     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
              `updated_at`     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              PRIMARY KEY (`id`),
              KEY `idx_emp_ded_emp` (`emp_id`, `status`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ");
    }

    /**
     * GET /api/hr/employees/:emp_id/deductions
     * List all deductions for an employee.
     */
    public function index(Request $request, Response $response): never
    {
        $this->ensureTable();
        $empId = (int)$request->param('emp_id');

        $rows = $this->db()->fetchAll(
            "SELECT id, emp_id, deduction_type, label, monthly_amount,
                    total_amount, paid_amount, notes,
                    start_year, start_month, end_year, end_month, status,
                    created_at, updated_at
             FROM hr_employee_deductions
             WHERE emp_id = ?
             ORDER BY
               FIELD(status, 'Active', 'Completed', 'Cancelled'),
               id DESC",
            [$empId]
        ) ?: [];

        $this->success($response, $rows, 'Employee deductions fetched.');
    }

    /**
     * GET /api/hr/employees/:emp_id/deductions/active
     * Return only active deductions for a given month (used during payroll upsert).
     * Query params: year, month
     */
    public function activeForMonth(Request $request, Response $response): never
    {
        $this->ensureTable();
        $empId = (int)$request->param('emp_id');
        $year  = (int)($request->query('year')  ?? date('Y'));
        $month = (int)($request->query('month') ?? date('n'));

        $rows = $this->db()->fetchAll(
            "SELECT id, label, deduction_type, monthly_amount
             FROM hr_employee_deductions
             WHERE emp_id = ?
               AND status = 'Active'
               AND (start_year < ? OR (start_year = ? AND start_month <= ?))
               AND (end_year IS NULL
                    OR end_year > ?
                    OR (end_year = ? AND end_month >= ?))",
            [$empId, $year, $year, $month, $year, $year, $month]
        ) ?: [];

        $total = array_sum(array_column($rows, 'monthly_amount'));

        $this->success($response, [
            'deductions' => $rows,
            'total'      => (float)$total,
        ], 'Active deductions fetched.');
    }

    /**
     * POST /api/hr/employees/:emp_id/deductions
     * Add a new deduction for an employee.
     */
    public function store(Request $request, Response $response): never
    {
        $this->ensureTable();
        $empId = (int)$request->param('emp_id');
        $data  = $request->body();

        $label  = trim((string)($data['label'] ?? ''));
        $amount = (float)($data['monthly_amount'] ?? 0);

        if ($label === '') {
            $this->error($response, 'Label is required.', 422);
        }
        if ($amount <= 0) {
            $this->error($response, 'Monthly amount must be greater than 0.', 422);
        }

        $startYear  = (int)($data['start_year']  ?? date('Y'));
        $startMonth = (int)($data['start_month'] ?? date('n'));
        $endYear    = isset($data['end_year'])  && $data['end_year']  !== '' && $data['end_year']  !== null ? (int)$data['end_year']  : null;
        $endMonth   = isset($data['end_month']) && $data['end_month'] !== '' && $data['end_month'] !== null ? (int)$data['end_month'] : null;
        $totalAmt   = isset($data['total_amount']) && $data['total_amount'] !== '' ? (float)$data['total_amount'] : null;

        $this->db()->execute(
            "INSERT INTO hr_employee_deductions
               (emp_id, deduction_type, label, monthly_amount, total_amount, notes,
                start_year, start_month, end_year, end_month, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')",
            [
                $empId,
                trim((string)($data['deduction_type'] ?? 'Other')),
                $label,
                $amount,
                $totalAmt,
                trim((string)($data['notes'] ?? '')),
                $startYear,
                $startMonth,
                $endYear,
                $endMonth,
            ]
        );

        $id  = $this->db()->lastInsertId();
        $row = $this->db()->fetchOne(
            "SELECT * FROM hr_employee_deductions WHERE id = ?", [$id]
        );

        $this->recalcPayrollNets($empId);

        $this->success($response, $row, 'Deduction added.', 201);
    }

    /**
     * PUT /api/hr/employees/:emp_id/deductions/:id
     * Update a deduction record.
     */
    public function update(Request $request, Response $response): never
    {
        $this->ensureTable();
        $empId = (int)$request->param('emp_id');
        $id    = (int)$request->param('id');
        $data  = $request->body();

        $row = $this->db()->fetchOne(
            "SELECT id FROM hr_employee_deductions WHERE id = ? AND emp_id = ?",
            [$id, $empId]
        );
        if (!$row) {
            $this->error($response, 'Deduction not found.', 404);
        }

        $label  = trim((string)($data['label'] ?? ''));
        $amount = (float)($data['monthly_amount'] ?? 0);

        if ($label === '') {
            $this->error($response, 'Label is required.', 422);
        }
        if ($amount <= 0) {
            $this->error($response, 'Monthly amount must be greater than 0.', 422);
        }

        $endYear  = isset($data['end_year'])  && $data['end_year']  !== '' && $data['end_year']  !== null ? (int)$data['end_year']  : null;
        $endMonth = isset($data['end_month']) && $data['end_month'] !== '' && $data['end_month'] !== null ? (int)$data['end_month'] : null;
        $totalAmt = isset($data['total_amount']) && $data['total_amount'] !== '' ? (float)$data['total_amount'] : null;

        $allowedStatuses = ['Active', 'Completed', 'Cancelled'];
        $status = in_array($data['status'] ?? '', $allowedStatuses, true)
            ? $data['status']
            : 'Active';

        $this->db()->execute(
            "UPDATE hr_employee_deductions
             SET deduction_type = ?, label = ?, monthly_amount = ?, total_amount = ?,
                 paid_amount = ?, notes = ?,
                 start_year = ?, start_month = ?, end_year = ?, end_month = ?,
                 status = ?
             WHERE id = ? AND emp_id = ?",
            [
                trim((string)($data['deduction_type'] ?? 'Other')),
                $label,
                $amount,
                $totalAmt,
                max(0, (float)($data['paid_amount'] ?? 0)),
                trim((string)($data['notes'] ?? '')),
                (int)($data['start_year']  ?? date('Y')),
                (int)($data['start_month'] ?? date('n')),
                $endYear,
                $endMonth,
                $status,
                $id,
                $empId,
            ]
        );

        $updated = $this->db()->fetchOne(
            "SELECT * FROM hr_employee_deductions WHERE id = ?", [$id]
        );

        $this->recalcPayrollNets($empId);

        $this->success($response, $updated, 'Deduction updated.');
    }

    /**
     * DELETE /api/hr/employees/:emp_id/deductions/:id
     * Remove a deduction.
     */
    public function destroy(Request $request, Response $response): never
    {
        $this->ensureTable();
        $empId = (int)$request->param('emp_id');
        $id    = (int)$request->param('id');

        $row = $this->db()->fetchOne(
            "SELECT id FROM hr_employee_deductions WHERE id = ? AND emp_id = ?",
            [$id, $empId]
        );
        if (!$row) {
            $this->error($response, 'Deduction not found.', 404);
        }

        $this->db()->execute(
            "DELETE FROM hr_employee_deductions WHERE id = ? AND emp_id = ?",
            [$id, $empId]
        );

        $this->recalcPayrollNets($empId);

        $this->success($response, null, 'Deduction removed.');
    }
}

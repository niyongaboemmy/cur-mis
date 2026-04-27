<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\HrPayrollModel;
use App\Models\HrEmployeeModel;

class SalaryPaymentController extends BaseController
{
    private HrPayrollModel  $payrollModel;
    private HrEmployeeModel $employeeModel;

    public function __construct()
    {
        $this->payrollModel  = new HrPayrollModel();
        $this->employeeModel = new HrEmployeeModel();
    }

    /**
     * GET /api/hr/payroll/payments
     * List payments — filterable by period, employee, or payroll entry.
     */
    public function index(Request $request, Response $response): never
    {
        $db        = $this->payrollModel->db();
        $year      = $request->query('period_year')  !== null ? (int)$request->query('period_year')  : null;
        $month     = $request->query('period_month') !== null ? (int)$request->query('period_month') : null;
        $empId     = $request->query('emp_id')       !== null ? (int)$request->query('emp_id')       : null;
        $payrollId = $request->query('payroll_id')   !== null ? (int)$request->query('payroll_id')   : null;

        $clauses  = [];
        $bindings = [];

        if ($year)      { $clauses[] = 'sp.period_year = ?';  $bindings[] = $year; }
        if ($month)     { $clauses[] = 'sp.period_month = ?'; $bindings[] = $month; }
        if ($empId)     { $clauses[] = 'sp.emp_id = ?';       $bindings[] = $empId; }
        if ($payrollId) { $clauses[] = 'sp.payroll_id = ?';   $bindings[] = $payrollId; }

        $where = $clauses ? 'WHERE ' . implode(' AND ', $clauses) : '';

        $rows = $db->fetchAll(
            "SELECT
               sp.id,
               sp.payroll_id,
               sp.emp_id,
               CONCAT(e.employee_fname,' ',e.employee_lname) AS full_name,
               sp.period_year,
               sp.period_month,
               sp.amount,
               sp.payment_method,
               sp.bank_name,
               sp.account_number,
               sp.reference,
               sp.notes,
               sp.paid_at,
               sp.status
             FROM salary_payments sp
             JOIN employees e ON e.employee_id = sp.emp_id
             $where
             ORDER BY sp.paid_at DESC",
            $bindings
        );

        $this->success($response, array_values($rows), 'Payments fetched.');
    }

    /**
     * POST /api/hr/payroll/payments
     * Process a salary payment for a payroll entry and mark it as Paid.
     *
     * Body: { payroll_id, amount, payment_method, bank_name?, account_number?, reference?, notes? }
     */
    public function process(Request $request, Response $response): never
    {
        $data      = $request->body();
        $payrollId = (int)($data['payroll_id'] ?? 0);

        if (!$payrollId) {
            $this->error($response, 'payroll_id is required.', 422);
        }

        $payroll = $this->payrollModel->find($payrollId);
        if (!$payroll) {
            $this->error($response, 'Payroll entry not found.', 404);
        }

        $method  = trim((string)($data['payment_method'] ?? 'Bank Transfer'));
        $allowed = ['Bank Transfer', 'Cash', 'MoMo'];
        if (!in_array($method, $allowed, true)) {
            $this->error($response, 'Invalid payment_method. Must be one of: ' . implode(', ', $allowed), 422);
        }

        $amount = isset($data['amount']) && (float)$data['amount'] > 0
            ? (float)$data['amount']
            : (float)($payroll['net'] ?? 0);

        $db = $this->payrollModel->db();

        $db->execute(
            "INSERT INTO salary_payments
               (payroll_id, emp_id, period_year, period_month, amount,
                payment_method, bank_name, account_number, reference, notes, paid_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())",
            [
                $payrollId,
                (int)$payroll['emp_id'],
                (int)$payroll['period_year'],
                (int)$payroll['period_month'],
                $amount,
                $method,
                $data['bank_name']      !== '' ? ($data['bank_name']      ?? null) : null,
                $data['account_number'] !== '' ? ($data['account_number'] ?? null) : null,
                $data['reference']      !== '' ? ($data['reference']      ?? null) : null,
                $data['notes']          !== '' ? ($data['notes']          ?? null) : null,
            ]
        );

        $paymentId = (int)$db->lastInsertId();

        // Mark payroll as Paid
        $this->payrollModel->update($payrollId, ['status' => 'Paid']);

        $this->success($response, ['id' => $paymentId], 'Salary payment processed and payroll marked as Paid.', 201);
    }

    /**
     * DELETE /api/hr/payroll/payments/:id
     * Cancel a payment and revert the linked payroll entry to Approved.
     */
    public function destroy(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $db = $this->payrollModel->db();

        $payment = $db->fetchOne("SELECT * FROM salary_payments WHERE id = ? LIMIT 1", [$id]);
        if (!$payment) {
            $this->error($response, 'Payment record not found.', 404);
        }

        $db->execute("UPDATE salary_payments SET status = 'Cancelled' WHERE id = ?", [$id]);
        $this->payrollModel->update((int)$payment['payroll_id'], ['status' => 'Approved']);

        $this->success($response, null, 'Payment cancelled. Payroll reverted to Approved.');
    }
}

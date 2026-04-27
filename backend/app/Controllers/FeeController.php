<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\FeeStructureModel;
use App\Models\FeeInvoiceModel;
use App\Models\FeePaymentModel;
use App\Models\FeeBursaryModel;
use App\Models\ExpenseModel;
use App\Models\ExpenseCategoryModel;
use App\Models\ExpenseBudgetModel;
use App\Models\ClearanceModel;
use App\Services\FeeService;
use App\Services\ClearanceService;
use App\Helpers\ValidationHelper;

class FeeController extends BaseController
{
    private FeeStructureModel    $structureModel;
    private FeeInvoiceModel      $invoiceModel;
    private FeePaymentModel      $paymentModel;
    private FeeBursaryModel      $bursaryModel;
    private ExpenseModel         $expenseModel;
    private ExpenseCategoryModel $expenseCategoryModel;
    private ExpenseBudgetModel   $budgetModel;
    private ClearanceModel       $clearanceModel;
    private FeeService           $service;
    private ClearanceService     $clearanceService;

    public function __construct()
    {
        $this->structureModel       = new FeeStructureModel();
        $this->invoiceModel         = new FeeInvoiceModel();
        $this->paymentModel         = new FeePaymentModel();
        $this->bursaryModel         = new FeeBursaryModel();
        $this->expenseModel         = new ExpenseModel();
        $this->expenseCategoryModel = new ExpenseCategoryModel();
        $this->budgetModel          = new ExpenseBudgetModel();
        $this->clearanceModel       = new ClearanceModel();
        $this->service              = new FeeService();
        $this->clearanceService     = new ClearanceService();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Fee Structures
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * GET /api/finance/structures
     */
    public function listStructures(Request $request, Response $response): never
    {
        $filters = [
            'academic_year_id' => (int)($request->query('academic_year_id') ?? 0) ?: null,
            'department_id'    => $request->query('department_id') !== null
                                    ? ((int)$request->query('department_id') ?: null) : null,
            'level_id'         => $request->query('level_id') !== null
                                    ? ((int)$request->query('level_id') ?: null) : null,
            'fee_type'         => $request->query('fee_type')    ?? '',
            'is_active'        => $request->query('is_active') !== null
                                    ? (int)$request->query('is_active') : null,
        ];
        $filters = array_filter($filters, fn ($v) => $v !== null && $v !== '');

        $this->success($response, $this->structureModel->listWithJoins($filters), 'Fee structures retrieved.');
    }

    /**
     * POST /api/finance/structures
     */
    public function createStructure(Request $request, Response $response): never
    {
        $data   = $request->body();
        $actor  = $request->param('_auth_user');
        $errors = ValidationHelper::validate($data, [
            'academic_year_id' => 'required|numeric',
            'fee_type'         => 'required|in:TUITION,REGISTRATION,ADMISSION,HOSTEL,ACADEMIC_DOCUMENT,FINE,REPEAT_MODULE',
            'label'            => 'required|string|max:120',
            'amount'           => 'required|numeric',
        ]);
        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $id = $this->structureModel->create([
            'academic_year_id' => (int)$data['academic_year_id'],
            'department_id'    => !empty($data['department_id']) ? (int)$data['department_id'] : null,
            'level_id'         => !empty($data['level_id'])      ? (int)$data['level_id']      : null,
            'fee_type'         => $data['fee_type'],
            'label'            => $data['label'],
            'amount'           => (float)$data['amount'],
            'semester'         => !empty($data['semester'])       ? (int)$data['semester']      : null,
            'is_active'        => 1,
            'created_by'       => (int)$actor['id'],
        ]);

        $this->success($response, ['id' => (int)$id], 'Fee structure created.', 201);
    }

    /**
     * PUT /api/finance/structures/:id
     */
    public function updateStructure(Request $request, Response $response): never
    {
        $id   = (int)$request->param('id');
        $data = $request->body();

        if (!$this->structureModel->find($id)) {
            $this->error($response, 'Fee structure not found.', 404);
        }

        $this->structureModel->update($id, array_filter([
            'label'      => $data['label']     ?? null,
            'amount'     => isset($data['amount'])    ? (float)$data['amount']    : null,
            'semester'   => isset($data['semester'])  ? (int)$data['semester']    : null,
            'is_active'  => isset($data['is_active']) ? (int)$data['is_active']   : null,
        ], fn ($v) => $v !== null));

        $this->success($response, null, 'Fee structure updated.');
    }

    /**
     * DELETE /api/finance/structures/:id
     */
    public function deleteStructure(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        if (!$this->structureModel->find($id)) {
            $this->error($response, 'Fee structure not found.', 404);
        }
        $this->structureModel->delete($id);
        $this->success($response, null, 'Fee structure deleted.');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Student Ledger & Invoice Generation
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * GET /api/finance/students/:id/invoices
     */
    public function getStudentInvoices(Request $request, Response $response): never
    {
        $studentId     = $request->query('student_id') ?? '';
        if (!$studentId) {
            $this->error($response, 'student_id is required.', 422);
        }
        $academicYearId = (int)($request->query('academic_year_id') ?? 0);

        $filters = ['student_id' => $studentId];
        if ($academicYearId) {
            $filters['academic_year_id'] = $academicYearId;
        }

        $invoices = $this->invoiceModel->listWithDetails($filters);
        $totals   = $academicYearId
            ? $this->invoiceModel->getStudentLedgerTotals($studentId, $academicYearId)
            : [];

        $payments = $this->paymentModel->listWithDetails(['student_id' => $studentId]);

        $this->success($response, [
            'invoices' => $invoices,
            'payments' => $payments['data'],
            'totals'   => $totals,
        ], 'Student ledger retrieved.');
    }

    /**
     * POST /api/finance/students/:id/generate
     * Auto-identify and create all applicable invoices.
     */
    public function generateInvoices(Request $request, Response $response): never
    {
        $data      = $request->body();
        $actor     = $request->param('_auth_user');
        $studentId = $data['student_id'] ?? '';

        $errors = ValidationHelper::validate($data, [
            'student_id'       => 'required|string',
            'academic_year_id' => 'required|numeric',
        ]);
        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        try {
            $result = $this->service->autoGenerateInvoices(
                $studentId,
                (int)$data['academic_year_id'],
                !empty($data['semester']) ? (int)$data['semester'] : null,
                (int)$actor['id']
            );
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 422);
        }

        $this->success($response, $result, "Invoices generated: {$result['created']} new, {$result['skipped']} skipped.");
    }

    /**
     * POST /api/finance/invoices
     * Create a manual (ad-hoc) invoice (e.g. academic document fee, fine).
     */
    public function createInvoice(Request $request, Response $response): never
    {
        $data  = $request->body();
        $actor = $request->param('_auth_user');

        $errors = ValidationHelper::validate($data, [
            'student_id'       => 'required|string',
            'academic_year_id' => 'required|numeric',
            'fee_type'         => 'required|in:TUITION,REGISTRATION,ADMISSION,HOSTEL,ACADEMIC_DOCUMENT,FINE,REPEAT_MODULE,ARREARS',
            'description'      => 'required|string|max:200',
            'amount_due'       => 'required|numeric',
        ]);
        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $id = $this->invoiceModel->create([
            'invoice_number'   => $this->service->generateInvoiceNumber(),
            'student_id'       => $data['student_id'],
            'academic_year_id' => (int)$data['academic_year_id'],
            'semester'         => !empty($data['semester']) ? (int)$data['semester'] : null,
            'fee_type'         => $data['fee_type'],
            'description'      => $data['description'],
            'amount_due'       => (float)$data['amount_due'],
            'due_date'         => $data['due_date'] ?? null,
            'is_system_generated' => 0,
            'created_by'       => (int)$actor['id'],
        ]);

        $this->success($response, ['id' => (int)$id], 'Invoice created.', 201);
    }

    /**
     * PUT /api/finance/invoices/:id
     */
    public function updateInvoice(Request $request, Response $response): never
    {
        $id      = (int)$request->param('id');
        $data    = $request->body();
        $invoice = $this->invoiceModel->find($id);

        if (!$invoice) {
            $this->error($response, 'Invoice not found.', 404);
        }

        $allowed = ['description', 'amount_due', 'due_date', 'status'];
        $update  = array_intersect_key($data, array_flip($allowed));

        if (!empty($update)) {
            $this->invoiceModel->update($id, $update);
            $this->invoiceModel->recalculateStatus($id);
        }

        $this->success($response, null, 'Invoice updated.');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Payments
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * GET /api/finance/payments
     */
    public function listPayments(Request $request, Response $response): never
    {
        $filters = array_filter([
            'student_id'     => $request->query('student_id')     ?? '',
            'payment_method' => $request->query('payment_method') ?? '',
            'status'         => $request->query('status')         ?? '',
            'from_date'      => $request->query('from_date')      ?? '',
            'to_date'        => $request->query('to_date')        ?? '',
        ], fn ($v) => $v !== '');

        $page    = max(1, (int)($request->query('page') ?? 1));
        $perPage = max(1, min(100, (int)($request->query('per_page') ?? 20)));

        $this->success($response, $this->paymentModel->listWithDetails($filters, $page, $perPage), 'Payments retrieved.');
    }

    /**
     * POST /api/finance/payments
     */
    public function recordPayment(Request $request, Response $response): never
    {
        $data  = $request->body();
        $actor = $request->param('_auth_user');

        $errors = ValidationHelper::validate($data, [
            'invoice_id'     => 'required|numeric',
            'amount'         => 'required|numeric',
            'payment_method' => 'required|in:CASH,BANK_TRANSFER,MOBILE_MONEY,BURSARY,WAIVER',
        ]);
        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        // Store payment_sub_method if provided
        if (!empty($data['payment_sub_method'])) {
            $data['payment_sub_method'] = $data['payment_sub_method'];
        }

        try {
            $result = $this->service->recordPayment($data, (int)$actor['id']);
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 422);
        }

        // Non-blocking email confirmation
        $this->service->sendPaymentConfirmationEmail((int)$result['payment_id']);

        $this->success($response, $result, 'Payment recorded successfully.', 201);
    }

    /**
     * GET /api/finance/payments/:id/receipt
     */
    public function getReceipt(Request $request, Response $response): never
    {
        $id   = (int)$request->param('id');
        $data = $this->paymentModel->getReceiptData($id);

        if (!$data) {
            $this->error($response, 'Payment not found.', 404);
        }

        $this->success($response, $data, 'Receipt data retrieved.');
    }

    /**
     * PATCH /api/finance/payments/:id/approve
     */
    public function approvePayment(Request $request, Response $response): never
    {
        $id     = (int)$request->param('id');
        $actor  = $request->param('_auth_user');
        $payment = $this->paymentModel->find($id);

        if (!$payment)               $this->error($response, 'Payment not found.', 404);
        if ($payment['status'] !== 'pending') $this->error($response, 'Only pending payments can be approved.', 422);

        // Mark payment confirmed
        $this->paymentModel->update($id, [
            'status'       => 'confirmed',
            'confirmed_by' => (int)$actor['id'],
            'confirmed_at' => date('Y-m-d H:i:s'),
        ]);

        // Now update invoice balance
        $this->db->execute(
            "UPDATE `fee_invoices`
             SET amount_paid = amount_paid + ?, updated_at = NOW()
             WHERE id = ?",
            [(float)$payment['amount'], (int)$payment['invoice_id']]
        );
        $this->invoiceModel->recalculateStatus((int)$payment['invoice_id']);

        // Send email receipt
        $this->service->sendPaymentConfirmationEmail($id);

        $this->success($response, null, 'Payment approved and applied to invoice.');
    }

    /**
     * PATCH /api/finance/payments/:id/reject
     */
    public function rejectPayment(Request $request, Response $response): never
    {
        $id     = (int)$request->param('id');
        $actor  = $request->param('_auth_user');
        $data   = $request->body();
        $payment = $this->paymentModel->find($id);

        if (!$payment)               $this->error($response, 'Payment not found.', 404);
        if ($payment['status'] !== 'pending') $this->error($response, 'Only pending payments can be rejected.', 422);

        $this->paymentModel->update($id, [
            'status'           => 'rejected',
            'confirmed_by'     => (int)$actor['id'],
            'confirmed_at'     => date('Y-m-d H:i:s'),
            'rejection_reason' => $data['reason'] ?? 'Rejected by finance officer',
        ]);

        $this->success($response, null, 'Payment rejected.');
    }

    /**
     * GET /api/finance/payments/pending-count
     */
    public function getPendingPaymentCount(Request $request, Response $response): never
    {
        $row = $this->db->fetchOne(
            "SELECT COUNT(*) AS cnt FROM `fee_payments` WHERE status = 'pending'",
            []
        );
        $this->success($response, ['count' => (int)($row['cnt'] ?? 0)], 'Pending count retrieved.');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Bursaries
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * GET /api/finance/bursaries
     */
    public function listBursaries(Request $request, Response $response): never
    {
        $filters = array_filter([
            'student_id'       => $request->query('student_id')       ?? '',
            'academic_year_id' => (int)($request->query('academic_year_id') ?? 0) ?: null,
        ], fn ($v) => $v !== '' && $v !== null);

        $page    = max(1, (int)($request->query('page') ?? 1));
        $perPage = max(1, min(100, (int)($request->query('per_page') ?? 20)));
        $this->success($response, $this->bursaryModel->listWithDetails($filters, $page, $perPage), 'Bursaries retrieved.');
    }

    /**
     * POST /api/finance/bursaries
     */
    public function createBursary(Request $request, Response $response): never
    {
        $data  = $request->body();
        $actor = $request->param('_auth_user');

        $errors = ValidationHelper::validate($data, [
            'student_id'       => 'required|string',
            'academic_year_id' => 'required|numeric',
            'bursary_type'     => 'required|string|max:80',
            'amount'           => 'required|numeric',
        ]);
        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $id = $this->bursaryModel->create([
            'student_id'       => $data['student_id'],
            'academic_year_id' => (int)$data['academic_year_id'],
            'bursary_type'     => $data['bursary_type'],
            'amount'           => (float)$data['amount'],
            'coverage_pct'     => !empty($data['coverage_pct']) ? (float)$data['coverage_pct'] : null,
            'approved_by'      => (int)$actor['id'],
            'notes'            => $data['notes'] ?? null,
            'status'           => $data['status'] ?? 'confirmed',
            'confirmed_at'     => ($data['status'] ?? 'confirmed') === 'confirmed' ? date('Y-m-d H:i:s') : null,
            'confirmed_by'     => ($data['status'] ?? 'confirmed') === 'confirmed' ? (int)$actor['id'] : null,
        ]);

        // Re-apply bursaries to recalculate credit line
        $this->service->applyBursaries(
            $data['student_id'],
            (int)$data['academic_year_id'],
            (int)$actor['id']
        );

        $this->success($response, ['id' => (int)$id], 'Bursary created.', 201);
    }

    /**
     * DELETE /api/finance/bursaries/:id
     */
    public function deleteBursary(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        if (!$this->bursaryModel->find($id)) {
            $this->error($response, 'Bursary not found.', 404);
        }
        $this->bursaryModel->delete($id);
        $this->success($response, null, 'Bursary deleted.');
    }

    /**
     * PATCH /api/finance/bursaries/:id/confirm
     */
    public function confirmBursary(Request $request, Response $response): never
    {
        $id    = (int)$request->param('id');
        $actor = $request->param('_auth_user');
        $bursary = $this->bursaryModel->find($id);

        if (!$bursary) $this->error($response, 'Bursary not found.', 404);

        $this->bursaryModel->update($id, [
            'status'       => 'confirmed',
            'confirmed_at' => date('Y-m-d H:i:s'),
            'confirmed_by' => (int)$actor['id'],
        ]);

        // Re-apply bursaries now that this one is confirmed
        $this->service->applyBursaries(
            $bursary['student_id'],
            (int)$bursary['academic_year_id'],
            (int)$actor['id']
        );

        $this->success($response, null, 'Bursary confirmed and applied.');
    }

    /**
     * PATCH /api/finance/bursaries/:id/cancel
     */
    public function cancelBursary(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $bursary = $this->bursaryModel->find($id);

        if (!$bursary) $this->error($response, 'Bursary not found.', 404);

        $this->bursaryModel->update($id, ['status' => 'cancelled']);

        // Re-apply bursaries to remove this credit
        $actor = $request->param('_auth_user');
        $this->service->applyBursaries(
            $bursary['student_id'],
            (int)$bursary['academic_year_id'],
            (int)$actor['id']
        );

        $this->success($response, null, 'Bursary cancelled.');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Reports & Dashboard
    // ──────────────────────────────────────────────────────────────────────────



    /** GET /api/finance/budgets?academic_year_id= */
    public function listBudgets(Request $request, Response $response): never
    {
        $yearId = (int)($request->query('academic_year_id') ?? 0);
        if (!$yearId) $this->error($response, 'academic_year_id required.', 422);
        
        $this->success($response, $this->budgetModel->getBudgetsForYear($yearId), 'Budgets retrieved.');
    }

    /** POST /api/finance/budgets */
    public function saveBudget(Request $request, Response $response): never
    {
        $data  = $request->body();
        $actor = $request->param('_auth_user');

        $errors = ValidationHelper::validate($data, [
            'academic_year_id' => 'required|numeric',
            'category_id'      => 'required|numeric',
            'amount'           => 'required|numeric',
        ]);
        if (!empty($errors)) $this->error($response, 'Validation failed.', 422, $errors);

        $this->budgetModel->upsertBudget(
            (int)$data['academic_year_id'],
            (int)$data['category_id'],
            (float)$data['amount'],
            (int)$actor['id']
        );

        $this->success($response, null, 'Budget saved.');
    }

    /**
     * GET /api/finance/summary
     */
    public function getSummary(Request $request, Response $response): never
    {
        $academicYearId = (int)($request->query('academic_year_id') ?? 0);
        if (!$academicYearId) {
            $this->error($response, 'academic_year_id is required.', 422);
        }
        $this->success($response, $this->service->getSummary($academicYearId), 'Summary retrieved.');
    }

    /**
     * GET /api/finance/reports/revenue
     */
    public function getRevenueReport(Request $request, Response $response): never
    {
        $academicYearId = (int)($request->query('academic_year_id') ?? 0);
        if (!$academicYearId) {
            $this->error($response, 'academic_year_id is required.', 422);
        }
        $data = $this->invoiceModel->getRevenueSummary($academicYearId);
        $this->success($response, $data, 'Revenue report retrieved.');
    }

    /**
     * GET /api/finance/reports/outstanding
     */
    public function getOutstandingReport(Request $request, Response $response): never
    {
        $limit = min(200, max(1, (int)($request->query('limit') ?? 100)));
        $this->success($response, $this->invoiceModel->getOverdueInvoices($limit), 'Outstanding invoices retrieved.');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Account Balance & Income Projection
    // ──────────────────────────────────────────────────────────────────────────

    /** GET /api/finance/balance */
    public function getAccountBalance(Request $request, Response $response): never
    {
        $yearId = (int)($request->query('academic_year_id') ?? 0);
        if (!$yearId) $this->error($response, 'academic_year_id is required.', 422);
        $this->success($response, $this->service->getAccountBalance($yearId), 'Account balance retrieved.');
    }

    /** GET /api/finance/reports/projection */
    public function getIncomeProjection(Request $request, Response $response): never
    {
        $yearId = (int)($request->query('academic_year_id') ?? 0);
        if (!$yearId) $this->error($response, 'academic_year_id is required.', 422);
        $this->success($response, $this->service->getIncomeProjection($yearId), 'Projection retrieved.');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // CSV Export
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * GET /api/finance/reports/export
     * ?type=revenue|payments|outstanding|expenses  &academic_year_id=N
     * Returns CSV directly as a file download.
     */
    public function exportReport(Request $request, Response $response): never
    {
        $type   = $request->query('type')   ?? 'payments';
        $yearId = (int)($request->query('academic_year_id') ?? 0);

        $rows    = [];
        $headers = [];
        $filename = "CUR-Finance-{$type}-" . date('Y-m-d') . '.csv';

        switch ($type) {
            case 'revenue':
                if (!$yearId) $this->error($response, 'academic_year_id required.', 422);
                $data = $this->invoiceModel->getRevenueSummary($yearId);
                $headers = ['Fee Type', 'Invoices', 'Expected (RWF)', 'Collected (RWF)', 'Bursary (RWF)', '%'];
                foreach ($data as $r) {
                    $pct = $r['total_expected'] > 0
                        ? round(($r['total_collected'] / $r['total_expected']) * 100, 1) : 0;
                    $rows[] = [$r['fee_type'], $r['invoice_count'],
                               $r['total_expected'], $r['total_collected'], $r['total_bursary'], "{$pct}%"];
                }
                break;

            case 'payments':
                $filters = array_filter(['academic_year_id' => $yearId ?: null]);
                $data    = $this->paymentModel->listWithDetails($filters, 1, 5000);
                $headers = ['Receipt #', 'Student ID', 'Student Name', 'Amount (RWF)', 'Method', 'Reference', 'Date'];
                foreach ($data['data'] as $p) {
                    $rows[] = [
                        $p['receipt_number'], $p['student_id'],
                        trim(($p['student_fname'] ?? '') . ' ' . ($p['student_lname'] ?? '')),
                        $p['amount'], $p['payment_method'], $p['reference_number'] ?? '',
                        $p['paid_at'],
                    ];
                }
                break;

            case 'outstanding':
                $data = $this->invoiceModel->getOverdueInvoices(2000);
                $headers = ['Invoice #', 'Student ID', 'Fee Type', 'Amount Due (RWF)', 'Amount Paid (RWF)', 'Balance (RWF)', 'Due Date', 'Status'];
                foreach ($data as $inv) {
                    $balance = (float)$inv['amount_due'] - (float)$inv['amount_paid'] - (float)($inv['bursary_applied'] ?? 0);
                    $rows[] = [
                        $inv['invoice_number'], $inv['student_id'], $inv['fee_type'],
                        $inv['amount_due'], $inv['amount_paid'], $balance,
                        $inv['due_date'] ?? '', $inv['status'],
                    ];
                }
                break;

            case 'expenses':
                if (!$yearId) $this->error($response, 'academic_year_id required.', 422);
                $data    = $this->expenseModel->listWithDetails(['academic_year_id' => $yearId], 1, 5000);
                $headers = ['Title', 'Category', 'Vendor', 'Amount (RWF)', 'Date', 'Method', 'Reference', 'Recorded By'];
                foreach ($data['data'] as $e) {
                    $rows[] = [
                        $e['title'], $e['category_name'], $e['vendor'] ?? '',
                        $e['amount'], $e['payment_date'], $e['payment_method'],
                        $e['reference_number'] ?? '', $e['recorded_by_name'] ?? '',
                    ];
                }
                break;

            default:
                $this->error($response, 'Invalid report type.', 422);
        }

        // Build CSV string
        ob_start();
        $out = fopen('php://output', 'w');
        fputcsv($out, $headers);
        foreach ($rows as $row) fputcsv($out, $row);
        fclose($out);
        $csv = ob_get_clean();

        header('Content-Type: text/csv; charset=utf-8');
        header("Content-Disposition: attachment; filename=\"{$filename}\"");
        header('Cache-Control: no-cache');
        echo $csv;
        exit;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Expenses
    // ──────────────────────────────────────────────────────────────────────────

    /** GET /api/finance/expenses */
    public function listExpenses(Request $request, Response $response): never
    {
        $filters = array_filter([
            'academic_year_id' => (int)($request->query('academic_year_id') ?? 0) ?: null,
            'category_id'      => (int)($request->query('category_id')      ?? 0) ?: null,
            'from_date'        => $request->query('from_date') ?? '',
            'to_date'          => $request->query('to_date')   ?? '',
        ], fn ($v) => $v !== null && $v !== '');

        $page    = max(1, (int)($request->query('page')     ?? 1));
        $perPage = max(1, min(100, (int)($request->query('per_page') ?? 20)));

        $this->success($response, $this->expenseModel->listWithDetails($filters, $page, $perPage), 'Expenses retrieved.');
    }

    /** GET /api/finance/expenses/categories */
    public function listExpenseCategories(Request $request, Response $response): never
    {
        $this->success($response, $this->expenseCategoryModel->listAll(), 'Categories retrieved.');
    }

    /** POST /api/finance/expenses */
    public function createExpense(Request $request, Response $response): never
    {
        $data  = $request->body();
        $actor = $request->param('_auth_user');

        $errors = ValidationHelper::validate($data, [
            'category_id'  => 'required|numeric',
            'title'        => 'required|string|max:150',
            'amount'       => 'required|numeric',
            'payment_date' => 'required|string',
        ]);
        if (!empty($errors)) $this->error($response, 'Validation failed.', 422, $errors);

        $id = $this->expenseModel->create([
            'category_id'      => (int)$data['category_id'],
            'academic_year_id' => !empty($data['academic_year_id']) ? (int)$data['academic_year_id'] : null,
            'title'            => $data['title'],
            'description'      => $data['description'] ?? null,
            'amount'           => (float)$data['amount'],
            'payment_date'     => $data['payment_date'],
            'payment_method'   => $data['payment_method'] ?? 'BANK_TRANSFER',
            'reference_number' => $data['reference_number'] ?? null,
            'vendor'           => $data['vendor'] ?? null,
            'recorded_by'      => (int)$actor['id'],
        ]);

        $this->success($response, ['id' => (int)$id], 'Expense recorded.', 201);
    }

    /** PUT /api/finance/expenses/:id */
    public function updateExpense(Request $request, Response $response): never
    {
        $id   = (int)$request->param('id');
        $data = $request->body();
        if (!$this->expenseModel->find($id)) $this->error($response, 'Expense not found.', 404);

        $this->expenseModel->update($id, array_filter([
            'category_id'      => isset($data['category_id'])  ? (int)$data['category_id']   : null,
            'title'            => $data['title']            ?? null,
            'description'      => $data['description']      ?? null,
            'amount'           => isset($data['amount'])    ? (float)$data['amount']         : null,
            'payment_date'     => $data['payment_date']     ?? null,
            'payment_method'   => $data['payment_method']   ?? null,
            'reference_number' => $data['reference_number'] ?? null,
            'vendor'           => $data['vendor']           ?? null,
        ], fn ($v) => $v !== null));

        $this->success($response, null, 'Expense updated.');
    }

    /** DELETE /api/finance/expenses/:id */
    public function deleteExpense(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        if (!$this->expenseModel->find($id)) $this->error($response, 'Expense not found.', 404);
        $this->expenseModel->delete($id);
        $this->success($response, null, 'Expense deleted.');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Student Clearance
    // ──────────────────────────────────────────────────────────────────────────

    /** GET /api/finance/clearance?student_id=&academic_year_id=&semester= */
    public function getClearanceStatus(Request $request, Response $response): never
    {
        $studentId = $request->query('student_id')       ?? '';
        $yearId    = (int)($request->query('academic_year_id') ?? 0);
        $semester  = $request->query('semester') !== null ? (int)$request->query('semester') : null;

        if (!$studentId || !$yearId) $this->error($response, 'student_id and academic_year_id required.', 422);

        $data = $this->clearanceService->getStatus($studentId, $yearId, $semester);
        $this->success($response, $data, 'Clearance status retrieved.');
    }

    /** POST /api/finance/clearance — grant manual clearance */
    public function grantClearance(Request $request, Response $response): never
    {
        $data  = $request->body();
        $actor = $request->param('_auth_user');

        $errors = ValidationHelper::validate($data, [
            'student_id'       => 'required|string',
            'academic_year_id' => 'required|numeric',
        ]);
        if (!empty($errors)) $this->error($response, 'Validation failed.', 422, $errors);

        $record = $this->clearanceService->grantManual(
            $data['student_id'],
            (int)$data['academic_year_id'],
            isset($data['semester']) ? (int)$data['semester'] : null,
            (int)$actor['id'],
            $data['notes'] ?? ''
        );

        $this->success($response, $record, 'Clearance granted.');
    }

    /** POST /api/finance/clearance/bulk — auto-clear all students for a year */
    public function runBulkClearance(Request $request, Response $response): never
    {
        $data  = $request->body();
        $actor = $request->param('_auth_user');
        $yearId = (int)($data['academic_year_id'] ?? 0);
        if (!$yearId) $this->error($response, 'academic_year_id required.', 422);

        $result = $this->clearanceService->runBulkClearance($yearId, (int)$actor['id']);
        $this->success($response, $result, "Bulk clearance complete: {$result['cleared']} cleared, {$result['not_cleared']} pending.");
    }

    /** GET /api/finance/clearance/bulk?academic_year_id= */
    public function getBulkClearance(Request $request, Response $response): never
    {
        $yearId  = (int)($request->query('academic_year_id') ?? 0);
        if (!$yearId) $this->error($response, 'academic_year_id required.', 422);
        $page    = max(1, (int)($request->query('page')     ?? 1));
        $perPage = max(1, min(200, (int)($request->query('per_page') ?? 50)));

        $this->success($response, $this->clearanceModel->getBulkForYear($yearId, $page, $perPage), 'Clearance list retrieved.');
    }
}

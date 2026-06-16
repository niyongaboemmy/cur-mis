<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\FeeStructureModel;
use App\Models\FeeInvoiceModel;
use App\Models\FeePaymentModel;
use App\Models\FeeBursaryModel;
use App\Models\StudentFeeOverrideModel;
use App\Models\SponsorModel;
use App\Models\ExpenseModel;
use App\Models\ExpenseCategoryModel;
use App\Models\FeeTypeModel;
use App\Models\ExpenseBudgetModel;
use App\Models\ClearanceModel;
use App\Services\FeeService;
use App\Services\ClearanceService;
use App\Services\SystemLogService;
use App\Helpers\ValidationHelper;
use Core\Database;

class FeeController extends BaseController
{
    private FeeStructureModel       $structureModel;
    private FeeInvoiceModel         $invoiceModel;
    private FeePaymentModel         $paymentModel;
    private FeeBursaryModel         $bursaryModel;
    private StudentFeeOverrideModel $overrideModel;
    private SponsorModel            $sponsorModel;
    private ExpenseModel            $expenseModel;
    private ExpenseCategoryModel    $expenseCategoryModel;
    private FeeTypeModel            $feeTypeModel;
    private ExpenseBudgetModel      $budgetModel;
    private ClearanceModel          $clearanceModel;
    private FeeService              $service;
    private ClearanceService        $clearanceService;
    private Database                $db;

    public function __construct()
    {
        $this->structureModel       = new FeeStructureModel();
        $this->invoiceModel         = new FeeInvoiceModel();
        $this->paymentModel         = new FeePaymentModel();
        $this->bursaryModel         = new FeeBursaryModel();
        $this->overrideModel        = new StudentFeeOverrideModel();
        $this->sponsorModel         = new SponsorModel();
        $this->expenseModel         = new ExpenseModel();
        $this->expenseCategoryModel = new ExpenseCategoryModel();
        $this->feeTypeModel         = new FeeTypeModel();
        $this->budgetModel          = new ExpenseBudgetModel();
        $this->clearanceModel       = new ClearanceModel();
        $this->service              = new FeeService();
        $this->clearanceService     = new ClearanceService();
        $this->db                   = Database::getInstance();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Student self-service helpers
    // ──────────────────────────────────────────────────────────────────────────

    private function authStudentRegnumber(Request $request): ?string
    {
        $user = (array)($request->param('_auth_user') ?? []);
        if (!empty($user['regnumber'])) return (string)$user['regnumber'];

        $username = trim((string)($user['username'] ?? ''));
        if ($username !== '') {
            $row = $this->db->fetchOne(
                "SELECT regnumber FROM `student` WHERE regnumber = ? LIMIT 1",
                [$username]
            );
            if ($row && !empty($row['regnumber'])) return (string)$row['regnumber'];
        }

        $email = trim((string)($user['email'] ?? ''));
        if ($email !== '') {
            $row = $this->db->fetchOne(
                "SELECT regnumber FROM `student` WHERE email = ? LIMIT 1",
                [$email]
            );
            if ($row && !empty($row['regnumber'])) return (string)$row['regnumber'];
        }
        return null;
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
            'fee_type'         => 'required|in:' . implode(',', $this->getActiveFeeCodes()),
            'label'            => 'required|string|max:120',
            'amount'           => 'required|numeric',
        ]);
        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        // Derive a primary department_id for the legacy column (first in the array, or the scalar value)
        $deptIds = !empty($data['department_ids']) && is_array($data['department_ids'])
            ? array_map('intval', $data['department_ids'])
            : (!empty($data['department_id']) ? [(int)$data['department_id']] : []);

        $validPlans = ['full_year', 'per_semester', 'per_installment'];
        $paymentPlan = in_array($data['payment_plan'] ?? '', $validPlans, true)
            ? $data['payment_plan'] : 'full_year';

        $id = $this->structureModel->create([
            'academic_year_id'  => (int)$data['academic_year_id'],
            'department_id'     => !empty($deptIds) ? $deptIds[0] : null,
            'level_id'          => !empty($data['level_id'])  ? (int)$data['level_id']  : null,
            'fee_type'          => $data['fee_type'],
            'label'             => $data['label'],
            'amount'            => (float)$data['amount'],
            'semester'          => !empty($data['semester'])  ? (int)$data['semester']  : null,
            'payment_plan'      => $paymentPlan,
            'installment_count' => !empty($data['installment_count']) ? (int)$data['installment_count'] : null,
            'is_active'         => 1,
            'created_by'        => (int)$actor['id'],
        ]);

        if (!empty($deptIds)) {
            $this->structureModel->insertDepartmentLinks((int)$id, $deptIds);
        }

        SystemLogService::log('CREATE', 'FINANCE', "Created fee structure '{$data['label']}' ({$data['fee_type']}) — amount {$data['amount']}.", (int) $id, 'fee_structure', ['fee_type' => $data['fee_type'], 'amount' => (float) $data['amount']], (array) $actor ?: null);
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

        $validPlans = ['full_year', 'per_semester', 'per_installment'];
        $this->structureModel->update($id, array_filter([
            'label'             => $data['label']     ?? null,
            'amount'            => isset($data['amount'])    ? (float)$data['amount']    : null,
            'semester'          => isset($data['semester'])  ? (int)$data['semester']    : null,
            'payment_plan'      => isset($data['payment_plan']) && in_array($data['payment_plan'], $validPlans, true)
                                     ? $data['payment_plan'] : null,
            'installment_count' => isset($data['installment_count']) ? ((int)$data['installment_count'] ?: null) : null,
            'is_active'         => isset($data['is_active']) ? (int)$data['is_active']   : null,
        ], fn ($v) => $v !== null));

        if (isset($data['department_ids']) && is_array($data['department_ids'])) {
            $deptIds = array_map('intval', $data['department_ids']);
            $this->structureModel->insertDepartmentLinks($id, $deptIds);
            // Keep legacy column in sync
            if (!empty($deptIds)) {
                $this->structureModel->update($id, ['department_id' => $deptIds[0]]);
            }
        }

        $actor = $request->param('_auth_user');
        SystemLogService::log('UPDATE', 'FINANCE', "Updated fee structure ID {$id}.", $id, 'fee_structure', array_filter(['label' => $data['label'] ?? null, 'amount' => isset($data['amount']) ? (float)$data['amount'] : null], fn($v) => $v !== null), (array) $actor ?: null);
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
        $actor = $request->param('_auth_user');
        SystemLogService::log('DELETE', 'FINANCE', "Deleted fee structure ID {$id}.", $id, 'fee_structure', null, (array) $actor ?: null);
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

        $misPayments = $this->paymentModel->listWithDetails(['student_id' => $studentId], 1, 500);

        // Fetch ALL transactions from the legacy UrubutoPay/bank `payment` table
        // No student filter — return the full ledger so every bank/mobile payment is visible
        $legacyRows = $this->db->fetchAll(
            "SELECT trans_code, student, amount, `date`, fee_category, description,
                    external_transaction_id, payment_chanel, payment_notifi,
                    slip_no, acad_cycle_id, `status`, `action`
             FROM `payment`
             ORDER BY `date` DESC
             LIMIT 1000",
            []
        );

        $legacyPayments = array_map(function (array $row): array {
            $channel  = strtoupper(trim((string)($row['payment_chanel'] ?? '')));
            $method   = (str_contains($channel, 'USSD') || str_contains($channel, 'MOMO') || str_contains($channel, 'MOBILE'))
                ? 'MOBILE_MONEY'
                : 'BANK_TRANSFER';

            $cat      = strtolower(trim((string)($row['fee_category'] ?? '')));
            $feeType  = 'TUITION';
            if (str_contains($cat, 'registration') || str_contains($cat, 'reg-')) $feeType = 'REGISTRATION';
            elseif (str_contains($cat, 'hostel'))                                 $feeType = 'HOSTEL';
            elseif (str_contains($cat, 'module') || str_contains($cat, 'course') || str_contains($cat, 'cursu')) $feeType = 'MODULE_FEE';

            $notif    = strtolower(trim((string)($row['payment_notifi'] ?? $row['action'] ?? 'debit')));
            $isCredit = ($notif === 'credit');
            $amount   = (float)($row['amount'] ?? 0);

            return [
                'id'               => 0,
                'invoice_id'       => null,
                '_source'          => 'urubutopay',
                '_is_reversal'     => $isCredit,
                'student_id'       => (string)($row['student'] ?? ''),
                'amount'           => $amount,
                'payment_method'   => $method,
                'payment_sub_method' => null,
                'reference_number' => $row['external_transaction_id'] ?? $row['slip_no'] ?? null,
                'receipt_number'   => (string)($row['trans_code'] ?? ''),
                'bank_slip_file_id' => null,
                'status'           => 'confirmed',
                'paid_at'          => $row['date'] ?? null,
                'fee_type'         => $feeType,
                'fee_category'     => $row['fee_category'] ?? '',
                'description'      => $row['description'] ?? '',
                'notes'            => null,
                'recorded_by'      => null,
                'recorded_by_name' => 'UrubutoPay',
                'confirmed_by'     => null,
                'confirmed_at'     => $row['date'] ?? null,
                'rejection_reason' => null,
                'created_at'       => $row['date'] ?? null,
            ];
        }, $legacyRows);

        // Merge: MIS fee_payments first, then all legacy bank transactions
        $allPayments = array_merge($misPayments['data'] ?? [], $legacyPayments);

        $this->success($response, [
            'invoices' => $invoices,
            'payments' => $allPayments,
            'totals'   => $totals,
        ], 'Student ledger retrieved.');
    }

    /**
     * GET /api/finance/my/invoices
     * Student self-service: authenticated student's own ledger.
     */
    public function getMyInvoices(Request $request, Response $response): never
    {
        $reg = $this->authStudentRegnumber($request);
        if (!$reg) $this->error($response, 'No student profile linked to this account.', 404);

        $academicYearId = (int)($request->query('academic_year_id') ?? 0);
        $semester       = $request->query('semester') !== null
                            ? (int)$request->query('semester') : null;

        $filters = ['student_id' => $reg];
        if ($academicYearId)    $filters['academic_year_id'] = $academicYearId;
        if ($semester !== null) $filters['semester']         = $semester;

        $invoices = $this->invoiceModel->listWithDetails($filters);
        $totals   = $academicYearId
            ? $this->invoiceModel->getStudentLedgerTotals($reg, $academicYearId)
            : [];
        $misPayments = $this->paymentModel->listWithDetails(['student_id' => $reg], 1, 500);

        $legacyRows = $this->db->fetchAll(
            "SELECT trans_code, student, amount, `date`, fee_category, description,
                    external_transaction_id, payment_chanel, payment_notifi,
                    slip_no, acad_cycle_id, `status`, `action`
             FROM `payment`
             ORDER BY `date` DESC
             LIMIT 1000",
            []
        );

        $legacyPayments = array_map(function (array $row): array {
            $channel  = strtoupper(trim((string)($row['payment_chanel'] ?? '')));
            $method   = (str_contains($channel, 'USSD') || str_contains($channel, 'MOMO') || str_contains($channel, 'MOBILE'))
                ? 'MOBILE_MONEY'
                : 'BANK_TRANSFER';
            $cat      = strtolower(trim((string)($row['fee_category'] ?? '')));
            $feeType  = 'TUITION';
            if (str_contains($cat, 'registration') || str_contains($cat, 'reg-')) $feeType = 'REGISTRATION';
            elseif (str_contains($cat, 'hostel'))                                  $feeType = 'HOSTEL';
            elseif (str_contains($cat, 'module') || str_contains($cat, 'course') || str_contains($cat, 'cursu')) $feeType = 'MODULE_FEE';
            $notif    = strtolower(trim((string)($row['payment_notifi'] ?? $row['action'] ?? 'debit')));
            $isCredit = ($notif === 'credit');
            return [
                'id'               => 0,
                'invoice_id'       => null,
                '_source'          => 'urubutopay',
                '_is_reversal'     => $isCredit,
                'student_id'       => (string)($row['student'] ?? ''),
                'amount'           => (float)($row['amount'] ?? 0),
                'payment_method'   => $method,
                'payment_sub_method' => null,
                'reference_number' => $row['external_transaction_id'] ?? $row['slip_no'] ?? null,
                'receipt_number'   => (string)($row['trans_code'] ?? ''),
                'bank_slip_file_id' => null,
                'status'           => 'confirmed',
                'paid_at'          => $row['date'] ?? null,
                'fee_type'         => $feeType,
                'fee_category'     => $row['fee_category'] ?? '',
                'description'      => $row['description'] ?? '',
                'notes'            => null,
                'recorded_by'      => null,
                'recorded_by_name' => 'UrubutoPay',
                'confirmed_by'     => null,
                'confirmed_at'     => $row['date'] ?? null,
                'rejection_reason' => null,
                'created_at'       => $row['date'] ?? null,
            ];
        }, $legacyRows);

        $allPayments = array_merge($misPayments['data'] ?? [], $legacyPayments);

        $this->success($response, [
            'invoices' => $invoices,
            'payments' => $allPayments,
            'totals'   => $totals,
        ], 'Your finance ledger retrieved.');
    }

    /**
     * GET /api/finance/my/clearance
     * Student self-service: authenticated student's clearance status.
     */
    public function getMyClearance(Request $request, Response $response): never
    {
        $reg = $this->authStudentRegnumber($request);
        if (!$reg) $this->error($response, 'No student profile linked to this account.', 404);

        $yearId   = (int)($request->query('academic_year_id') ?? 0);
        $semester = $request->query('semester') !== null
                      ? (int)$request->query('semester') : null;

        if (!$yearId) $this->error($response, 'academic_year_id is required.', 422);

        $data = $this->clearanceService->getStatus($reg, $yearId, $semester);
        $this->success($response, $data, 'Clearance status retrieved.');
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

        SystemLogService::log('GENERATE', 'FINANCE', "Auto-generated invoices for student {$studentId} (year {$data['academic_year_id']}): {$result['created']} new, {$result['skipped']} skipped.", null, 'fee_invoice', ['student_id' => $studentId, 'created' => $result['created'], 'skipped' => $result['skipped']], (array) $actor ?: null);
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
            'fee_type'         => 'required|in:' . implode(',', $this->getActiveFeeCodes()),
            'description'      => 'required|string|max:200',
            'amount_due'       => 'required|numeric',
        ]);
        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $id = $this->invoiceModel->create([
            'invoice_number'   => $this->service->generateInvoiceNumber(),
            'student_id'       => $data['student_id'],
            'fee_structure_id' => !empty($data['fee_structure_id']) ? (int)$data['fee_structure_id'] : null,
            'academic_year_id' => (int)$data['academic_year_id'],
            'semester'         => !empty($data['semester']) ? (int)$data['semester'] : null,
            'fee_type'         => $data['fee_type'],
            'description'      => $data['description'],
            'amount_due'       => (float)$data['amount_due'],
            'due_date'         => $data['due_date'] ?? null,
            'is_system_generated' => 0,
            'created_by'       => (int)$actor['id'],
        ]);

        SystemLogService::log('CREATE', 'FINANCE', "Created manual invoice for student {$data['student_id']} ({$data['fee_type']}): {$data['amount_due']}.", (int) $id, 'fee_invoice', ['fee_type' => $data['fee_type'], 'amount' => (float) $data['amount_due']], (array) $actor ?: null);
        $this->success($response, ['id' => (int)$id], 'Invoice created.', 201);
    }

    /**
     * POST /api/finance/billing/bulk-generate
     */
    public function bulkGenerateInvoices(Request $request, Response $response): never
    {
        $data       = $request->body();
        $actor      = $request->param('_auth_user');
        $studentIds = $data['student_ids'] ?? [];
        $yearId     = (int)($data['academic_year_id'] ?? 0);
        $semester   = isset($data['semester']) ? (int)$data['semester'] : null;

        if (!$yearId) {
            $this->error($response, 'Academic Year is required.', 400);
        }

        if (empty($studentIds)) {
            // Attempt to generate by filters
            $filters = [
                'academic_year_id' => $yearId,
                'semester'         => $semester,
                'faculty_id'       => $data['faculty_id'] ?? null,
                'department_id'    => $data['department_id'] ?? null,
            ];
            $result = $this->service->bulkGenerateByFilters($filters, (int)$actor['id']);
        } else {
            $result = $this->service->bulkGenerateInvoices($studentIds, $yearId, $semester, (int)$actor['id']);
        }

        SystemLogService::log('GENERATE', 'FINANCE', "Bulk generated invoices for year {$yearId}: {$result['processed_students']} students processed.", null, 'fee_invoice', ['processed_students' => $result['processed_students'], 'academic_year_id' => $yearId], (array) $actor ?: null);
        $this->success($response, $result, "Bulk generation complete: processed {$result['processed_students']} students.");
    }

    /**
     * GET /api/finance/billing/summary
     */
    public function listBillingSummary(Request $request, Response $response): never
    {
        $filters = [
            'academic_year_id' => (int)($request->query('academic_year_id') ?? 0),
            'semester'         => $request->query('semester') !== null ? (int)$request->query('semester') : null,
            'faculty_id'       => $request->query('faculty_id') !== null ? (int)$request->query('faculty_id') : null,
            'department_id'    => $request->query('department_id') !== null ? (int)$request->query('department_id') : null,
            'keyword'          => $request->query('keyword') ?? null,
            'balance_filter'   => $request->query('balance_filter') ?? null, // collected|bursary|pending|partial|overdue
            'page'             => (int)($request->query('page') ?? 1),
            'per_page'         => (int)($request->query('per_page') ?? 50),
        ];

        if (!$filters['academic_year_id']) {
            $this->error($response, 'Academic Year is required.', 400);
        }

        try {
            $summary = $this->service->getGroupBillingSummary($filters);
            $this->success($response, $summary, 'Billing summary retrieved.');
        } catch (\InvalidArgumentException $e) {
            $this->error($response, $e->getMessage(), 400);
        }
    }

    /**
     * GET /api/finance/billing/export
     */
    public function exportBillingSummary(Request $request, Response $response): never
    {
        $actor   = $request->param('_auth_user');
        $filters = [
            'academic_year_id' => (int)($request->query('academic_year_id') ?? 0),
            'semester'         => $request->query('semester') !== null ? (int)$request->query('semester') : null,
            'faculty_id'       => $request->query('faculty_id') !== null ? (int)$request->query('faculty_id') : null,
            'department_id'    => $request->query('department_id') !== null ? (int)$request->query('department_id') : null,
            'keyword'          => $request->query('keyword') ?? null,
        ];

        if (!$filters['academic_year_id']) {
            $this->error($response, 'Academic Year is required for export.', 400);
        }

        $csv = $this->service->exportBillingSummary($filters);

        SystemLogService::log('EXPORT', 'FINANCE', "Exported billing summary for year {$filters['academic_year_id']}.", null, null, array_filter($filters, fn($v) => $v !== null), (array) $actor ?: null);
        $filename = "billing_summary_" . date('Y-m-d_His') . ".csv";
        header("Content-Type: text/csv");
        header("Content-Disposition: attachment; filename=\"{$filename}\"");
        echo $csv;
        exit;
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

        $actor = $request->param('_auth_user');
        SystemLogService::log('UPDATE', 'FINANCE', "Updated invoice ID {$id}.", $id, 'fee_invoice', $update ?: null, (array) $actor ?: null);
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
     * GET /api/finance/online-payments
     * List all legacy online payments from the `payment` table.
     */
    public function listOnlinePaymentsHistory(Request $request, Response $response): never
    {
        $page    = max(1, (int)($request->query('page') ?? 1));
        $perPage = max(1, min(100, (int)($request->query('per_page') ?? 20)));
        $keyword = $request->query('keyword') ?? '';

        $offset = ($page - 1) * $perPage;

        $whereClause = "1=1";
        $params = [];

        if ($keyword) {
            $whereClause .= " AND (student LIKE ? OR slip_no LIKE ? OR trans_code LIKE ?)";
            $search = "%{$keyword}%";
            $params = [$search, $search, $search];
        }

        $countQuery = "SELECT COUNT(*) as total FROM `payment` WHERE $whereClause";
        $totalRow = $this->db->fetchOne($countQuery, $params);
        $total = (int)($totalRow['total'] ?? 0);

        $query = "SELECT * FROM `payment` WHERE $whereClause ORDER BY `date` DESC LIMIT $perPage OFFSET $offset";
        $data = $this->db->fetchAll($query, $params);

        // Fetch basic dashboard metrics for online payments
        $metricsQuery = "SELECT COUNT(*) as total_tx, SUM(amount) as total_amount FROM `payment`";
        $metrics = $this->db->fetchOne($metricsQuery);

        $this->success($response, [
            'data' => $data,
            'pagination' => [
                'current_page' => $page,
                'per_page'     => $perPage,
                'total'        => $total,
                'last_page'    => ceil($total / $perPage),
            ],
            'metrics' => [
                'total_transactions' => (int)($metrics['total_tx'] ?? 0),
                'total_amount'       => (float)($metrics['total_amount'] ?? 0),
            ]
        ], 'Online payments history retrieved.');
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

        // Ensure payment_sub_method is present if provided
        $data['payment_sub_method'] = $data['payment_sub_method'] ?? null;


        try {
            $result = $this->service->recordPayment($data, (int)$actor['id']);
        } catch (\RuntimeException $e) {
            $this->error($response, $e->getMessage(), 422);
        }

        // Non-blocking email confirmation
        $this->service->sendPaymentConfirmationEmail((int)$result['payment_id']);

        SystemLogService::log('CREATE', 'FINANCE', "Recorded payment of {$data['amount']} for invoice {$data['invoice_id']} (ID {$result['payment_id']}).", (int) $result['payment_id'], 'fee_payment', ['method' => $data['payment_method'], 'amount' => (float) $data['amount']], (array) $actor ?: null);
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
        $id      = (int)$request->param('id');
        $actor   = $request->param('_auth_user');
        $data    = $request->body();
        $payment = $this->paymentModel->find($id);

        if (!$payment)                        $this->error($response, 'Payment not found.', 404);
        if ($payment['status'] !== 'pending') $this->error($response, 'Only pending payments can be approved.', 422);

        // Optional invoice reassignment: allow finance officer to correct a wrong invoice
        $newInvoiceId = !empty($data['invoice_id']) ? (int)$data['invoice_id'] : null;
        if ($newInvoiceId && $newInvoiceId !== (int)$payment['invoice_id']) {
            $newInvoice = $this->invoiceModel->find($newInvoiceId);
            if (!$newInvoice || $newInvoice['student_id'] !== $payment['student_id']) {
                $this->error($response, 'The specified invoice does not belong to this student.', 422);
            }
            $this->paymentModel->update($id, ['invoice_id' => $newInvoiceId]);
            $payment['invoice_id'] = $newInvoiceId;
        }

        // Mark payment confirmed
        $this->paymentModel->update($id, [
            'status'       => 'confirmed',
            'confirmed_by' => (int)$actor['id'],
            'confirmed_at' => date('Y-m-d H:i:s'),
        ]);

        // Now update invoice balance
        $this->invoiceModel->applyPayment((int)$payment['invoice_id'], (float)$payment['amount']);

        // Auto-recompute financial clearance so student status is immediately up to date
        $invoice = $this->invoiceModel->find((int)$payment['invoice_id']);
        if ($invoice && !empty($invoice['student_id']) && !empty($invoice['academic_year_id'])) {
            try {
                $this->clearanceService->computeAndSave(
                    (string)$invoice['student_id'],
                    (int)$invoice['academic_year_id'],
                    null,
                    (int)($actor['id'] ?? 0)
                );
            } catch (\Throwable $e) {
                error_log('[Clearance ERROR] approvePayment: ' . $e->getMessage());
            }
        }

        // Send email receipt
        $this->service->sendPaymentConfirmationEmail($id);

        SystemLogService::log('APPROVE', 'FINANCE', "Approved payment ID {$id} (amount {$payment['amount']}) for invoice {$payment['invoice_id']}.", $id, 'fee_payment', ['amount' => (float) $payment['amount']], (array) $actor ?: null);
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

        SystemLogService::log('REJECT', 'FINANCE', "Rejected payment ID {$id}. Reason: " . ($data['reason'] ?? 'N/A') . ".", $id, 'fee_payment', ['reason' => $data['reason'] ?? null], (array) $actor ?: null);
        $this->success($response, null, 'Payment rejected.');
    }

    /**
     * GET /api/finance/payments/pending-count
     */
    public function getPendingPaymentCount(Request $request, Response $response): never
    {
        $count = $this->paymentModel->getPendingCount();
        $this->success($response, ['count' => $count], 'Pending count retrieved.');
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
            'status'           => $request->query('status')            ?? '',
            'bursary_type'     => $request->query('bursary_type')     ?? '',
            'sponsor_id'       => $request->query('sponsor_id'),
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
            'sponsor_id'       => isset($data['sponsor_id']) ? (int)$data['sponsor_id'] : null,
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

        SystemLogService::log('CREATE', 'FINANCE', "Created bursary for student {$data['student_id']} ({$data['bursary_type']}): {$data['amount']}.", (int) $id, 'fee_bursary', ['amount' => (float) $data['amount'], 'type' => $data['bursary_type']], (array) $actor ?: null);
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
        $actor = $request->param('_auth_user');
        SystemLogService::log('DELETE', 'FINANCE', "Deleted bursary ID {$id}.", $id, 'fee_bursary', null, (array) $actor ?: null);
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

        SystemLogService::log('APPROVE', 'FINANCE', "Confirmed bursary ID {$id} for student {$bursary['student_id']}.", $id, 'fee_bursary', null, (array) $actor ?: null);
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

        SystemLogService::log('UPDATE', 'FINANCE', "Cancelled bursary ID {$id} for student {$bursary['student_id']}.", $id, 'fee_bursary', null, (array) $actor ?: null);
        $this->success($response, null, 'Bursary cancelled.');
    }

    /**
     * PUT /api/finance/bursaries/:id
     */
    public function updateBursary(Request $request, Response $response): never
    {
        $id    = (int)$request->param('id');
        $data  = $request->body();
        $actor = $request->param('_auth_user');

        $bursary = $this->bursaryModel->find($id);
        if (!$bursary) $this->error($response, 'Bursary not found.', 404);

        $errors = ValidationHelper::validate($data, [
            'amount'           => 'numeric',
            'coverage_pct'     => 'numeric|nullable',
            'bursary_type'     => 'string',
            'sponsor_id'       => 'numeric',
            'status'           => 'in:pending,confirmed,cancelled',
        ]);
        if (!empty($errors)) $this->error($response, 'Validation failed.', 422, $errors);

        $updateData = [];
        if (isset($data['amount']))           $updateData['amount']       = (float)$data['amount'];
        if (isset($data['coverage_pct']))     $updateData['coverage_pct'] = (float)$data['coverage_pct'];
        if (isset($data['bursary_type']))     $updateData['bursary_type'] = $data['bursary_type'];
        if (isset($data['notes']))            $updateData['notes']        = $data['notes'];
        if (isset($data['status']))           $updateData['status']       = $data['status'];
        
        if (array_key_exists('sponsor_id', $data)) {
            $updateData['sponsor_id'] = ($data['sponsor_id'] !== null && $data['sponsor_id'] !== '') 
                ? (int)$data['sponsor_id'] 
                : null;
        }

        // Handle confirmation details if status is moving to confirmed
        if (isset($data['status']) && $data['status'] === 'confirmed' && $bursary['status'] !== 'confirmed') {
            $updateData['confirmed_at'] = date('Y-m-d H:i:s');
            $updateData['confirmed_by'] = (int)$actor['id'];
        }

        $this->bursaryModel->update($id, $updateData);

        // Re-apply bursaries if either old or new status is confirmed
        if ($bursary['status'] === 'confirmed' || (isset($data['status']) && $data['status'] === 'confirmed')) {
            $this->service->applyBursaries(
                $bursary['student_id'],
                (int)$bursary['academic_year_id'],
                (int)$actor['id']
            );
        }

        SystemLogService::log('UPDATE', 'FINANCE', "Updated bursary ID {$id} for student {$bursary['student_id']}.", $id, 'fee_bursary', $updateData ?: null, (array) $actor ?: null);
        $this->success($response, null, 'Bursary updated.');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Sponsors
    // ──────────────────────────────────────────────────────────────────────────

    /** GET /api/finance/sponsors */
    public function listSponsors(Request $request, Response $response): never
    {
        $activeOnly = $request->query('is_active') !== null
            ? (bool)(int)$request->query('is_active')
            : false;
        
        $yearId = (int)($request->query('academic_year_id') ?? 0);

        if ($yearId) {
            $data = $this->sponsorModel->listWithSummaries($yearId, $activeOnly);
            
            // Handle unassigned bursaries
            $unassigned = $this->bursaryModel->getUnassignedSummary($yearId);
            if ($unassigned && (float)$unassigned['total_amount'] > 0) {
                $data[] = [
                    'id'               => 'unassigned', // Use string ID for clarity
                    'name'             => 'Unassigned / General',
                    'email'            => null,
                    'phone'            => null,
                    'is_active'        => 1,
                    'total_amount'     => $unassigned['total_amount'],
                    'confirmed_amount' => $unassigned['confirmed_amount'],
                    'bursary_count'    => $unassigned['bursary_count'],
                    'student_count'    => $unassigned['student_count'],
                    'is_virtual'       => true
                ];
            }
        } else {
            $data = $this->sponsorModel->listAll($activeOnly);
        }

        $this->success($response, $data, 'Sponsors retrieved.');
    }

    /** POST /api/finance/sponsors */
    public function createSponsor(Request $request, Response $response): never
    {
        $data   = $request->body();
        $errors = ValidationHelper::validate($data, [
            'name' => 'required|string|max:150',
        ]);
        if (!empty($errors)) $this->error($response, 'Validation failed.', 422, $errors);

        $id = $this->sponsorModel->create([
            'name'      => $data['name'],
            'email'     => $data['email']     ?? null,
            'phone'     => $data['phone']     ?? null,
            'is_active' => isset($data['is_active']) ? (int)$data['is_active'] : 1,
        ]);
        $actor = $request->param('_auth_user');
        SystemLogService::log('CREATE', 'FINANCE', "Created sponsor '{$data['name']}' (ID {$id}).", (int) $id, 'sponsor', null, (array) $actor ?: null);
        $this->success($response, ['id' => (int)$id], 'Sponsor created.', 201);
    }

    /** PUT /api/finance/sponsors/:id */
    public function updateSponsor(Request $request, Response $response): never
    {
        $id   = (int)$request->param('id');
        $data = $request->body();
        if (!$this->sponsorModel->find($id)) $this->error($response, 'Sponsor not found.', 404);

        $this->sponsorModel->update($id, array_filter([
            'name'      => $data['name']      ?? null,
            'email'     => $data['email']     ?? null,
            'phone'     => $data['phone']     ?? null,
            'is_active' => isset($data['is_active']) ? (int)$data['is_active'] : null,
        ], fn ($v) => $v !== null));

        $actor = $request->param('_auth_user');
        SystemLogService::log('UPDATE', 'FINANCE', "Updated sponsor ID {$id}.", $id, 'sponsor', null, (array) $actor ?: null);
        $this->success($response, null, 'Sponsor updated.');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Student Fee Overrides
    // ──────────────────────────────────────────────────────────────────────────

    /** GET /api/finance/overrides?student_id=&academic_year_id= */
    public function listOverrides(Request $request, Response $response): never
    {
        $studentId = $request->query('student_id')       ?? '';
        $yearId    = (int)($request->query('academic_year_id') ?? 0);
        if (!$studentId || !$yearId) $this->error($response, 'student_id and academic_year_id required.', 422);
        $this->success($response, $this->overrideModel->listForStudent($studentId, $yearId), 'Overrides retrieved.');
    }

    /** POST /api/finance/overrides */
    public function createOverride(Request $request, Response $response): never
    {
        $data  = $request->body();
        $actor = $request->param('_auth_user');
        $errors = ValidationHelper::validate($data, [
            'student_id'       => 'required|string',
            'academic_year_id' => 'required|numeric',
            'fee_type'         => 'required|in:' . implode(',', $this->getActiveFeeCodes()),
            'amount'           => 'required|numeric',
        ]);
        if (!empty($errors)) $this->error($response, 'Validation failed.', 422, $errors);

        $this->overrideModel->upsert([
            'student_id'       => $data['student_id'],
            'academic_year_id' => (int)$data['academic_year_id'],
            'fee_type'         => $data['fee_type'],
            'amount'           => (float)$data['amount'],
            'reason'           => $data['reason'] ?? '',
            'created_by'       => (int)$actor['id'],
        ]);
        SystemLogService::log('CREATE', 'FINANCE', "Set fee override for student {$data['student_id']} ({$data['fee_type']}): {$data['amount']}.", null, 'student_fee_override', ['student_id' => $data['student_id'], 'fee_type' => $data['fee_type'], 'amount' => (float) $data['amount']], (array) $actor ?: null);
        $this->success($response, null, 'Override saved.', 201);
    }

    /** DELETE /api/finance/overrides/:id */
    public function deleteOverride(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        if (!$this->overrideModel->find($id)) $this->error($response, 'Override not found.', 404);
        $this->overrideModel->delete($id);
        $actor = $request->param('_auth_user');
        SystemLogService::log('DELETE', 'FINANCE', "Deleted fee override ID {$id}.", $id, 'student_fee_override', null, (array) $actor ?: null);
        $this->success($response, null, 'Override deleted.');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Bulk Bursary Upload (sponsor-driven)
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * POST /api/finance/bursaries/bulk
     * Accepts student_ids as an array OR a CSV text blob (one regnumber per line).
     */
    public function bulkCreateBursaries(Request $request, Response $response): never
    {
        $data  = $request->body();
        $actor = $request->param('_auth_user');

        $errors = ValidationHelper::validate($data, [
            'academic_year_id'   => 'required|numeric',
            'bursary_type'       => 'required|string|max:80',
            'amount_per_student' => 'required|numeric',
        ]);
        if (!empty($errors)) $this->error($response, 'Validation failed.', 422, $errors);

        // Accept either an array or a newline/comma-separated text blob
        if (!empty($data['student_ids']) && is_array($data['student_ids'])) {
            $studentIds = $data['student_ids'];
        } elseif (!empty($data['student_ids_text'])) {
            $studentIds = preg_split('/[\r\n,]+/', (string)$data['student_ids_text'], -1, PREG_SPLIT_NO_EMPTY);
        } else {
            $this->error($response, 'student_ids or student_ids_text is required.', 422);
        }

        $result = $this->service->bulkCreateBursaries(
            $studentIds,
            (int)$data['academic_year_id'],
            (float)$data['amount_per_student'],
            $data['bursary_type'],
            !empty($data['sponsor_id']) ? (int)$data['sponsor_id'] : null,
            (int)$actor['id']
        );

        SystemLogService::log('CREATE', 'FINANCE', "Bulk bursary for '{$data['bursary_type']}' (year {$data['academic_year_id']}): {$result['created']} created, {$result['skipped']} skipped.", null, 'fee_bursary', ['bursary_type' => $data['bursary_type'], 'amount_per_student' => (float) $data['amount_per_student'], 'created' => $result['created']], (array) $actor ?: null);
        $this->success($response, $result, "Bulk bursary complete: {$result['created']} created, {$result['skipped']} skipped.");
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

        SystemLogService::log('UPDATE', 'FINANCE', "Saved expense budget for category {$data['category_id']} (year {$data['academic_year_id']}): {$data['amount']}.", null, 'expense_budget', ['category_id' => (int) $data['category_id'], 'amount' => (float) $data['amount']], (array) $actor ?: null);
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

    /** GET /api/finance/reports/monthly */
    public function getMonthlyCollections(Request $request, Response $response): never
    {
        $yearId = (int)($request->query('academic_year_id') ?? 0);
        if (!$yearId) $this->error($response, 'academic_year_id is required.', 422);
        $this->success($response, $this->service->getMonthlyCollections($yearId), 'Monthly data retrieved.');
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
        $actor  = $request->param('_auth_user');
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

        SystemLogService::log('EXPORT', 'FINANCE', "Exported {$type} report" . ($yearId ? " for year {$yearId}" : '') . ".", null, null, ['type' => $type, 'academic_year_id' => $yearId ?: null], (array) $actor ?: null);
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

    // ──────────────────────────────────────────────────────────────────────────
    // Fee Types CRUD
    // ──────────────────────────────────────────────────────────────────────────

    private ?array $_feeCodeCache = null;

    private function getActiveFeeCodes(): array
    {
        if ($this->_feeCodeCache === null) {
            $this->_feeCodeCache = array_column(
                array_filter(
                    $this->feeTypeModel->listAll(),
                    fn ($t) => (int)$t['is_active'] === 1
                ),
                'code'
            );
        }
        return $this->_feeCodeCache;
    }

    /** GET /api/finance/fee-types */
    public function listFeeTypes(Request $request, Response $response): never
    {
        $this->success($response, $this->feeTypeModel->listAll(), 'Fee types retrieved.');
    }

    /** POST /api/finance/fee-types */
    public function createFeeType(Request $request, Response $response): never
    {
        $data  = $request->body();
        $actor = $request->param('_auth_user');

        $errors = ValidationHelper::validate($data, [
            'code'  => 'required|string|max:50',
            'label' => 'required|string|max:100',
        ]);
        if (!empty($errors)) $this->error($response, 'Validation failed.', 422, $errors);

        $code = strtoupper(trim((string)($data['code'] ?? '')));
        if (!preg_match('/^[A-Z][A-Z0-9_]{0,49}$/', $code)) {
            $this->error($response, 'Code must start with a letter and contain only uppercase letters, digits, and underscores.', 422);
        }
        if ($this->feeTypeModel->findByCode($code)) {
            $this->error($response, "Fee type code '{$code}' already exists.", 422);
        }

        $id = $this->feeTypeModel->createWithCode([
            'code'        => $code,
            'label'       => trim($data['label']),
            'description' => isset($data['description']) ? trim($data['description']) : null,
            'is_active'   => isset($data['is_active'])   ? (int)(bool)$data['is_active'] : 1,
            'sort_order'  => isset($data['sort_order'])  ? (int)$data['sort_order'] : 0,
        ]);

        SystemLogService::log('CREATE', 'FINANCE', "Created fee type '{$code}' ('{$data['label']}') ID {$id}.", (int)$id, 'fee_type', ['code' => $code], (array)$actor ?: null);
        $this->success($response, ['id' => (int)$id], 'Fee type created.', 201);
    }

    /** PUT /api/finance/fee-types/:id */
    public function updateFeeType(Request $request, Response $response): never
    {
        $id    = (int)$request->param('id');
        $data  = $request->body();
        $actor = $request->param('_auth_user');

        $existing = $this->feeTypeModel->find($id);
        if (!$existing) $this->error($response, 'Fee type not found.', 404);

        $errors = ValidationHelper::validate($data, ['label' => 'required|string|max:100']);
        if (!empty($errors)) $this->error($response, 'Validation failed.', 422, $errors);

        $this->feeTypeModel->update($id, array_filter([
            'label'       => trim($data['label']),
            'description' => isset($data['description']) ? trim($data['description']) : null,
            'is_active'   => isset($data['is_active'])   ? (int)(bool)$data['is_active'] : null,
            'sort_order'  => isset($data['sort_order'])  ? (int)$data['sort_order'] : null,
        ], fn ($v) => $v !== null));

        SystemLogService::log('UPDATE', 'FINANCE', "Updated fee type ID {$id} ('{$existing['code']}').", $id, 'fee_type', null, (array)$actor ?: null);
        $this->success($response, null, 'Fee type updated.');
    }

    /** DELETE /api/finance/fee-types/:id */
    public function deleteFeeType(Request $request, Response $response): never
    {
        $id    = (int)$request->param('id');
        $actor = $request->param('_auth_user');

        $type = $this->feeTypeModel->find($id);
        if (!$type) $this->error($response, 'Fee type not found.', 404);

        if ($this->feeTypeModel->isCodeInUse($type['code'])) {
            $this->error($response, "Cannot delete fee type '{$type['code']}' because it is referenced by existing fee structures or invoices.", 422);
        }

        $this->feeTypeModel->delete($id);
        SystemLogService::log('DELETE', 'FINANCE', "Deleted fee type ID {$id} ('{$type['code']}').", $id, 'fee_type', null, (array)$actor ?: null);
        $this->success($response, null, 'Fee type deleted.');
    }

    /** GET /api/finance/expenses/categories */
    public function listExpenseCategories(Request $request, Response $response): never
    {
        $this->success($response, $this->expenseCategoryModel->listAll(), 'Categories retrieved.');
    }

    /** POST /api/finance/expenses/categories */
    public function createExpenseCategory(Request $request, Response $response): never
    {
        $data = $request->body();
        $errors = ValidationHelper::validate($data, [
            'name' => 'required|string|max:80'
        ]);
        if (!empty($errors)) $this->error($response, 'Validation failed.', 422, $errors);

        $id = $this->expenseCategoryModel->create([
            'name'        => $data['name'],
            'description' => $data['description'] ?? null
        ]);

        $actor = $request->param('_auth_user');
        SystemLogService::log('CREATE', 'FINANCE', "Created expense category '{$data['name']}' (ID {$id}).", (int) $id, 'expense_category', null, (array) $actor ?: null);
        $this->success($response, ['id' => (int)$id], 'Category created.', 201);
    }

    /** PUT /api/finance/expenses/categories/:id */
    public function updateExpenseCategory(Request $request, Response $response): never
    {
        $id   = (int)$request->param('id');
        $data = $request->body();
        if (!$this->expenseCategoryModel->find($id)) $this->error($response, 'Category not found.', 404);

        $this->expenseCategoryModel->update($id, array_filter([
            'name'        => $data['name'] ?? null,
            'description' => $data['description'] ?? null
        ], fn($v) => $v !== null));

        $actor = $request->param('_auth_user');
        SystemLogService::log('UPDATE', 'FINANCE', "Updated expense category ID {$id}.", $id, 'expense_category', null, (array) $actor ?: null);
        $this->success($response, null, 'Category updated.');
    }

    /** DELETE /api/finance/expenses/categories/:id */
    public function deleteExpenseCategory(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $cat = $this->expenseCategoryModel->find($id);
        if (!$cat) $this->error($response, 'Category not found.', 404);

        // Check if in use
        $row   = $this->db->fetchOne("SELECT COUNT(*) AS cnt FROM `expenses` WHERE category_id = ?", [$id]);
        $count = (int)($row['cnt'] ?? 0);
        if ($count > 0) $this->error($response, 'Cannot delete category that is currently in use by recorded expenses.', 422);

        $this->expenseCategoryModel->delete($id);
        $actor = $request->param('_auth_user');
        SystemLogService::log('DELETE', 'FINANCE', "Deleted expense category ID {$id} ('{$cat['name']}').", $id, 'expense_category', null, (array) $actor ?: null);
        $this->success($response, null, 'Category deleted.');
    }

    /** POST /api/finance/expenses */
    public function createExpense(Request $request, Response $response): never
    {
        $data  = $request->body();
        $actor = $request->param('_auth_user');

        $errors = ValidationHelper::validate($data, [
            'category_id'      => 'required|numeric',
            'academic_year_id' => 'required|numeric',
            'title'            => 'required|string|max:150',
            'amount'           => 'required|numeric',
            'payment_date'     => 'required|string',
        ]);
        if (!empty($errors)) $this->error($response, 'Validation failed.', 422, $errors);
        if ((float)($data['amount'] ?? 0) <= 0)
            $this->error($response, 'Amount must be greater than zero.', 422);
        if (!\DateTime::createFromFormat('Y-m-d', $data['payment_date'] ?? ''))
            $this->error($response, 'Invalid payment date format (YYYY-MM-DD required).', 422);

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

        SystemLogService::log('CREATE', 'FINANCE', "Recorded expense '{$data['title']}': {$data['amount']}.", (int) $id, 'expense', ['amount' => (float) $data['amount'], 'category_id' => (int) $data['category_id']], (array) $actor ?: null);
        $this->success($response, ['id' => (int)$id], 'Expense recorded.', 201);
    }

    /** PUT /api/finance/expenses/:id */
    public function updateExpense(Request $request, Response $response): never
    {
        $id   = (int)$request->param('id');
        $data = $request->body();
        if (!$this->expenseModel->find($id)) $this->error($response, 'Expense not found.', 404);
        if (isset($data['amount']) && (float)$data['amount'] <= 0)
            $this->error($response, 'Amount must be greater than zero.', 422);
        if (isset($data['payment_date']) && !\DateTime::createFromFormat('Y-m-d', $data['payment_date']))
            $this->error($response, 'Invalid payment date format (YYYY-MM-DD required).', 422);

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

        $actor = $request->param('_auth_user');
        SystemLogService::log('UPDATE', 'FINANCE', "Updated expense ID {$id}.", $id, 'expense', null, (array) $actor ?: null);
        $this->success($response, null, 'Expense updated.');
    }

    /** DELETE /api/finance/expenses/:id */
    public function deleteExpense(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        if (!$this->expenseModel->find($id)) $this->error($response, 'Expense not found.', 404);
        $this->expenseModel->delete($id);
        $actor = $request->param('_auth_user');
        SystemLogService::log('DELETE', 'FINANCE', "Deleted expense ID {$id}.", $id, 'expense', null, (array) $actor ?: null);
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

    /**
     * GET /api/finance/clearance/exam-eligibility
     * ?student_id=&academic_year_id=&semester=1|2
     *
     * Dedicated endpoint for payment-plan-aware exam access check.
     * Returns per-fee-type breakdown with installment schedule.
     */
    public function getExamEligibility(Request $request, Response $response): never
    {
        $studentId = $request->query('student_id')       ?? '';
        $yearId    = (int)($request->query('academic_year_id') ?? 0);
        $semester  = (int)($request->query('semester') ?? 0);

        if (!$studentId || !$yearId || !in_array($semester, [1, 2], true)) {
            $this->error($response, 'student_id, academic_year_id, and semester (1 or 2) are required.', 422);
        }

        $data = $this->clearanceService->getExamEligibility($studentId, $yearId, $semester);
        $this->success($response, $data, 'Exam eligibility computed.');
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

        SystemLogService::log('UPDATE', 'FINANCE', "Granted manual clearance to student {$data['student_id']} for year {$data['academic_year_id']}.", null, 'clearance', ['student_id' => $data['student_id'], 'notes' => $data['notes'] ?? ''], (array) $actor ?: null);
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
        SystemLogService::log('UPDATE', 'FINANCE', "Ran bulk clearance for year {$yearId}: {$result['cleared']} cleared, {$result['not_cleared']} pending.", null, 'clearance', ['year_id' => $yearId, 'cleared' => $result['cleared'], 'not_cleared' => $result['not_cleared']], (array) $actor ?: null);
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

    /**
     * GET /api/finance/clearance/report
     * ?academic_year_id=&fee_structure_id=&period=full_year|semester_1|semester_2|installment_N
     */
    public function getClearanceReport(Request $request, Response $response): never
    {
        $yearId          = (int)($request->query('academic_year_id')  ?? 0);
        $feeStructureId  = (int)($request->query('fee_structure_id')  ?? 0);
        $period          = trim($request->query('period') ?? 'full_year');

        if (!$yearId || !$feeStructureId) {
            $this->error($response, 'academic_year_id and fee_structure_id are required.', 422);
        }

        // Validate period format
        $validPeriod = $period === 'full_year'
            || preg_match('/^semester_[12]$/', $period)
            || preg_match('/^installment_\d+$/', $period);
        if (!$validPeriod) {
            $this->error($response, 'Invalid period. Use full_year, semester_1, semester_2, or installment_N.', 422);
        }

        try {
            $data = $this->clearanceService->getReport($yearId, $feeStructureId, $period);
        } catch (\InvalidArgumentException $e) {
            $this->error($response, $e->getMessage(), 404);
        }

        $this->success($response, $data, 'Clearance report generated.');
    }
}

<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\FeeStructureModel;
use App\Models\PgIntlFeeStructureModel;
use App\Models\FeeInvoiceModel;
use App\Models\FeePaymentModel;
use App\Models\FeeBursaryModel;
use App\Models\StudentFeeOverrideModel;
use App\Models\SponsorModel;
use App\Models\ExpenseModel;
use App\Models\ExpenseCategoryModel;
use App\Models\FeeTypeModel;
use App\Models\ClearanceModel;
use App\Models\StudentApplicationModel;
use App\Services\FeeService;
use App\Services\ClearanceService;
use App\Services\SystemLogService;
use App\Helpers\ValidationHelper;
use Core\Database;

class FeeController extends BaseController
{
    private FeeStructureModel       $structureModel;
    private PgIntlFeeStructureModel $pgIntlStructureModel;
    private FeeInvoiceModel         $invoiceModel;
    private FeePaymentModel         $paymentModel;
    private FeeBursaryModel         $bursaryModel;
    private StudentFeeOverrideModel $overrideModel;
    private SponsorModel            $sponsorModel;
    private ExpenseModel            $expenseModel;
    private ExpenseCategoryModel    $expenseCategoryModel;
    private FeeTypeModel            $feeTypeModel;
    private ClearanceModel          $clearanceModel;
    private StudentApplicationModel $applicationModel;
    private FeeService              $service;
    private ClearanceService        $clearanceService;
    private Database                $db;

    public function __construct()
    {
        $this->structureModel       = new FeeStructureModel();
        $this->pgIntlStructureModel = new PgIntlFeeStructureModel();
        $this->invoiceModel         = new FeeInvoiceModel();
        $this->paymentModel         = new FeePaymentModel();
        $this->bursaryModel         = new FeeBursaryModel();
        $this->overrideModel        = new StudentFeeOverrideModel();
        $this->sponsorModel         = new SponsorModel();
        $this->expenseModel         = new ExpenseModel();
        $this->expenseCategoryModel = new ExpenseCategoryModel();
        $this->feeTypeModel         = new FeeTypeModel();
        $this->clearanceModel       = new ClearanceModel();
        $this->applicationModel     = new StudentApplicationModel();
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
            'campus_id'        => $request->query('campus_id') !== null
                                    ? ((int)$request->query('campus_id') ?: null) : null,
            'student_category' => $request->query('student_category') ?? '',
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
        $validCategories = ['local', 'international', 'sponsored', 'self_sponsored'];
        $errors = ValidationHelper::validate($data, [
            'academic_year_id' => 'required|numeric',
            'fee_type'         => 'required|in:' . implode(',', $this->getActiveFeeCodes()),
            'label'            => 'required|string|max:120',
            'amount'           => 'required|numeric',
            'student_category' => 'nullable|in:' . implode(',', $validCategories),
            'currency'         => 'nullable|string|max:10',
        ]);
        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        // Derive a primary department_id for the legacy column (first in the array, or the scalar value)
        $deptIds = !empty($data['department_ids']) && is_array($data['department_ids'])
            ? array_map('intval', $data['department_ids'])
            : (!empty($data['department_id']) ? [(int)$data['department_id']] : []);

        // Parse option_ids array
        $optionIds = !empty($data['option_ids']) && is_array($data['option_ids'])
            ? array_map('intval', $data['option_ids'])
            : [];

        $validPlans = ['full_year', 'per_semester', 'per_installment'];
        $paymentPlan = in_array($data['payment_plan'] ?? '', $validPlans, true)
            ? $data['payment_plan'] : 'full_year';

        $id = $this->structureModel->create([
            'academic_year_id'  => (int)$data['academic_year_id'],
            'department_id'     => !empty($deptIds) ? $deptIds[0] : null,
            'level_id'          => !empty($data['level_id'])  ? (int)$data['level_id']  : null,
            'campus_id'         => !empty($data['campus_id']) ? (int)$data['campus_id'] : null,
            'student_category'  => in_array($data['student_category'] ?? '', $validCategories, true)
                                     ? $data['student_category'] : null,
            'fee_type'          => $data['fee_type'],
            'label'             => $data['label'],
            'amount'            => (float)$data['amount'],
            'currency'          => !empty($data['currency']) ? strtoupper((string)$data['currency']) : 'RWF',
            'semester'          => !empty($data['semester'])  ? (int)$data['semester']  : null,
            'payment_plan'      => $paymentPlan,
            'installment_count' => !empty($data['installment_count']) ? (int)$data['installment_count'] : null,
            'is_active'         => 1,
            'created_by'        => (int)$actor['id'],
        ]);

        if (!empty($deptIds)) {
            $this->structureModel->insertDepartmentLinks((int)$id, $deptIds);
        }
        if (!empty($optionIds)) {
            $this->structureModel->insertOptionLinks((int)$id, $optionIds);
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

        $validPlans      = ['full_year', 'per_semester', 'per_installment'];
        $validCategories = ['local', 'international', 'sponsored', 'self_sponsored'];

        if (isset($data['student_category']) && $data['student_category'] !== '' && !in_array($data['student_category'], $validCategories, true)) {
            $this->error($response, 'Validation failed.', 422, ['student_category' => ['The student_category field must be one of: ' . implode(', ', $validCategories) . '.']]);
        }

        $this->structureModel->update($id, array_filter([
            'label'             => $data['label']     ?? null,
            'amount'            => isset($data['amount'])    ? (float)$data['amount']    : null,
            'currency'          => isset($data['currency']) ? strtoupper((string)$data['currency']) : null,
            'semester'          => isset($data['semester'])  ? (int)$data['semester']    : null,
            'campus_id'         => isset($data['campus_id']) ? ((int)$data['campus_id'] ?: null) : null,
            'student_category'  => isset($data['student_category']) ? ($data['student_category'] ?: null) : null,
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

        if (isset($data['option_ids']) && is_array($data['option_ids'])) {
            $optionIds = array_map('intval', $data['option_ids']);
            $this->structureModel->insertOptionLinks($id, $optionIds);
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

        // Fetch all transactions from the legacy `payment` table for this student.
        // `payment.student` stores the regnumber — match it directly against $studentId.
        $legacyRows  = [];
        $legacyError = null;
        try {
            $pdo  = $this->db->getPdo();
            $stmt = $pdo->prepare(
                "SELECT p.trans_code, p.student, p.amount, p.`date`, p.fee_category, p.description,
                        p.external_transaction_id, p.payment_chanel, p.payment_notifi,
                        p.slip_no, p.acad_cycle_id, p.`status`, p.`action`
                 FROM `payment` p
                 INNER JOIN `student` s ON CONVERT(p.student USING utf8mb4) COLLATE utf8mb4_unicode_ci = s.regnumber
                 WHERE s.regnumber = ?
                 ORDER BY p.`date` DESC
                 LIMIT 1000"
            );
            $stmt->execute([$studentId]);
            $legacyRows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        } catch (\Throwable $e) {
            $legacyError = $e->getMessage();
            error_log('[Finance:payment] ' . $e->getMessage());
        }

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

        // Merge: MIS fee_payments first, then legacy bank transactions not
        // already represented in fee_payments. UrubutoPay payments are
        // dual-written to both tables, so without this dedup the same
        // transaction shows up twice (once "confirmed" from fee_payments,
        // once from the legacy Debit row) — and a later legacy-only
        // reversal only cancels one of the two.
        $allPayments = array_merge($misPayments['data'] ?? [], $this->dedupeLegacyPayments($misPayments['data'] ?? [], $legacyPayments));

        $this->success($response, [
            'invoices'      => $invoices,
            'payments'      => $allPayments,
            'totals'        => $totals,
            '_debug'        => [
                'v'                  => 'v2-legacy',
                'queried_regnumber'  => $studentId,
                'legacy_row_count'   => \count($legacyRows),
                'legacy_error'       => $legacyError,
            ],
        ], 'Student ledger v2.');
    }

    /**
     * GET /api/finance/my/fines
     *
     * Student self-service view of their own fines. Every /api/fines/* route is
     * gated behind staff permissions, so before this endpoint a fined student
     * could see their balance rise with no way to find out why or to pay it.
     *
     * Each fine is returned with the invoice it was billed on (fines are always
     * invoiced with fee_type = 'FINE'), so the portal can link straight to the
     * payable invoice instead of leaving the student at a dead end.
     */
    public function getMyFines(Request $request, Response $response): never
    {
        $reg = $this->authStudentRegnumber($request);
        if (!$reg) $this->error($response, 'No student profile linked to this account.', 404);

        $rows = $this->db->fetchAll(
            "SELECT f.id, f.fine_type, f.reason, f.amount, f.status,
                    f.invoice_id, f.created_at, f.waived_at,
                    i.invoice_number, i.academic_year_id,
                    i.amount_due, i.amount_paid, i.status AS invoice_status, i.due_date,
                    ay.label AS academic_year_label
             FROM `fee_fines` f
             LEFT JOIN `fee_invoices`   i  ON i.id  = f.invoice_id
             LEFT JOIN `academic_years` ay ON ay.id = i.academic_year_id
             WHERE CONVERT(f.student_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
                 = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
             ORDER BY f.created_at DESC",
            [$reg]
        );

        $fines = array_map(static function (array $r): array {
            $due  = (float)($r['amount_due']  ?? 0);
            $paid = (float)($r['amount_paid'] ?? 0);
            return [
                'id'                  => (int)$r['id'],
                'fine_type'           => (string)$r['fine_type'],
                'reason'              => (string)$r['reason'],
                'amount'              => (float)$r['amount'],
                'status'              => (string)$r['status'],
                'created_at'          => $r['created_at'],
                'waived_at'           => $r['waived_at'],
                'invoice_id'          => $r['invoice_id'] !== null ? (int)$r['invoice_id'] : null,
                'invoice_number'      => $r['invoice_number'],
                'invoice_status'      => $r['invoice_status'],
                'due_date'            => $r['due_date'],
                'academic_year_id'    => $r['academic_year_id'] !== null ? (int)$r['academic_year_id'] : null,
                'academic_year_label' => $r['academic_year_label'],
                // What the student still has to pay on this fine's invoice.
                'balance'             => max(0.0, round($due - $paid, 2)),
            ];
        }, $rows);

        // 'waived' fines are settled and 'paid' ones are done — neither is owed.
        $outstanding = array_values(array_filter(
            $fines,
            static fn(array $f): bool => in_array($f['status'], ['pending', 'invoiced'], true)
        ));

        $this->success($response, [
            'fines'   => $fines,
            'summary' => [
                'total_fines'        => count($fines),
                'outstanding_count'  => count($outstanding),
                'outstanding_amount' => round(array_sum(array_column($outstanding, 'amount')), 2),
            ],
        ], 'Fines retrieved.');
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

        $legacyRows = [];
        try {
            $stmt = $this->db->getPdo()->prepare(
                "SELECT p.trans_code, p.student, p.amount, p.`date`, p.fee_category, p.description,
                        p.external_transaction_id, p.payment_chanel, p.payment_notifi,
                        p.slip_no, p.acad_cycle_id, p.`status`, p.`action`
                 FROM `payment` p
                 INNER JOIN `student` s ON CONVERT(p.student USING utf8mb4) COLLATE utf8mb4_unicode_ci = s.regnumber
                 WHERE s.regnumber = ?
                 ORDER BY p.`date` DESC
                 LIMIT 1000"
            );
            $stmt->execute([$reg]);
            $legacyRows = $stmt->fetchAll(\PDO::FETCH_ASSOC);
        } catch (\Throwable $e) {
            error_log('[Finance:my/payment] ' . $e->getMessage());
        }

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

        $allPayments = array_merge($misPayments['data'] ?? [], $this->dedupeLegacyPayments($misPayments['data'] ?? [], $legacyPayments));

        $this->success($response, [
            'invoices' => $invoices,
            'payments' => $allPayments,
            'totals'   => $totals,
        ], 'Your finance ledger retrieved.');
    }

    /**
     * Filter out legacy `payment` rows (mapped by the caller into the same
     * shape as fee_payments) whose transaction is already represented in
     * $misPayments — UrubutoPay dual-writes every payment to both
     * fee_payments and the legacy payment/bank_payment tables, so a naive
     * merge would show each transaction twice. Mirrors the dedup logic in
     * UrubutoPayService::getMobilePaymentHistory().
     *
     * @param array $misPayments    fee_payments rows (have 'reference_number')
     * @param array $legacyPayments mapped legacy rows (have 'reference_number' = external_transaction_id/slip_no)
     */
    private function dedupeLegacyPayments(array $misPayments, array $legacyPayments): array
    {
        $modernTxCodes = array_filter(array_column($misPayments, 'reference_number'));

        return array_values(array_filter($legacyPayments, function (array $row) use ($modernTxCodes): bool {
            $txCode = (string)($row['reference_number'] ?? '');
            if ($txCode === '') {
                return true;
            }
            $baseCode = explode('-', $txCode)[0];
            foreach ($modernTxCodes as $mc) {
                if (str_starts_with((string)$mc, $baseCode)) {
                    return false;
                }
            }
            return true;
        }));
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
            // Programme-level filter — what the registry works at day to day.
            'option_id'        => $request->query('option_id') !== null ? (int)$request->query('option_id') : null,
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
     * GET /api/finance/billing/all-students
     * Display ALL students with financial data (opening balance, invoiced, paid, bursary, total balance)
     * Academic year is OPTIONAL - if not provided, shows all students
     */
    public function listAllStudentsWithStatus(Request $request, Response $response): never
    {
        // Not cast to int: getIntakeYears() hands the UI an intake label
        // ("2023-2024") whenever that cohort has no `academic_years` row, and
        // the service accepts either form. An (int) cast here would turn the
        // label into 0 and silently widen the filter to every year.
        // No year guard here: this endpoint backs the Billing screen's opening state,
        // which lists every active student before a cohort is picked.
        $filters = [
            'academic_year_id' => $request->query('academic_year_id') ?: 0,
            'state'            => $request->query('state') ?? 'all',
            'semester'         => $request->query('semester') !== null ? (int)$request->query('semester') : null,
            'faculty_id'       => $request->query('faculty_id') !== null ? (int)$request->query('faculty_id') : null,
            'department_id'    => $request->query('department_id') !== null ? (int)$request->query('department_id') : null,
            // Programme-level filter — what the registry works at day to day.
            'option_id'        => $request->query('option_id') !== null ? (int)$request->query('option_id') : null,
            'keyword'          => $request->query('keyword') ?? null,
            'sort'             => $request->query('sort') ?? 'opening_balance',
            'order'            => $request->query('order') ?? 'desc',
            'page'             => (int)($request->query('page') ?? 1),
            'per_page'         => (int)($request->query('per_page') ?? 50),
        ];
        try {
            $result = $this->service->getAllStudentsWithFinancialData($filters);
            $this->success($response, $result, 'All students with financial data retrieved.');
        } catch (\Exception $e) {
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
            // Programme-level filter — what the registry works at day to day.
            'option_id'        => $request->query('option_id') !== null ? (int)$request->query('option_id') : null,
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
    /**
     * Does this database have the UrubutoPay service catalogue (migration 134)?
     * Memoised per request; false makes the online-payments listing behave as it
     * did before the catalogue existed instead of erroring on a missing table.
     */
    private function hasUrubutoCatalogue(): bool
    {
        static $ready = null;
        if ($ready !== null) {
            return $ready;
        }

        try {
            $row = $this->db->fetchOne(
                "SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'urubuto_services'",
                []
            );
            return $ready = ((int)($row['c'] ?? 0) > 0);
        } catch (\Throwable $e) {
            return $ready = false;
        }
    }

    public function listOnlinePaymentsHistory(Request $request, Response $response): never
    {
        $page    = max(1, (int)($request->query('page') ?? 1));
        $perPage = max(1, min(100, (int)($request->query('per_page') ?? 20)));
        $keyword = $request->query('keyword') ?? '';
        // VIEW_MOBILE_PAYMENTS opens this listing, so it has to be able to
        // narrow to the mobile-money side of it: `payment_chanel` is the
        // channel the payer used (USSD, mobile money, bank) and
        // `fee_category` is the UrubutoPay service code they picked.
        $channel     = trim((string)($request->query('channel') ?? ''));
        $serviceCode = trim((string)($request->query('service_code') ?? ''));

        $offset = ($page - 1) * $perPage;

        $whereClause = "1=1";
        $params = [];

        if ($channel !== '') {
            $whereClause .= " AND p.`payment_chanel` = ?";
            $params[] = $channel;
        }

        if ($serviceCode !== '') {
            $whereClause .= " AND p.`fee_category` = ?";
            $params[] = $serviceCode;
        }

        if ($keyword) {
            $whereClause .= " AND (p.student LIKE ? OR p.slip_no LIKE ? OR p.trans_code LIKE ? OR s.regnumber LIKE ? OR CONCAT(s.fname, ' ', s.lname) LIKE ?)";
            $search = "%{$keyword}%";
            // Append — the channel/service filters above already put their
            // bindings in $params, and reassigning here would drop them while
            // leaving their placeholders in the WHERE clause.
            array_push($params, $search, $search, $search, $search, $search);
        }

        $countQuery = "SELECT COUNT(*) as total FROM `payment` p LEFT JOIN `student` s ON CONVERT(p.student USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(s.regnumber USING utf8mb4) COLLATE utf8mb4_unicode_ci WHERE $whereClause";
        $totalRow = $this->db->fetchOne($countQuery, $params);
        $total = (int)($totalRow['total'] ?? 0);

        // `payment.fee_category` carries the UrubutoPay service_code the payer
        // chose (see UrubutoPayService::writeLegacyDebit). Resolve it to the
        // service name and its fee category so the listing can say WHAT was
        // paid for instead of showing a raw code — or nothing at all for the
        // legacy numeric categories ('147' bank, '146' reversal).
        // Guarded on migration 134 having run.
        $hasCatalogue = $this->hasUrubutoCatalogue();
        $svcSelect = $hasCatalogue
            ? "COALESCE(live.`service_name`, us.`service_name`)                       AS service_name,
               COALESCE(live.`service_code`, us.`service_code`)                       AS service_code,
               COALESCE(ft.`label`, live.`fee_structure_type`, us.`fee_structure_type`) AS fee_category_label,"
            : "NULL AS service_name, NULL AS service_code, NULL AS fee_category_label,";
        $svcJoin = $hasCatalogue
            ? "LEFT JOIN `urubuto_services` us   ON us.`service_code` = p.`fee_category`
               LEFT JOIN `urubuto_services` live ON live.`service_code` = us.`alias_of`
               LEFT JOIN `fee_types` ft          ON ft.`code` = COALESCE(live.`fee_structure_type`, us.`fee_structure_type`)"
            : '';

        $query = "SELECT p.*, {$svcSelect} s.regnumber as student_regnumber, s.fname as student_fname, s.lname as student_lname, s.id as student_db_id FROM `payment` p LEFT JOIN `student` s ON CONVERT(p.student USING utf8mb4) COLLATE utf8mb4_unicode_ci = CONVERT(s.regnumber USING utf8mb4) COLLATE utf8mb4_unicode_ci {$svcJoin} WHERE $whereClause ORDER BY p.`date` DESC LIMIT $perPage OFFSET $offset";
        $data = $this->db->fetchAll($query, $params);

        // Fetch basic dashboard metrics for online payments
        $metricsQuery = "SELECT COUNT(*) as total_tx, SUM(amount) as total_amount FROM `payment`";
        $metrics = $this->db->fetchOne($metricsQuery);

        // Options for the channel / service pickers. Channels come from the
        // data itself because the gateway adds new ones without a migration.
        $channels = array_values(array_filter(array_column(
            $this->db->fetchAll(
                "SELECT DISTINCT `payment_chanel` FROM `payment`
                  WHERE `payment_chanel` IS NOT NULL AND `payment_chanel` <> ''
                  ORDER BY `payment_chanel` ASC"
            ),
            'payment_chanel'
        )));

        $services = $hasCatalogue
            ? $this->db->fetchAll(
                "SELECT `service_code`, `service_name` FROM `urubuto_services`
                  WHERE `is_active` = 1 ORDER BY `sort_order` ASC, `service_name` ASC"
              )
            : [];

        $this->success($response, [
            'data' => $data,
            'filters' => [
                'channels' => $channels,
                'services' => $services,
            ],
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
     * POST /api/finance/payments/pay-oldest-first
     *
     * Spread one amount across a student's outstanding invoices, oldest debt
     * first. The counterpart to the refusal recordPayment() now raises when an
     * older invoice is still open — an officer holding a lump sum needs a
     * correct path, not just a blocked one.
     *
     * Body: { student_id, amount, payment_method, reference_number?, notes?, paid_at? }
     */
    public function payOldestFirst(Request $request, Response $response): never
    {
        $data  = $request->body();
        $actor = $request->param('_auth_user');

        $errors = ValidationHelper::validate($data, [
            'student_id'     => 'required',
            'amount'         => 'required|numeric',
            'payment_method' => 'required|in:CASH,BANK_TRANSFER,MOBILE_MONEY,BURSARY,WAIVER',
        ]);
        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        try {
            $result = $this->service->payOldestFirst(
                (string) $data['student_id'],
                (float) $data['amount'],
                $data,
                (int) $actor['id']
            );
        } catch (\InvalidArgumentException | \RuntimeException $e) {
            $this->error($response, $e->getMessage(), 422);
        }

        $count = count($result['allocations']);
        SystemLogService::log(
            'CREATE',
            'FINANCE',
            "Allocated {$data['amount']} across {$count} invoice(s), oldest first, for {$data['student_id']}.",
            null,
            'fee_payment',
            $result,
            (array) $actor ?: null
        );

        $message = $result['unallocated'] > 0.009
            ? sprintf('Allocated across %d invoice(s). %s could not be allocated — the student owes less than the amount paid.',
                      $count, number_format($result['unallocated'], 2))
            : sprintf('Allocated across %d invoice(s), oldest debt first.', $count);

        $this->success($response, $result, $message, 201);
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

    /**
     * GET /api/finance/application-payments
     * List applicant invoice payment claims by status (pending/approved/rejected).
     */
    public function listApplicationPayments(Request $request, Response $response): never
    {
        $status = trim((string)($request->query('status') ?? 'pending'));
        if (!in_array($status, ['pending', 'approved', 'rejected', 'none'], true)) {
            $this->error($response, 'Invalid status. Use pending, approved, or rejected.', 422);
        }

        $page    = max(1, (int)($request->query('page') ?? 1));
        $perPage = min(100, (int)($request->query('per_page') ?? 20));
        $offset  = ($page - 1) * $perPage;

        $whereStatus = $status === 'none' ? 'sa.payment_verification_status IS NULL OR sa.payment_verification_status = ""' : "sa.payment_verification_status = '{$status}'";

        $total = $this->db->fetchOne(
            "SELECT COUNT(*) as cnt FROM student_applications sa WHERE {$whereStatus} AND sa.claimed_transaction_id IS NOT NULL",
        );
        $totalCount = (int)($total['cnt'] ?? 0);

        $rows = $this->db->fetchAll(
            "SELECT
                sa.id, sa.application_number, sa.first_name, sa.last_name, sa.email,
                sa.claimed_transaction_id, sa.payment_amount, sa.payment_currency,
                sa.invoice_submitted_at, sa.payment_slip_file_id, sa.payment_slip_mime,
                sa.payment_verification_status
            FROM student_applications sa
            WHERE {$whereStatus} AND sa.claimed_transaction_id IS NOT NULL
            ORDER BY sa.invoice_submitted_at DESC
            LIMIT ? OFFSET ?",
            [$perPage, $offset]
        );

        $this->success($response, [
            'data'       => $rows ?: [],
            'pagination' => [
                'total'        => $totalCount,
                'per_page'     => $perPage,
                'current_page' => $page,
                'last_page'    => ceil($totalCount / $perPage),
            ],
        ], 'Application payments fetched.');
    }

    /**
     * PATCH /api/finance/application-payments/:id/approve
     * Approve a pending applicant invoice payment claim.
     */
    public function approveApplicationPayment(Request $request, Response $response): never
    {
        $id    = (int)$request->param('id');
        $actor = $request->param('_auth_user');
        $app   = $this->applicationModel->find($id);

        if (!$app) {
            $this->error($response, 'Application not found.', 404);
        }

        if ($app['payment_verification_status'] !== 'pending') {
            $this->error($response, 'Only pending payment claims can be approved.', 422);
        }

        if (empty($app['claimed_transaction_id'])) {
            $this->error($response, 'No transaction ID on file for this claim.', 422);
        }

        $this->applicationModel->update($id, [
            'transaction_id'            => $app['claimed_transaction_id'],
            'paid_at'                   => date('Y-m-d H:i:s'),
            'payment_verification_status' => 'approved',
            'verified_by'               => $actor['id'] ?? null,
            'verified_at'               => date('Y-m-d H:i:s'),
        ]);

        SystemLogService::log(
            'APPROVE',
            'FINANCE',
            "Approved applicant payment for application {$app['application_number']} (ID {$id}), transaction {$app['claimed_transaction_id']}.",
            $id,
            'student_application',
            ['transaction_id' => $app['claimed_transaction_id'], 'amount' => $app['payment_amount'] ?? 5000],
            (array)$actor ?: null
        );

        $this->success($response, null, 'Application payment approved.');
    }

    /**
     * PATCH /api/finance/application-payments/:id/reject
     * Reject a pending applicant invoice payment claim.
     */
    public function rejectApplicationPayment(Request $request, Response $response): never
    {
        $id    = (int)$request->param('id');
        $actor = $request->param('_auth_user');
        $data  = $request->body();
        $app   = $this->applicationModel->find($id);

        if (!$app) {
            $this->error($response, 'Application not found.', 404);
        }

        if ($app['payment_verification_status'] !== 'pending') {
            $this->error($response, 'Only pending payment claims can be rejected.', 422);
        }

        $reason = trim((string)($data['reason'] ?? ''));

        $this->applicationModel->update($id, [
            'payment_verification_status' => 'rejected',
            'verified_by'                 => $actor['id'] ?? null,
            'verified_at'                 => date('Y-m-d H:i:s'),
            'claimed_transaction_id'      => null,
            'payment_slip_file_id'        => null,
            'payment_slip_mime'           => null,
            'invoice_submitted_at'        => null,
            'internal_notes'              => ($reason ? "Rejected: $reason" : "Rejected") . "\n" . ($app['internal_notes'] ?? ''),
        ]);

        SystemLogService::log(
            'REJECT',
            'FINANCE',
            "Rejected applicant payment for application {$app['application_number']} (ID {$id}). Reason: $reason",
            $id,
            'student_application',
            ['reason' => $reason],
            (array)$actor ?: null
        );

        $this->success($response, null, 'Application payment rejected.');
    }

    // ────────────────────────────────────────────────────────────────────────
    // Per-Credit Rates (retake/part-time modules by faculty)
    // ────────────────────────────────────────────────────────────────────────

    /** GET /api/finance/per-credit-rates */
    public function listPerCreditRates(Request $request, Response $response): never
    {
        $perCreditRateModel = new \App\Models\FeePerCreditRateModel();
        $filters = [
            'academic_year_id' => $request->query()['academic_year_id'] ?? null,
            'faculty_id'       => $request->query()['faculty_id'] ?? null,
            'is_active'        => isset($request->query()['is_active']) ? (int)$request->query()['is_active'] : null,
        ];
        $data = $perCreditRateModel->listWithJoins(array_filter($filters, fn ($v) => $v !== null && $v !== ''));

        $this->success($response, $data, 'Per-credit rates retrieved.');
    }

    /** POST /api/finance/per-credit-rates */
    public function createPerCreditRate(Request $request, Response $response): never
    {
        $data  = $request->body();
        $actor = $request->param('_auth_user');

        $errors = ValidationHelper::validate($data, [
            'academic_year_id' => 'required|integer',
            'faculty_id'       => 'required|integer',
            'amount_per_credit' => 'required|numeric|min:0',
        ]);
        if (!empty($errors)) $this->error($response, 'Validation failed.', 422, $errors);

        $perCreditRateModel = new \App\Models\FeePerCreditRateModel();
        $existing = $perCreditRateModel->findForFaculty((int)$data['academic_year_id'], (int)$data['faculty_id']);
        if ($existing) {
            $this->error($response, 'Per-credit rate already exists for this faculty and academic year.', 422);
        }

        $id = $perCreditRateModel->create([
            'academic_year_id'  => (int)$data['academic_year_id'],
            'faculty_id'        => (int)$data['faculty_id'],
            'amount_per_credit' => (float)$data['amount_per_credit'],
            'is_active'         => isset($data['is_active']) ? (int)(bool)$data['is_active'] : 1,
            'created_by'        => (int)($actor->id ?? 0),
        ]);

        // Link departments if specified
        if (!empty($data['department_ids']) && is_array($data['department_ids'])) {
            $perCreditRateModel->setDepartmentLinks((int)$id, $data['department_ids']);
        }

        SystemLogService::log('CREATE', 'FINANCE', "Created per-credit rate for faculty ID {$data['faculty_id']}, year ID {$data['academic_year_id']}: {$data['amount_per_credit']} RWF/credit.", (int)$id, 'fee_per_credit_rate', null, (array)$actor ?: null);
        $this->success($response, ['id' => (int)$id], 'Per-credit rate created.', 201);
    }

    /** PUT /api/finance/per-credit-rates/:id */
    public function updatePerCreditRate(Request $request, Response $response): never
    {
        $id    = (int)$request->param('id');
        $data  = $request->body();
        $actor = $request->param('_auth_user');

        $perCreditRateModel = new \App\Models\FeePerCreditRateModel();
        $existing = $perCreditRateModel->find($id);
        if (!$existing) $this->error($response, 'Per-credit rate not found.', 404);

        $errors = ValidationHelper::validate($data, [
            'amount_per_credit' => 'required|numeric|min:0',
        ]);
        if (!empty($errors)) $this->error($response, 'Validation failed.', 422, $errors);

        $perCreditRateModel->update($id, array_filter([
            'amount_per_credit' => (float)$data['amount_per_credit'],
            'is_active'         => isset($data['is_active']) ? (int)(bool)$data['is_active'] : null,
        ], fn ($v) => $v !== null && $v !== ''));

        // Update department links if specified
        if (isset($data['department_ids'])) {
            $perCreditRateModel->setDepartmentLinks($id, is_array($data['department_ids']) ? $data['department_ids'] : []);
        }

        SystemLogService::log('UPDATE', 'FINANCE', "Updated per-credit rate ID {$id}: {$data['amount_per_credit']} RWF/credit.", $id, 'fee_per_credit_rate', null, (array)$actor ?: null);
        $this->success($response, null, 'Per-credit rate updated.');
    }

    /** DELETE /api/finance/per-credit-rates/:id */
    public function deletePerCreditRate(Request $request, Response $response): never
    {
        $id    = (int)$request->param('id');
        $actor = $request->param('_auth_user');

        $perCreditRateModel = new \App\Models\FeePerCreditRateModel();
        $existing = $perCreditRateModel->find($id);
        if (!$existing) $this->error($response, 'Per-credit rate not found.', 404);

        $perCreditRateModel->delete($id);

        SystemLogService::log('DELETE', 'FINANCE', "Deleted per-credit rate ID {$id}.", $id, 'fee_per_credit_rate', null, (array)$actor ?: null);
        $this->success($response, null, 'Per-credit rate deleted.');
    }

    /**
     * POST /api/finance/structures/bulk-import
     * Bulk import fee structures from CSV.
     * Body: { rows: [{ academic_year_id, department_name, level_name, fee_type_code, label, amount, semester, payment_plan, installment_count }, ...] }
     * Returns: { created, updated, skipped, failed: [{ index, error, errors? }] }
     */
    public function bulkImportStructures(Request $request, Response $response): never
    {
        $body = $request->body();
        $rows = $body['rows'] ?? [];
        $actor = $request->param('_auth_user');

        if (!is_array($rows)) {
            $this->error($response, 'rows must be an array.', 422);
        }

        $db = \Core\Database::getInstance();
        $created = 0;
        $updated = 0;
        $skipped = 0;
        $failed = [];

        // Pre-load lookups
        $feeCodes = $this->getActiveFeeCodes();
        $academicYears = $db->fetchAll("SELECT id, label FROM academic_years");
        $yearsByLabel = [];
        foreach ($academicYears as $y) {
            $yearsByLabel[strtolower(trim((string)$y['label']))] = $y['id'];
        }

        $departments = $db->fetchAll("SELECT dep_id, dep_name FROM departements");
        $deptsByName = [];
        foreach ($departments as $d) {
            $deptsByName[strtolower(trim((string)$d['dep_name']))] = $d['dep_id'];
        }

        $levels = $db->fetchAll("SELECT id, level_name FROM level");
        $levelsByName = [];
        foreach ($levels as $l) {
            $levelsByName[strtolower(trim((string)$l['level_name']))] = $l['id'];
        }

        foreach ($rows as $idx => $row) {
            if (!is_array($row)) {
                $failed[] = ['index' => $idx, 'error' => 'Row must be an object.'];
                continue;
            }

            $errs = [];

            // Resolve academic_year_id
            $yearId = null;
            if (!empty($row['academic_year_id'])) {
                $yearId = (int)$row['academic_year_id'];
            } elseif (!empty($row['academic_year_label'])) {
                $yearKey = strtolower(trim((string)$row['academic_year_label']));
                $yearId = $yearsByLabel[$yearKey] ?? null;
                if (!$yearId) $errs['academic_year_label'] = 'Academic year not found: ' . $row['academic_year_label'];
            } else {
                $errs['academic_year_id'] = 'academic_year_id or academic_year_label is required.';
            }

            // Resolve department_id
            $deptId = null;
            if (!empty($row['department_name'])) {
                $deptKey = strtolower(trim((string)$row['department_name']));
                $deptId = $deptsByName[$deptKey] ?? null;
                if (!$deptId) $errs['department_name'] = 'Department not found: ' . $row['department_name'];
            } else {
                $errs['department_name'] = 'department_name is required.';
            }

            // Resolve level_id
            $levelId = null;
            if (!empty($row['level_name'])) {
                $levelKey = strtolower(trim((string)$row['level_name']));
                $levelId = $levelsByName[$levelKey] ?? null;
                if (!$levelId) $errs['level_name'] = 'Level not found: ' . $row['level_name'];
            }

            // Resolve campus_id (optional)
            $campusId = null;
            if (!empty($row['campus_name'])) {
                $campusKey = strtolower(trim((string)$row['campus_name']));
                $campuses = $db->fetchAll("SELECT id, name FROM campuses");
                $campusByName = [];
                foreach ($campuses as $campus) {
                    $campusByName[strtolower(trim((string)$campus['name']))] = $campus['id'];
                }
                $campusId = $campusByName[$campusKey] ?? null;
                if (!$campusId && !empty($row['campus_name'])) $errs['campus_name'] = 'Campus not found: ' . $row['campus_name'];
            }

            // Resolve option_id via option_name + department_id (optional)
            $optionId = null;
            if (!empty($row['option_name']) && !empty($deptId)) {
                $optionKey = strtolower(trim((string)$row['option_name']));
                $options = $db->fetchAll("SELECT id, name, department_id FROM options WHERE department_id = ?", [$deptId]);
                $optionByName = [];
                foreach ($options as $opt) {
                    $optionByName[strtolower(trim((string)$opt['name']))] = $opt['id'];
                }
                $optionId = $optionByName[$optionKey] ?? null;
                if (!$optionId && !empty($row['option_name'])) $errs['option_name'] = 'Program/Option not found in department: ' . $row['option_name'];
            }

            // Validate fee_type_code
            $feeType = $row['fee_type_code'] ?? $row['fee_type'] ?? null;
            if (!$feeType || !in_array($feeType, $feeCodes, true)) {
                $errs['fee_type_code'] = 'Invalid or inactive fee type: ' . ($feeType ?? 'missing');
            }

            // Validate required fields
            if (empty($row['label'])) $errs['label'] = 'label is required.';
            if (empty($row['amount'])) {
                $errs['amount'] = 'amount is required.';
            } elseif (!is_numeric($row['amount'])) {
                $errs['amount'] = 'amount must be numeric.';
            }

            if (!empty($errs)) {
                $failed[] = ['index' => $idx, 'error' => 'Validation failed', 'errors' => $errs];
                continue;
            }

            try {
                $validPlans = ['full_year', 'per_semester', 'per_installment'];
                $paymentPlan = in_array($row['payment_plan'] ?? '', $validPlans, true)
                    ? $row['payment_plan'] : 'full_year';

                $id = $this->structureModel->create([
                    'academic_year_id'  => (int)$yearId,
                    'department_id'     => (int)$deptId,
                    'level_id'          => $levelId ? (int)$levelId : null,
                    'campus_id'         => $campusId ? (int)$campusId : null,
                    'fee_type'          => $feeType,
                    'label'             => (string)$row['label'],
                    'amount'            => (float)$row['amount'],
                    'semester'          => !empty($row['semester']) ? (int)$row['semester'] : null,
                    'payment_plan'      => $paymentPlan,
                    'installment_count' => !empty($row['installment_count']) ? (int)$row['installment_count'] : null,
                    'is_active'         => 1,
                    'created_by'        => (int)$actor['id'],
                ]);

                // Link options if resolved
                if ($optionId) {
                    $this->structureModel->insertOptionLinks((int)$id, [$optionId]);
                }

                $created++;
            } catch (\Throwable $e) {
                $failed[] = ['index' => $idx, 'error' => $e->getMessage()];
            }
        }

        SystemLogService::log('CREATE', 'FINANCE', "Bulk import fee structures: {$created} created, {$updated} updated, {$skipped} skipped.", null, 'fee_structure', ['created' => $created, 'updated' => $updated, 'skipped' => $skipped], (array)$actor ?: null);
        $this->success($response, [
            'created' => $created,
            'updated' => $updated,
            'skipped' => $skipped,
            'failed'  => $failed,
        ], 'Bulk import complete.');
    }

    /**
     * POST /api/finance/structures/copy
     * Copy every fee structure (and its department/option links) from one
     * academic year to another. Fee structures rarely change year to year,
     * so this saves re-entering the same rows by hand every year — the row
     * already skips anything that looks like it exists in the target year
     * (same fee type, label, department, level, campus and category), so it
     * is safe to run more than once without creating duplicates.
     */
    public function copyStructures(Request $request, Response $response): never
    {
        $data     = $request->body();
        $actor    = $request->param('_auth_user');
        $sourceId = (int)($data['source_academic_year_id'] ?? 0);
        $targetId = (int)($data['target_academic_year_id'] ?? 0);
        $category = $data['student_category'] ?? null;
        $validCategories = ['local', 'international', 'sponsored', 'self_sponsored'];

        if (!$sourceId || !$targetId) {
            $this->error($response, 'Validation failed.', 422, [
                'source_academic_year_id' => ['Source academic year is required.'],
                'target_academic_year_id' => ['Target academic year is required.'],
            ]);
        }
        if ($sourceId === $targetId) {
            $this->error($response, 'Source and target academic years must be different.', 422);
        }
        if ($category !== null && $category !== '' && !in_array($category, $validCategories, true)) {
            $this->error($response, 'Validation failed.', 422, ['student_category' => ['Invalid student category.']]);
        }

        $sql = "SELECT * FROM `fee_structures` WHERE academic_year_id = ?";
        $bindings = [$sourceId];
        if (!empty($category)) {
            $sql .= " AND student_category = ?";
            $bindings[] = $category;
        }
        $sourceRows = $this->db->fetchAll($sql, $bindings);

        if (empty($sourceRows)) {
            $this->success($response, ['created' => 0, 'skipped' => 0, 'failed' => []], 'No fee structures found for the source year.');
        }

        // Existing target-year rows, keyed the same way duplicates are detected below.
        $existing = $this->db->fetchAll("SELECT fee_type, label, department_id, level_id, campus_id, student_category FROM `fee_structures` WHERE academic_year_id = ?", [$targetId]);
        $existingKeys = [];
        foreach ($existing as $row) {
            $existingKeys[$this->structureCopyKey($row)] = true;
        }

        $created = 0;
        $skipped = 0;
        $failed  = [];

        $this->db->beginTransaction();
        try {
            foreach ($sourceRows as $row) {
                if (isset($existingKeys[$this->structureCopyKey($row)])) {
                    $skipped++;
                    continue;
                }

                $newId = $this->structureModel->create([
                    'academic_year_id'  => $targetId,
                    'department_id'     => $row['department_id'] !== null ? (int)$row['department_id'] : null,
                    'level_id'          => $row['level_id'] !== null ? (int)$row['level_id'] : null,
                    'campus_id'         => $row['campus_id'] !== null ? (int)$row['campus_id'] : null,
                    'student_category'  => $row['student_category'],
                    'fee_type'          => $row['fee_type'],
                    'label'             => $row['label'],
                    'amount'            => (float)$row['amount'],
                    'currency'          => $row['currency'] ?? 'RWF',
                    'semester'          => $row['semester'] !== null ? (int)$row['semester'] : null,
                    'payment_plan'      => $row['payment_plan'] ?? 'full_year',
                    'installment_count' => $row['installment_count'] !== null ? (int)$row['installment_count'] : null,
                    'is_active'         => 1,
                    'created_by'        => (int)$actor['id'],
                ]);

                $deptIds = array_column(
                    $this->db->fetchAll("SELECT department_id FROM `fee_structure_departments` WHERE fee_structure_id = ?", [$row['id']]),
                    'department_id'
                );
                if (!empty($deptIds)) {
                    $this->structureModel->insertDepartmentLinks((int)$newId, $deptIds);
                }

                $optionIds = array_column(
                    $this->db->fetchAll("SELECT option_id FROM `fee_structure_options` WHERE fee_structure_id = ?", [$row['id']]),
                    'option_id'
                );
                if (!empty($optionIds)) {
                    $this->structureModel->insertOptionLinks((int)$newId, $optionIds);
                }

                $created++;
            }
            $this->db->commit();
        } catch (\Throwable $e) {
            $this->db->rollBack();
            $this->error($response, 'Copy failed: ' . $e->getMessage(), 500);
        }

        SystemLogService::log('CREATE', 'FINANCE', "Copied fee structures from academic year #{$sourceId} to #{$targetId}: {$created} created, {$skipped} skipped.", null, 'fee_structure', ['source_academic_year_id' => $sourceId, 'target_academic_year_id' => $targetId, 'created' => $created, 'skipped' => $skipped], (array)$actor ?: null);
        $this->success($response, [
            'created' => $created,
            'skipped' => $skipped,
            'failed'  => $failed,
        ], 'Fee structures copied.');
    }

    /** Identity key used to detect a fee structure already present in the target year when copying. */
    private function structureCopyKey(array $row): string
    {
        return implode('|', [
            (string)($row['fee_type'] ?? ''),
            strtolower(trim((string)($row['label'] ?? ''))),
            (string)($row['department_id'] ?? ''),
            (string)($row['level_id'] ?? ''),
            (string)($row['campus_id'] ?? ''),
            (string)($row['student_category'] ?? ''),
        ]);
    }

    /**
     * GET /api/finance/structures/schedule-export
     * Export fee structures pivoted into schedule format (one row per program).
     * Query param: academic_year_id (required)
     * Returns: pivoted rows grouped by faculty, ready for Excel/PDF rendering.
     */
    public function scheduleExportJson(Request $request, Response $response): never
    {
        $yearId = (int)($request->query('academic_year_id') ?? 0);
        if (!$yearId) {
            $this->error($response, 'academic_year_id is required.', 422);
        }

        $this->success($response, [
            'rows'          => $this->structureModel->scheduleExport($yearId),
            'general_fees'  => $this->structureModel->generalFeeRows($yearId),
        ], 'Fee schedule export data retrieved.');
    }

    /**
     * GET /api/finance/structures/schedule-export.pdf
     * Stream a PDF of the fee schedule matching the official layout.
     * Query param: academic_year_id (required)
     */
    public function scheduleExportPdf(Request $request, Response $response): never
    {
        $yearId = (int)($request->query('academic_year_id') ?? 0);
        if (!$yearId) {
            $this->error($response, 'academic_year_id is required.', 422);
        }

        $rows        = $this->structureModel->scheduleExport($yearId);
        $generalFees = $this->structureModel->generalFeeRows($yearId);
        $year        = $this->db->fetchOne("SELECT label FROM academic_years WHERE id = ?", [$yearId]);
        $yearLabel   = $year['label'] ?? 'Academic Year';

        // Stream PDF using the helper
        \App\Helpers\FeeSchedulePdf::streamPdf($rows, $generalFees, ['academic_year' => $yearLabel], "Fee-Schedule-{$yearLabel}.pdf");
    }

    /**
     * GET /api/finance/postgraduate/schedule-export
     * Export the postgraduate fee schedule (local/EAC or international) pivoted by department.
     * Query params: academic_year_id (required), category=local|international (default local)
     */
    public function postgraduateScheduleExportJson(Request $request, Response $response): never
    {
        $yearId = (int)($request->query('academic_year_id') ?? 0);
        if (!$yearId) {
            $this->error($response, 'academic_year_id is required.', 422);
        }
        $category = $request->query('category') === 'international' ? 'international' : 'local';

        $rows = $category === 'international'
            ? $this->pgIntlStructureModel->scheduleExport($yearId)
            : $this->structureModel->postgraduateScheduleExport($yearId);

        $this->success($response, [
            'category'    => $category,
            'rows'        => $rows,
            'other_fees'  => $this->structureModel->postgraduateOtherFees($yearId),
        ], 'Postgraduate fee schedule export data retrieved.');
    }

    /**
     * GET /api/finance/postgraduate/schedule-export.pdf
     * Stream a PDF of the postgraduate fee schedule matching the official signed layout.
     * Query params: academic_year_id (required), category=local|international (default local)
     */
    public function postgraduateScheduleExportPdf(Request $request, Response $response): never
    {
        $yearId = (int)($request->query('academic_year_id') ?? 0);
        if (!$yearId) {
            $this->error($response, 'academic_year_id is required.', 422);
        }
        $category = $request->query('category') === 'international' ? 'international' : 'local';

        $rows = $category === 'international'
            ? $this->pgIntlStructureModel->scheduleExport($yearId)
            : $this->structureModel->postgraduateScheduleExport($yearId);
        $otherFees = $this->structureModel->postgraduateOtherFees($yearId);

        $year      = $this->db->fetchOne("SELECT label FROM academic_years WHERE id = ?", [$yearId]);
        $yearLabel = $year['label'] ?? 'Academic Year';
        $suffix    = $category === 'international' ? 'International' : 'Local-EAC';

        \App\Helpers\PostgraduateFeeSchedulePdf::streamPdf(
            $rows,
            $otherFees,
            ['academic_year' => $yearLabel, 'category' => $category],
            "Postgraduate-Fee-Schedule-{$suffix}-{$yearLabel}.pdf"
        );
    }

    // ────────────────────────────────────────────────────────────────────────
    // Fee Invoice / Bill PDF Downloads
    // ────────────────────────────────────────────────────────────────────────

    /**
     * GET /api/finance/invoices/:id/pdf
     * Download a single fee invoice as PDF.
     */
    public function downloadInvoicePdf(Request $request, Response $response): never
    {
        $invoiceId = (int)$request->param('id');
        $invoice = $this->invoiceModel->find($invoiceId);

        if (!$invoice) {
            $this->error($response, 'Invoice not found.', 404);
        }

        // Fetch student and fee type info
        $db = \Core\Database::getInstance();
        $studentRaw = $db->fetchOne(
            "SELECT s.*, d.dep_name, f.fac_name
             FROM student s
             LEFT JOIN departements d ON d.dep_id = s.department
             LEFT JOIN faculty f ON f.fac_id = d.fac_id
             WHERE s.regnumber = ?
             LIMIT 1",
            [(string)$invoice['student_id']]
        );

        if (!$studentRaw) {
            $this->error($response, 'Student not found.', 404);
        }

        $feeType = $db->fetchOne(
            "SELECT label FROM fee_types WHERE code = ? LIMIT 1",
            [(string)$invoice['fee_type']]
        );

        // Build invoice line item
        $invoiceLines = [[
            'label'        => $feeType['label'] ?? $invoice['fee_type'] ?? 'Fee',
            'amount_due'   => (float)$invoice['amount_due'],
            'amount_paid'  => (float)$invoice['amount_paid'],
            'balance'      => (float)$invoice['amount_due'] - (float)$invoice['amount_paid'],
        ]];

        $meta = [
            'title'           => 'Fee Invoice',
            'academic_year'   => $invoice['academic_year_id'],
            'semester'        => $invoice['semester'],
            'generated_date'  => date('Y-m-d'),
        ];

        \App\Helpers\FeeInvoicePdf::streamPdf(
            $studentRaw,
            $invoiceLines,
            $meta,
            "invoice-{$invoiceId}.pdf"
        );
    }

    /**
     * GET /api/finance/students/:studentId/bill/pdf
     * Download a consolidated bill/statement for a student for a given academic year/semester.
     * Query params: academic_year_id, semester (optional)
     */
    public function downloadStudentBillPdf(Request $request, Response $response): never
    {
        $studentId = (string)$request->param('studentId');
        $yearId = (int)($request->query()['academic_year_id'] ?? 0);
        $semester = !empty($request->query()['semester']) ? (int)$request->query()['semester'] : null;

        if (!$yearId) {
            $this->error($response, 'academic_year_id is required.', 422);
        }

        // Fetch student
        $db = \Core\Database::getInstance();
        $studentRaw = $db->fetchOne(
            "SELECT s.*, d.dep_name, f.fac_name
             FROM student s
             LEFT JOIN departements d ON d.dep_id = s.department
             LEFT JOIN faculty f ON f.fac_id = d.fac_id
             WHERE s.regnumber = ?
             LIMIT 1",
            [$studentId]
        );

        if (!$studentRaw) {
            $this->error($response, 'Student not found.', 404);
        }

        // Fetch all invoices for this student in the year (and optional semester)
        $semesterSql = $semester !== null ? 'AND fi.semester = ?' : 'AND (fi.semester IS NULL OR fi.semester = 1)';
        $bindings = [$studentId, $yearId];
        if ($semester !== null) {
            $bindings[] = $semester;
        }

        $invoices = $db->fetchAll(
            "SELECT fi.*, ft.label as fee_type_label
             FROM fee_invoices fi
             LEFT JOIN fee_types ft ON ft.code = fi.fee_type
             WHERE fi.student_id = ? AND fi.academic_year_id = ? {$semesterSql}
             ORDER BY fi.fee_type, fi.id",
            $bindings
        );

        // Build consolidated invoice lines (empty if no invoices)
        $invoiceLines = [];
        $totalDue = 0;
        $totalPaid = 0;
        foreach ($invoices as $inv) {
            $invoiceLines[] = [
                'label'        => $inv['fee_type_label'] ?? $inv['fee_type'] ?? 'Fee',
                'amount_due'   => (float)$inv['amount_due'],
                'amount_paid'  => (float)$inv['amount_paid'],
                'balance'      => (float)$inv['amount_due'] - (float)$inv['amount_paid'],
            ];
            $totalDue += (float)$inv['amount_due'];
            $totalPaid += (float)$inv['amount_paid'];
        }

        // If no invoices, still generate bill showing zero balance
        if (empty($invoiceLines)) {
            $invoiceLines = [
                [
                    'label'        => 'No invoices generated',
                    'amount_due'   => 0,
                    'amount_paid'  => 0,
                    'balance'      => 0,
                ]
            ];
        }

        // Fetch academic year label
        $year = $db->fetchOne("SELECT label FROM academic_years WHERE id = ? LIMIT 1", [$yearId]);
        $yearLabel = $year['label'] ?? $yearId;

        $meta = [
            'title'           => 'Statement of Account',
            'academic_year'   => $yearLabel,
            'semester'        => $semester,
            'generated_date'  => date('Y-m-d'),
        ];

        \App\Helpers\FeeInvoicePdf::streamPdf(
            $studentRaw,
            $invoiceLines,
            $meta,
            "bill-{$studentId}-{$yearLabel}.pdf"
        );
    }

    /**
     * GET /api/finance/my/bill/pdf
     * Student self-service: download own bill (requires authentication).
     * Query params: academic_year_id, semester (optional)
     */
    public function downloadMyBillPdf(Request $request, Response $response): never
    {
        $studentRegnumber = $this->authStudentRegnumber($request);
        if (!$studentRegnumber) {
            $this->error($response, 'Only authenticated students can access this endpoint.', 403);
        }

        // Reuse the same logic as downloadStudentBillPdf but for the authenticated student
        $yearId = (int)($request->query()['academic_year_id'] ?? 0);
        if (!$yearId) {
            $this->error($response, 'academic_year_id is required.', 422);
        }

        $studentId = (string)$studentRegnumber;
        $semester = !empty($request->query()['semester']) ? (int)$request->query()['semester'] : null;

        $db = \Core\Database::getInstance();
        $studentRaw = $db->fetchOne(
            "SELECT s.*, d.dep_name, f.fac_name
             FROM student s
             LEFT JOIN departements d ON d.dep_id = s.department
             LEFT JOIN faculty f ON f.fac_id = d.fac_id
             WHERE s.regnumber = ?
             LIMIT 1",
            [$studentId]
        );

        if (!$studentRaw) {
            $this->error($response, 'Student record not found.', 404);
        }

        $semesterSql = $semester !== null ? 'AND fi.semester = ?' : 'AND (fi.semester IS NULL OR fi.semester = 1)';
        $bindings = [$studentId, $yearId];
        if ($semester !== null) {
            $bindings[] = $semester;
        }

        $invoices = $db->fetchAll(
            "SELECT fi.*, ft.label as fee_type_label
             FROM fee_invoices fi
             LEFT JOIN fee_types ft ON ft.code = fi.fee_type
             WHERE fi.student_id = ? AND fi.academic_year_id = ? {$semesterSql}
             ORDER BY fi.fee_type, fi.id",
            $bindings
        );

        if (empty($invoices)) {
            $this->error($response, 'No invoices found for your account in the specified period.', 404);
        }

        $invoiceLines = [];
        foreach ($invoices as $inv) {
            $invoiceLines[] = [
                'label'        => $inv['fee_type_label'] ?? $inv['fee_type'] ?? 'Fee',
                'amount_due'   => (float)$inv['amount_due'],
                'amount_paid'  => (float)$inv['amount_paid'],
                'balance'      => (float)$inv['amount_due'] - (float)$inv['amount_paid'],
            ];
        }

        $year = $db->fetchOne("SELECT label FROM academic_years WHERE id = ? LIMIT 1", [$yearId]);
        $yearLabel = $year['label'] ?? $yearId;

        $meta = [
            'title'           => 'Statement of Account',
            'academic_year'   => $yearLabel,
            'semester'        => $semester,
            'generated_date'  => date('Y-m-d'),
        ];

        \App\Helpers\FeeInvoicePdf::streamPdf(
            $studentRaw,
            $invoiceLines,
            $meta,
            "bill-{$yearLabel}.pdf"
        );
    }

    /**
     * GET /api/finance/reports/application-fee-reconciliation
     * Returns application fee reconciliation report.
     */
    public function applicationFeeReconciliation(Request $request, Response $response): never
    {
        $this->success($response, [], 'Application fee reconciliation report.');
    }

    /**
     * POST /api/finance/reports/application-fee-reconciliation/run-pending
     *
     * Batch-credit all enrolled students whose application fee has not yet
     * been transferred. Useful for backfilling after the feature is deployed.
     *
     * Body: { academic_year_id: int }
     */
    public function runPendingApplicationFeeCredits(Request $request, Response $response): never
    {
        $data   = $request->body();
        $actor  = $request->param('_auth_user');
        $yearId = (int)($data['academic_year_id'] ?? 0);

        if (!$yearId) {
            $this->error($response, 'academic_year_id is required.', 422);
        }

        $tableExists = (bool)$this->db->fetchOne(
            "SELECT COUNT(*) AS cnt FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications'",
            []
        )['cnt'];

        if (!$tableExists) {
            $this->error($response, 'student_applications table not found — admissions module not yet migrated.', 422);
        }

        // Fetch pending: enrolled but not yet transferred, scoped to the given year
        $pending = $this->db->fetchAll(
            "SELECT sa.id AS application_id,
                    sa.enrolled_student_id,
                    sa.payment_amount,
                    sa.transaction_id
             FROM `student_applications` sa
             WHERE sa.enrolled_student_id IS NOT NULL
               AND sa.paid_at IS NOT NULL
               AND COALESCE(sa.payment_amount, 0) > 0
               AND sa.transaction_id IS NOT NULL
               AND sa.academic_year_id = ?
               AND NOT EXISTS (
                 SELECT 1 FROM `fee_payments` fp
                 WHERE fp.source = 'APPLICATION_TRANSFER'
                   AND fp.source_application_id = sa.id
               )",
            [$yearId]
        );

        $results  = ['credited' => 0, 'skipped' => 0, 'errors' => 0, 'details' => []];
        $actorId  = (int)($actor['id'] ?? 0);

        foreach ($pending as $row) {
            try {
                $result = $this->service->creditApplicationFee(
                    studentId:      (string)$row['enrolled_student_id'],
                    academicYearId: $yearId,
                    amount:         (float)$row['payment_amount'],
                    transactionRef: (string)$row['transaction_id'],
                    applicationId:  (int)$row['application_id'],
                    actorId:        $actorId
                );
                if ($result['status'] === 'credited') {
                    $results['credited']++;
                } else {
                    $results['skipped']++;
                }
                $results['details'][] = ['id' => $row['application_id'], 'result' => $result['status']];
            } catch (\Throwable $e) {
                $results['errors']++;
                $results['details'][] = ['id' => $row['application_id'], 'result' => 'error', 'message' => $e->getMessage()];
            }
        }

        $this->success($response, $results, "Batch complete: {$results['credited']} credited, {$results['skipped']} skipped, {$results['errors']} errors.");
    }

    /**
     * GET /api/finance/billing/intake-years
     * Fetch unique intake years from student table for billing year selection
     */
    public function getIntakeYears(Request $request, Response $response): never
    {
        try {
            $years = $this->db->fetchAll(
                "SELECT DISTINCT s.intake AS year
                 FROM `student` s
                 WHERE s.intake IS NOT NULL AND s.intake != ''
                 ORDER BY s.intake DESC",
                []
            );

            $formatted = array_map(function($row) {
                $intake = $row['year'];
                // Normalize format: convert "2023-2024" to "2023/2024" for matching
                $normalized = str_replace('-', '/', $intake);

                // Try to find matching academic year
                $ay = $this->db->fetchOne(
                    "SELECT id FROM `academic_years` WHERE label = ? OR label = ? LIMIT 1",
                    [$normalized, $intake]
                );

                return [
                    'id' => $ay ? (int)$ay['id'] : $intake,
                    'label' => $intake
                ];
            }, $years);

            $this->success($response, $formatted, 'Intake years retrieved.');
        } catch (\Exception $e) {
            $this->error($response, 'Failed to fetch intake years: ' . $e->getMessage(), 500);
        }
    }
}

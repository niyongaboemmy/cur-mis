<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\RefundModel;
use App\Models\FeeInvoiceModel;
use App\Models\FeePaymentModel;
use App\Services\FeeService;
use App\Services\ClearanceService;
use App\Helpers\ValidationHelper;

class RefundController extends BaseController
{
    private RefundModel      $refundModel;
    private FeeInvoiceModel  $invoiceModel;
    private FeePaymentModel  $paymentModel;
    private FeeService       $feeService;
    private ClearanceService $clearanceService;

    public function __construct()
    {
        $this->refundModel      = new RefundModel();
        $this->invoiceModel     = new FeeInvoiceModel();
        $this->paymentModel     = new FeePaymentModel();
        $this->feeService       = new FeeService();
        $this->clearanceService = new ClearanceService();
    }

    /**
     * GET /api/finance/refunds
     */
    public function listRefunds(Request $request, Response $response): never
    {
        $filters = array_filter([
            'student_id' => $request->query('student_id') ?? '',
            'status'     => $request->query('status')     ?? '',
            'category'   => $request->query('category')   ?? '',
        ], fn ($v) => $v !== '');

        $page    = max(1, (int)($request->query('page')     ?? 1));
        $perPage = max(1, min(100, (int)($request->query('per_page') ?? 20)));

        $this->success($response, $this->refundModel->listWithDetails($filters, $page, $perPage), 'Refunds retrieved.');
    }

    /**
     * POST /api/finance/refunds
     */
    public function createRefund(Request $request, Response $response): never
    {
        $data  = $request->body();
        $actor = $request->param('_auth_user');

        $errors = ValidationHelper::validate($data, [
            'student_id' => 'required|string',
            'payment_id' => 'required|numeric',
            'amount'     => 'required|numeric',
            'category'   => 'required|in:REFUND,CAUTION,OVERPAYMENT',
            'reason'     => 'required|string',
        ]);
        if (!empty($errors)) $this->error($response, 'Validation failed.', 422, $errors);

        $amount    = (float)($data['amount'] ?? 0);
        $paymentId = (int)($data['payment_id'] ?? 0);

        if ($amount <= 0) $this->error($response, 'Amount must be greater than zero.', 422);

        // Verify the payment exists, belongs to this student, and is confirmed
        $payment = $this->paymentModel->find($paymentId);
        if (!$payment)
            $this->error($response, 'Payment not found.', 404);
        if ($payment['student_id'] !== $data['student_id'])
            $this->error($response, 'Payment does not belong to this student.', 422);
        if ($payment['status'] !== 'confirmed')
            $this->error($response, 'Only confirmed payments can be refunded.', 422);

        // Enforce ceiling: cannot refund more than the original payment
        $alreadyRefunded = (float)($this->refundModel->db()->fetchOne(
            "SELECT COALESCE(SUM(amount), 0) AS total
             FROM `fee_refunds`
             WHERE payment_id = ? AND status != 'rejected'",
            [$paymentId]
        )['total'] ?? 0);

        $available = (float)$payment['amount'] - $alreadyRefunded;
        if ($amount > $available)
            $this->error($response, sprintf(
                'Refund amount (%.2f) exceeds available refundable balance (%.2f) for this payment.',
                $amount, $available
            ), 422);

        $id = $this->refundModel->create([
            'student_id' => $data['student_id'],
            'payment_id' => $paymentId,
            'amount'     => $amount,
            'category'   => $data['category'],
            'reason'     => $data['reason'],
            'status'     => 'pending',
            'notes'      => $data['notes'] ?? null,
        ]);

        $this->success($response, ['id' => (int)$id], 'Refund request created.', 201);
    }

    /**
     * PATCH /api/finance/refunds/:id/process
     * Marks the refund as processed and creates a BURSARY_CREDIT invoice to reduce student balance.
     */
    public function processRefund(Request $request, Response $response): never
    {
        $id    = (int)$request->param('id');
        $actor = $request->param('_auth_user');
        $data  = $request->body();

        $refund = $this->refundModel->find($id);
        if (!$refund)                      $this->error($response, 'Refund not found.', 404);
        if ($refund['status'] !== 'pending') $this->error($response, 'Only pending refunds can be processed.', 422);

        // We need an academic_year_id to create the credit invoice; caller must provide it
        $academicYearId = (int)($data['academic_year_id'] ?? 0);
        if (!$academicYearId) $this->error($response, 'academic_year_id is required to process a refund.', 422);

        // Mark refund as processed
        $this->refundModel->update($id, [
            'status'       => 'processed',
            'processed_by' => (int)$actor['id'],
            'notes'        => $data['notes'] ?? $refund['notes'],
        ]);

        // Create a BURSARY_CREDIT invoice to reduce the student's outstanding balance
        $existing = $this->invoiceModel->db()->fetchOne(
            "SELECT id FROM `fee_invoices`
             WHERE student_id = ? AND academic_year_id = ? AND fee_type = 'BURSARY_CREDIT'
               AND description LIKE 'Refund credit%'
             LIMIT 1",
            [$refund['student_id'], $academicYearId]
        );

        if ($existing) {
            // Increment an existing refund credit line
            $this->invoiceModel->db()->execute(
                "UPDATE `fee_invoices`
                 SET bursary_applied = bursary_applied + ?, updated_at = NOW()
                 WHERE id = ?",
                [(float)$refund['amount'], (int)$existing['id']]
            );
            $this->invoiceModel->recalculateStatus((int)$existing['id']);
        } else {
            $this->invoiceModel->create([
                'invoice_number'      => $this->feeService->generateInvoiceNumber(),
                'student_id'          => $refund['student_id'],
                'academic_year_id'    => $academicYearId,
                'fee_type'            => 'BURSARY_CREDIT',
                'description'         => 'Refund credit: ' . $refund['category'],
                'amount_due'          => 0,
                'bursary_applied'     => (float)$refund['amount'],
                'status'              => 'paid',
                'is_system_generated' => 1,
                'created_by'          => (int)$actor['id'],
            ]);
        }

        // Recalculate clearance after balance change
        $this->clearanceService->computeAndSave($refund['student_id'], $academicYearId, null, (int)$actor['id']);

        $this->success($response, null, 'Refund processed and balance updated.');
    }

    /**
     * PATCH /api/finance/refunds/:id/reject
     */
    public function rejectRefund(Request $request, Response $response): never
    {
        $id    = (int)$request->param('id');
        $actor = $request->param('_auth_user');
        $data  = $request->body();

        $refund = $this->refundModel->find($id);
        if (!$refund)                        $this->error($response, 'Refund not found.', 404);
        if ($refund['status'] !== 'pending') $this->error($response, 'Only pending refunds can be rejected.', 422);

        $this->refundModel->update($id, [
            'status'       => 'rejected',
            'processed_by' => (int)$actor['id'],
            'notes'        => $data['notes'] ?? $refund['notes'],
        ]);

        $this->success($response, null, 'Refund rejected.');
    }
}

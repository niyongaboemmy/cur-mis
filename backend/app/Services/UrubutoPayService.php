<?php

declare(strict_types=1);

namespace App\Services;

use Core\Database;
use App\Models\FeeInvoiceModel;
use App\Models\FeePaymentModel;
use App\Services\SystemLogService;

class UrubutoPayService
{
    private Database        $db;
    private FeeInvoiceModel $invoiceModel;
    private FeePaymentModel $paymentModel;

    private const MERCHANT_CODE   = 'TH17342831';
    private const CHECKOUT_BASE   = 'https://urubutopay.rw/pay-now';
    private const SERVICES = [
        ['service_code' => 'tuition-fees-1258', 'service_name' => 'TUITION FEES', 'amount' => 0, 'currency' => 'RWF'],
        ['service_code' => 'cursu-fees-8249',   'service_name' => 'CURSU FEES',   'amount' => 0, 'currency' => 'RWF'],
    ];

    public function __construct()
    {
        $this->db           = Database::getInstance();
        $this->invoiceModel = new FeeInvoiceModel();
        $this->paymentModel = new FeePaymentModel();
    }

    // ── Authentication ────────────────────────────────────────────────────────

    /**
     * Validate UrubutoPay API credentials and return the stored bearer token.
     * Supports plain-text, MD5, SHA-1, SHA-256, and bcrypt passwords.
     * Returns null when credentials are invalid.
     */
    public function authenticateApiUser(string $username, string $password): ?array
    {
        // Column is `username` (not `user_name`) in api_authorization table
        $row = $this->db->fetchOne(
            'SELECT token, merchant_code, password AS stored_pw FROM api_authorization WHERE username = ? LIMIT 1',
            [$username]
        );
        if (!$row) {
            return null;
        }

        $stored = (string)$row['stored_pw'];
        $valid  = $password === $stored
            || md5($password)              === $stored
            || sha1($password)             === $stored
            || hash('sha256', $password)   === $stored
            || (function_exists('password_verify') && password_verify($password, $stored));

        if (!$valid) {
            return null;
        }

        return [
            'token'         => 'Bearer ' . $row['token'],
            'merchant_code' => $row['merchant_code'] ?? self::MERCHANT_CODE,
        ];
    }

    // ── Payer Validation ──────────────────────────────────────────────────────

    /**
     * Validate that a student exists and return the UrubutoPay-spec payer payload.
     * Returns null when the student is not found.
     */
    public function validatePayer(string $payerCode, string $merchantCode): ?array
    {
        $student = $this->lookupStudent($payerCode);
        if (!$student) {
            return null;
        }

        $payer_names = trim(strtoupper($student['fname'] ?? '') . ' ' . strtoupper($student['lname'] ?? ''));

        return [
            'payer_names'     => $payer_names,
            'merchant_code'   => $merchantCode,
            'payer_code'      => $payerCode,
            'service_code'    => self::SERVICES[0]['service_code'],
            'commission_rate' => 0,
            'services'        => self::SERVICES,
        ];
    }

    // ── Payment Callback ──────────────────────────────────────────────────────

    /**
     * Record an incoming UrubutoPay PAYMENT callback.
     * Applies the amount to the student's oldest unpaid invoices (waterfall).
     *
     * @param array $cb  Decoded callback JSON body
     * @return array{status:string, payment_id:int|null, message:string}
     */
    public function recordMobilePayment(array $cb): array
    {
        if (($cb['callback_type'] ?? '') !== 'PAYMENT' || ($cb['status'] ?? '') !== 'SUCCESSFUL') {
            return ['status' => 'ignored', 'payment_id' => null, 'message' => 'Non-payment callback ignored'];
        }

        $txCode      = trim((string)($cb['transaction_code'] ?? ''));
        $payerCode   = trim((string)($cb['payer_code'] ?? ''));
        $amount      = (float)($cb['amount'] ?? 0);
        $serviceCode = trim((string)($cb['service_code'] ?? ''));
        $paymentDate = trim((string)($cb['payment_date'] ?? date('Y-m-d H:i:s')));

        if ($txCode === '' || $payerCode === '' || $amount <= 0) {
            return ['status' => 'error', 'payment_id' => null, 'message' => 'Invalid callback data'];
        }

        // Idempotency — check if any payment with this transaction code already exists
        $existing = $this->db->fetchOne(
            "SELECT id FROM fee_payments WHERE reference_number = ? OR reference_number LIKE ? LIMIT 1",
            [$txCode, $txCode . '-%']
        );
        if ($existing) {
            return ['status' => 'duplicate', 'payment_id' => (int)$existing['id'], 'message' => 'Payment already recorded'];
        }

        $student = $this->lookupStudent($payerCode);
        if (!$student) {
            return ['status' => 'error', 'payment_id' => null, 'message' => 'Student not found'];
        }

        $studentId   = (string)$student['regnumber'];
        $subMethod   = $this->resolveSubMethod($cb);

        // Waterfall: apply payment to oldest unpaid/partial invoices first
        $invoices = $this->db->fetchAll(
            "SELECT id, amount_due, amount_paid, IFNULL(bursary_applied, 0) AS bursary_applied
             FROM fee_invoices
             WHERE student_id = ? AND status NOT IN ('paid','waived','cancelled')
             ORDER BY created_at ASC",
            [$studentId]
        );

        $remaining      = $amount;
        $firstPaymentId = null;
        $appliedCount   = 0;

        foreach ($invoices as $invoice) {
            if ($remaining <= 0) {
                break;
            }
            $gap = (float)$invoice['amount_due'] - (float)$invoice['amount_paid'] - (float)$invoice['bursary_applied'];
            if ($gap <= 0) {
                continue;
            }
            $apply         = min($remaining, $gap);
            $receiptNumber = $this->generateReceiptNumber();
            $refNumber     = $txCode . ($appliedCount > 0 ? '-' . ($appliedCount + 1) : '');

            $paymentId = (int)$this->paymentModel->create([
                'invoice_id'       => (int)$invoice['id'],
                'student_id'       => $studentId,
                'amount'           => $apply,
                'payment_method'   => 'MOBILE_MONEY',
                'payment_sub_method' => $subMethod,
                'reference_number' => $refNumber,
                'receipt_number'   => $receiptNumber,
                'status'           => 'confirmed',
                'notes'            => 'UrubutoPay USSD/mobile — service: ' . $serviceCode . ', tx: ' . $txCode,
                'paid_at'          => $paymentDate,
            ]);

            $this->invoiceModel->applyPayment((int)$invoice['id'], $apply);

            if ($firstPaymentId === null) {
                $firstPaymentId = $paymentId;
            }
            $remaining -= $apply;
            $appliedCount++;
        }

        SystemLogService::log(
            'CREATE',
            'FINANCE',
            "UrubutoPay payment: tx={$txCode}, student={$studentId}, amount={$amount} RWF, invoices_applied={$appliedCount}.",
            $firstPaymentId,
            'fee_payment',
            ['transaction_code' => $txCode, 'amount' => $amount, 'service_code' => $serviceCode]
        );

        return [
            'status'     => 'recorded',
            'payment_id' => $firstPaymentId,
            'message'    => 'Payment recorded',
        ];
    }

    // ── Checkout URL ──────────────────────────────────────────────────────────

    /**
     * Build UrubutoPay hosted checkout URL for the given student.
     * Returns the URL, outstanding balance, and currency.
     */
    public function generateCheckoutUrl(string $regNumber): array
    {
        $merchantCode = $_ENV['URUBUTOPAY_MERCHANT_CODE'] ?? self::MERCHANT_CODE;
        $checkoutBase = $_ENV['URUBUTOPAY_CHECKOUT_URL']  ?? self::CHECKOUT_BASE;
        $checkoutUrl  = $checkoutBase . '?mhcd=' . urlencode($merchantCode) . '&pycd=' . urlencode($regNumber);

        $balance = $this->getOutstandingBalance($regNumber);

        return [
            'checkout_url' => $checkoutUrl,
            'amount_due'   => $balance,
            'currency'     => 'RWF',
        ];
    }

    // ── Mobile Payment History ────────────────────────────────────────────────

    /**
     * Return recent MOBILE_MONEY confirmed payments for a student.
     *
     * @return array<int,array<string,mixed>>
     */
    public function getMobilePaymentHistory(string $regNumber, int $limit = 10): array
    {
        return $this->db->fetchAll(
            "SELECT fp.id,
                    fp.reference_number AS transaction_code,
                    fp.amount,
                    fp.payment_sub_method,
                    fp.receipt_number,
                    fp.notes,
                    fp.paid_at AS payment_date,
                    fp.status,
                    fp.created_at,
                    fi.invoice_number,
                    fi.fee_type
             FROM fee_payments fp
             LEFT JOIN fee_invoices fi ON fi.id = fp.invoice_id
             WHERE fp.student_id = ?
               AND fp.payment_method = 'MOBILE_MONEY'
               AND fp.status = 'confirmed'
             ORDER BY fp.paid_at DESC
             LIMIT {$limit}",
            [$regNumber]
        );
    }

    // ── Private Helpers ───────────────────────────────────────────────────────

    private function lookupStudent(string $payerCode): ?array
    {
        $row = $this->db->fetchOne(
            "SELECT regnumber, fname, lname FROM student WHERE regnumber = ? LIMIT 1",
            [$payerCode]
        );
        return $row ?: null;
    }

    private function getOutstandingBalance(string $regNumber): float
    {
        $row = $this->db->fetchOne(
            "SELECT GREATEST(0, COALESCE(SUM(amount_due - amount_paid - IFNULL(bursary_applied, 0)), 0)) AS balance
             FROM fee_invoices
             WHERE student_id = ? AND status NOT IN ('paid','waived','cancelled')",
            [$regNumber]
        );
        return (float)($row['balance'] ?? 0);
    }

    private function generateReceiptNumber(): string
    {
        $year = date('Y');
        $row  = $this->db->fetchOne(
            "SELECT COUNT(*) AS cnt FROM fee_payments WHERE receipt_number LIKE ?",
            ["RCP-{$year}-%"]
        );
        $seq = str_pad((string)(((int)($row['cnt'] ?? 0)) + 1), 6, '0', STR_PAD_LEFT);
        return "RCP-{$year}-{$seq}";
    }

    private function resolveSubMethod(array $cb): string
    {
        $channel = strtoupper(trim((string)($cb['channel'] ?? $cb['payment_channel'] ?? '')));
        if (str_contains($channel, 'AIRTEL')) {
            return 'AIRTEL_MONEY';
        }
        return 'MTN_MOMO';
    }
}

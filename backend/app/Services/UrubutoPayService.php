<?php

declare(strict_types=1);

namespace App\Services;

use Core\Database;
use App\Models\FeeInvoiceModel;
use App\Models\FeePaymentModel;
use App\Services\ClearanceService;
use App\Services\SystemLogService;

/**
 * UrubutoPayService
 *
 * Handles all UrubutoPay webhook interactions.
 *
 * On payment callback, writes to THREE tables in parallel:
 *   1. fee_payments  — modern normalised payment record
 *   2. payment       — legacy main ledger (for existing reports/dashboards)
 *   3. bank_payment  — legacy bank-payment staging table
 *
 * The `payment` and `bank_payment` writes use:
 *   bank_id = 1     (BK / UrubutoPay channel, from tbl_bank)
 *   fee_category = '147'  (bank payment category)
 *   payment_chanel = 'BK'
 *   status = 1 (confirmed by gateway callback)
 */
class UrubutoPayService
{
    private Database        $db;
    private FeeInvoiceModel  $invoiceModel;
    private FeePaymentModel  $paymentModel;
    private ClearanceService $clearanceService;

    private const MERCHANT_CODE   = '';  // always resolved from DB or .env — never hardcode
    private const CHECKOUT_BASE   = 'https://urubutopay.rw/pay-now';
    private const LEGACY_BANK_ID  = 1;      // tbl_bank.bank_id for BK
    private const FEE_CATEGORY_BK = '147';  // legacy fee_category for bank payments
    // UrubutoPay-registered service codes — these are fixed by the gateway, never change
    private const SERVICE_MAP = [
        'TUITION'      => ['service_code' => 'tuition-fees-1258', 'service_name' => 'TUITION FEES'],
        'REGISTRATION' => ['service_code' => 'cursu-fees-8249',   'service_name' => 'CURSU FEES'],
        'ADMISSION'    => ['service_code' => 'cursu-fees-8249',   'service_name' => 'CURSU FEES'],
        'HOSTEL'       => ['service_code' => 'cursu-fees-8249',   'service_name' => 'CURSU FEES'],
        'FINE'         => ['service_code' => 'cursu-fees-8249',   'service_name' => 'CURSU FEES'],
        'ARREARS'      => ['service_code' => 'tuition-fees-1258', 'service_name' => 'TUITION FEES'],
        'MODULE_FEE'   => ['service_code' => 'tuition-fees-1258', 'service_name' => 'TUITION FEES'],
    ];

    public function __construct()
    {
        $this->db               = Database::getInstance();
        $this->invoiceModel     = new FeeInvoiceModel();
        $this->paymentModel     = new FeePaymentModel();
        $this->clearanceService = new ClearanceService();
    }

    // ── Authentication ────────────────────────────────────────────────────────

    public function authenticateApiUser(string $username, string $password): ?array
    {
        $row = $this->db->fetchOne(
            'SELECT id, token, merchant_code, password AS stored_pw FROM api_authorization WHERE username = ? LIMIT 1',
            [$username]
        );
        if (!$row) {
            return null;
        }

        $stored = (string)$row['stored_pw'];
        $valid  = $password === $stored
            || md5($password)            === $stored
            || sha1($password)           === $stored
            || hash('sha256', $password) === $stored
            || function_exists('password_verify') && password_verify($password, $stored);

        if (!$valid) {
            return null;
        }

        $newToken  = bin2hex(random_bytes(32));
        $expiresAt = date('Y-m-d H:i:s', time() + 7200); // 2 hours

        $this->db->execute(
            'UPDATE api_authorization SET token = ?, token_expires_at = ? WHERE id = ?',
            [$newToken, $expiresAt, (int)$row['id']]
        );

        return [
            'token'         => 'Bearer ' . $newToken,
            'merchant_code' => $row['merchant_code'] ?? self::MERCHANT_CODE,
        ];
    }

    // ── Payer Validation ──────────────────────────────────────────────────────

    public function validatePayer(string $payerCode, string $merchantCode): ?array
    {
        $student = $this->lookupStudent($payerCode);
        if (!$student) {
            return null;
        }

        $payer_names     = trim(strtoupper($student['fname'] ?? '') . ' ' . strtoupper($student['lname'] ?? ''));
        $totalOutstanding = (int) round($this->getOutstandingBalance($student['regnumber']));

        return [
            'merchant_code'               => $merchantCode,
            'payer_code'                  => $student['regnumber'],
            'payer_names'                 => $payer_names,
            'currency'                    => 'RWF',
            'payer_must_pay_total_amount' => 'NO',
            'amount'                      => $totalOutstanding,
            'comment'                     => 'school fees',
        ];
    }

    /**
     * Build the UrubutoPay services list dynamically from the student's outstanding
     * fee_invoices balances. Each fee_type maps to a UrubutoPay service_code registered
     * on the gateway. Amounts reflect actual outstanding balance so the student sees
     * what they owe on the USSD screen instead of always 0.
     *
     * service_codes are fixed by UrubutoPay (pre-registered) — only amounts are dynamic.
     * If the student has no open invoices, returns the full service list with amount=0
     * so the USSD session can still proceed (student pays a custom amount).
     */
    private function buildServices(string $studentId): array
    {
        // Sum outstanding balance per fee_type from open invoices
        $rows = $this->db->fetchAll(
            "SELECT fee_type,
                    GREATEST(0, ROUND(SUM(amount_due - amount_paid - IFNULL(bursary_applied, 0)), 2)) AS outstanding
             FROM fee_invoices
             WHERE student_id = ?
               AND status NOT IN ('paid', 'waived', 'cancelled')
             GROUP BY fee_type
             HAVING outstanding > 0
             ORDER BY fee_type",
            [$studentId]
        );

        // Accumulate amounts per gateway service_code (multiple fee_types can map to one)
        $buckets = [];
        foreach ($rows as $row) {
            $type = strtoupper((string)$row['fee_type']);
            $map  = self::SERVICE_MAP[$type] ?? null;
            if (!$map) {
                continue;
            }
            $code = $map['service_code'];
            if (!isset($buckets[$code])) {
                $buckets[$code] = ['service_code' => $code, 'service_name' => $map['service_name'], 'amount' => 0.0, 'currency' => 'RWF'];
            }
            $buckets[$code]['amount'] += (float)$row['outstanding'];
        }

        // Round final amounts to nearest integer (RWF has no cents)
        foreach ($buckets as &$b) {
            $b['amount'] = (int)round($b['amount']);
        }
        unset($b);

        // Always include both registered service codes so UrubutoPay can display the menu.
        // Services with no outstanding balance get amount=0 (student can still pay ad-hoc).
        $defaults = [
            'tuition-fees-1258' => ['service_code' => 'tuition-fees-1258', 'service_name' => 'TUITION FEES', 'amount' => 0, 'currency' => 'RWF'],
            'cursu-fees-8249'   => ['service_code' => 'cursu-fees-8249',   'service_name' => 'CURSU FEES',   'amount' => 0, 'currency' => 'RWF'],
        ];

        foreach ($buckets as $code => $service) {
            $defaults[$code] = $service;
        }

        return array_values($defaults);
    }

    // ── Payment Callback ──────────────────────────────────────────────────────

    /**
     * Record an incoming UrubutoPay PAYMENT callback.
     *
     * Flow:
     *  1. Validate fields and filter non-SUCCESSFUL callbacks
     *  2. Idempotency: check fee_payments AND legacy payment table
     *  3. Look up student (returns acc_year, current_level for legacy sync)
     *  4. Resolve/auto-create fee_invoices if none exist
     *  5. Apply waterfall across oldest unpaid invoices → fee_payments
     *  6. Sync to legacy `payment` + `bank_payment` tables
     *  7. Recompute financial clearance
     */
    public function recordMobilePayment(array $cb): array
    {
        $txStatus = strtoupper(trim((string)($cb['transaction_status'] ?? '')));
        if (($cb['callback_type'] ?? '') !== 'PAYMENT' || !in_array($txStatus, ['VALID', 'PENDING_SETTLEMENT'], true)) {
            return ['status' => 'ignored', 'payment_id' => null, 'message' => 'Non-payment callback ignored'];
        }

        $txCode      = trim((string)($cb['transaction_id'] ?? $cb['transaction_code'] ?? ''));
        $payerCode   = trim((string)($cb['payer_code'] ?? ''));
        $amount      = (float)($cb['amount'] ?? 0);
        $serviceCode = trim((string)($cb['service_code'] ?? $cb['payment_purpose_code'] ?? ''));
        $rawDate     = trim((string)($cb['payment_date_time'] ?? $cb['payment_date'] ?? ''));
        $paymentDate = $rawDate !== '' ? date('Y-m-d H:i:s', strtotime($rawDate)) : date('Y-m-d H:i:s');

        if ($txCode === '' || $payerCode === '' || $amount <= 0) {
            return ['status' => 'error', 'payment_id' => null, 'message' => 'Invalid callback data: transaction_code, payer_code and amount are required'];
        }

        // ── Idempotency: check both modern and legacy tables ──────────────────
        $existingModern = $this->db->fetchOne(
            "SELECT id FROM fee_payments WHERE reference_number = ? OR reference_number LIKE ? LIMIT 1",
            [$txCode, $txCode . '-%']
        );
        if ($existingModern) {
            return ['status' => 'duplicate', 'payment_id' => (int)$existingModern['id'], 'message' => 'Payment already recorded'];
        }

        $existingLegacy = $this->db->fetchOne(
            "SELECT id FROM payment WHERE external_transaction_id = ? AND payment_notifi = 'Debit' LIMIT 1",
            [$txCode]
        );
        if ($existingLegacy) {
            return ['status' => 'duplicate', 'payment_id' => null, 'message' => 'Payment already recorded'];
        }

        // ── Student lookup ────────────────────────────────────────────────────
        $student = $this->lookupStudent($payerCode);
        if (!$student) {
            return ['status' => 'error', 'payment_id' => null, 'message' => 'Student not found: ' . $payerCode];
        }

        $studentId      = (string)$student['regnumber'];
        $academicYearId = $this->resolveAcademicYearId($studentId);

        // ── Load or auto-create fee_invoices ──────────────────────────────────
        $invoices = $this->db->fetchAll(
            "SELECT id, fee_type, semester, amount_due, amount_paid, IFNULL(bursary_applied, 0) AS bursary_applied
             FROM fee_invoices
             WHERE student_id = ? AND status NOT IN ('paid','waived','cancelled')
             ORDER BY created_at ASC",
            [$studentId]
        );

        if (empty($invoices)) {
            // No invoices yet — auto-create a placeholder TUITION invoice
            $invoiceNumber = 'AUTO-' . substr(md5($studentId . $txCode), 0, 24);
            $this->db->execute(
                "INSERT INTO fee_invoices
                 (invoice_number, student_id, academic_year_id, semester, fee_type, description,
                  amount_due, amount_paid, bursary_applied, status, is_system_generated, created_at)
                 VALUES (?, ?, ?, NULL, 'TUITION', 'Auto-created from UrubutoPay payment', ?, 0.00, 0.00, 'unpaid', 1, NOW())",
                [$invoiceNumber, $studentId, $academicYearId, $amount]
            );
            $newRow   = $this->db->fetchOne("SELECT LAST_INSERT_ID() AS id", []);
            $newId    = (int)($newRow['id'] ?? 0);
            $invoices = [['id' => $newId, 'fee_type' => 'TUITION', 'amount_due' => $amount, 'amount_paid' => 0.0, 'bursary_applied' => 0.0]];
        }

        // ── Waterfall application ─────────────────────────────────────────────
        $remaining      = $amount;
        $firstPaymentId = null;
        $firstInvoiceId = null;
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
            $invoiceId     = (int)$invoice['id'];
            $feeType       = (string)($invoice['fee_type'] ?? 'TUITION');

            $paymentId = (int)$this->paymentModel->create([
                'invoice_id'       => $invoiceId,
                'student_id'       => $studentId,
                'amount'           => $apply,
                'fee_type'         => $feeType,
                'academic_year_id' => $academicYearId,
                'semester'         => !empty($invoice['semester']) ? (int)$invoice['semester'] : null,
                'payment_method'   => 'MOBILE_MONEY',
                'reference_number' => $refNumber,
                'receipt_number'   => $receiptNumber,
                'status'           => 'confirmed',
                'notes'            => 'UrubutoPay — service: ' . $serviceCode . ', tx: ' . $txCode,
                'paid_at'          => $paymentDate,
            ]);

            // Update the invoice's amount_paid and recompute its status
            $this->invoiceModel->applyPayment($invoiceId, $apply);

            if ($firstPaymentId === null) {
                $firstPaymentId = $paymentId;
                $firstInvoiceId = $invoiceId;
            }
            $remaining -= $apply;
            $appliedCount++;
        }

        // ── Sync to legacy payment + bank_payment tables ──────────────────────
        $this->writeLegacyDebit($studentId, $txCode, $amount, $paymentDate, $serviceCode, $student, $firstInvoiceId);

        // ── Auto-clearance ────────────────────────────────────────────────────
        if ($academicYearId !== null) {
            try {
                $this->clearanceService->computeAndSave($studentId, $academicYearId, null, 0);
            } catch (\Throwable $e) {
                error_log('[Clearance ERROR] UrubutoPayService::recordMobilePayment: ' . $e->getMessage());
            }
        }

        SystemLogService::log(
            'CREATE',
            'FINANCE',
            "UrubutoPay payment: tx={$txCode}, student={$studentId}, amount={$amount} RWF, invoices_applied={$appliedCount}.",
            $firstPaymentId,
            'fee_payment',
            ['transaction_code' => $txCode, 'amount' => $amount, 'service_code' => $serviceCode]
        );

        $receiptNo = '';
        if ($firstPaymentId) {
            $r = $this->db->fetchOne("SELECT receipt_number FROM fee_payments WHERE id = ? LIMIT 1", [$firstPaymentId]);
            $receiptNo = (string)($r['receipt_number'] ?? '');
        }

        return [
            'status'               => 'recorded',
            'payment_id'           => $firstPaymentId,
            'message'              => 'Payment recorded',
            'internal_tx_id'       => $receiptNo,
            'external_tx_id'       => $txCode,
            'payer_phone_number'   => (string)($student['phone'] ?? ''),
        ];
    }

    // ── Payment Reversal ──────────────────────────────────────────────────────

    /**
     * Reverse a previously recorded UrubutoPay payment.
     *
     * Checks modern fee_payments first, then falls back to legacy payment table.
     * Writes a Credit row to legacy payment + bank_payment tables.
     * Recomputes financial clearance after reversal.
     */
    public function reversePayment(array $data): array
    {
        $txCode = trim((string)($data['transaction_code'] ?? $data['transaction_id'] ?? ''));
        $amount = (float)($data['amount'] ?? 0);

        if ($txCode === '') {
            return ['status' => 'error', 'message' => 'transaction_code is required', 'amount_reversed' => 0.0];
        }

        // ── Check modern fee_payments first ───────────────────────────────────
        $payments = $this->db->fetchAll(
            "SELECT id, invoice_id, amount, student_id
             FROM fee_payments
             WHERE (reference_number = ? OR reference_number LIKE ?)
               AND payment_method = 'MOBILE_MONEY'
               AND status = 'confirmed'
             ORDER BY id ASC",
            [$txCode, $txCode . '-%']
        );

        // ── Idempotency ───────────────────────────────────────────────────────
        $alreadyReversed = $this->db->fetchOne(
            "SELECT id FROM fee_payments
             WHERE (reference_number = ? OR reference_number LIKE ?) AND status = 'reversed'
             LIMIT 1",
            [$txCode, $txCode . '-%']
        );
        if ($alreadyReversed) {
            return ['status' => 'duplicate', 'message' => 'Payment already reversed', 'amount_reversed' => 0.0];
        }

        // ── Also check legacy payment table for Credit row ────────────────────
        $legacyCreditExists = $this->db->fetchOne(
            "SELECT id FROM payment
             WHERE external_transaction_id = ? AND payment_notifi = 'Credit'
             LIMIT 1",
            [$txCode]
        );
        if ($legacyCreditExists) {
            return ['status' => 'duplicate', 'message' => 'Payment already reversed', 'amount_reversed' => 0.0];
        }

        // ── Resolve student from either modern or legacy record ───────────────
        $studentId     = '';
        $totalReversed = 0.0;

        if (!empty($payments)) {
            $studentId = (string)$payments[0]['student_id'];
            $budget    = $amount > 0 ? $amount : PHP_FLOAT_MAX;

            foreach ($payments as $payment) {
                if ($budget <= 0.0) {
                    break;
                }
                $apply  = min($budget, (float)$payment['amount']);
                $budget -= $apply;

                $this->db->execute(
                    "UPDATE fee_payments
                     SET status = 'reversed',
                         notes = CONCAT(COALESCE(notes,''), ' [REVERSED]')
                     WHERE id = ?",
                    [(int)$payment['id']]
                );

                if ($payment['invoice_id']) {
                    $this->invoiceModel->applyPayment((int)$payment['invoice_id'], -$apply);
                }

                $totalReversed += $apply;
            }
        } else {
            // ── Fallback: legacy-only payment (no fee_payments record) ─────────
            $legacyPayment = $this->db->fetchOne(
                "SELECT student, amount FROM payment
                 WHERE external_transaction_id = ? AND payment_notifi = 'Debit'
                 ORDER BY id DESC LIMIT 1",
                [$txCode]
            );

            if (!$legacyPayment) {
                return ['status' => 'not_found', 'message' => 'No payment found for transaction: ' . $txCode, 'amount_reversed' => 0.0];
            }

            $studentId     = (string)$legacyPayment['student'];
            $totalReversed = $amount > 0 ? $amount : (float)$legacyPayment['amount'];
        }

        if ($studentId === '') {
            return ['status' => 'error', 'message' => 'Could not resolve student for reversal', 'amount_reversed' => 0.0];
        }

        // ── Sync Credit row to legacy tables ──────────────────────────────────
        $student = $this->lookupStudent($studentId);
        $this->writeLegacyCredit($studentId, $txCode, $totalReversed, $student ?? []);

        // ── Recompute clearance ───────────────────────────────────────────────
        $academicYearId = $this->resolveAcademicYearId($studentId);
        if ($academicYearId !== null) {
            try {
                $this->clearanceService->computeAndSave($studentId, $academicYearId, null, 0);
            } catch (\Throwable $e) {
                error_log('[Clearance ERROR] reversePayment: ' . $e->getMessage());
            }
        }

        SystemLogService::log(
            'UPDATE',
            'FINANCE',
            "UrubutoPay reversal: tx={$txCode}, student={$studentId}, amount_reversed={$totalReversed} RWF.",
            null,
            'fee_payment',
            ['transaction_code' => $txCode, 'amount_reversed' => $totalReversed]
        );

        return [
            'status'          => 'reversed',
            'message'         => 'Payment reversed successfully',
            'amount_reversed' => $totalReversed,
        ];
    }

    // ── Checkout URL ──────────────────────────────────────────────────────────

    public function generateCheckoutUrl(string $regNumber): array
    {
        // Prefer .env, then fall back to the merchant_code stored in api_authorization (DB is authoritative)
        $merchantCode = $_ENV['URUBUTOPAY_MERCHANT_CODE'] ?? '';
        if ($merchantCode === '') {
            $row = $this->db->fetchOne('SELECT merchant_code FROM api_authorization LIMIT 1', []);
            $merchantCode = (string)($row['merchant_code'] ?? '');
        }
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
     * Returns confirmed payments from BOTH modern (fee_payments) and legacy
     * (payment table where user='UrubutoPay') tables, deduped by transaction_code.
     */
    public function getMobilePaymentHistory(string $regNumber, int $limit = 20): array
    {
        // Modern records
        $modern = $this->db->fetchAll(
            "SELECT
                fp.reference_number  AS transaction_code,
                fp.amount,
                fp.payment_method AS channel,
                fp.receipt_number,
                fp.status,
                fp.paid_at            AS payment_date,
                fi.fee_type,
                'mobile_money'        AS source
             FROM fee_payments fp
             LEFT JOIN fee_invoices fi ON fi.id = fp.invoice_id
             WHERE fp.student_id = ?
               AND fp.payment_method = 'MOBILE_MONEY'
               AND fp.status IN ('confirmed','reversed')
             ORDER BY fp.paid_at DESC
             LIMIT {$limit}",
            [$regNumber]
        );

        $modernTxCodes = array_column($modern, 'transaction_code');

        // Legacy records not already present in modern (avoids duplicates from dual-write)
        $legacy = $this->db->fetchAll(
            "SELECT
                p.external_transaction_id AS transaction_code,
                p.amount,
                p.payment_chanel          AS channel,
                p.slip_no                 AS receipt_number,
                CASE WHEN p.status = 1 THEN 'confirmed' ELSE 'pending' END AS status,
                p.date                    AS payment_date,
                p.fee_category            AS fee_type,
                'bank_legacy'             AS source
             FROM payment p
             WHERE p.student = ?
               AND p.user = 'UrubutoPay'
               AND p.payment_notifi = 'Debit'
             ORDER BY p.recorded_date DESC
             LIMIT {$limit}",
            [$regNumber]
        );

        // Merge, removing legacy records whose tx_code already appears in modern
        $merged = $modern;
        foreach ($legacy as $row) {
            $baseCode = explode('-', $row['transaction_code'] . '-')[0] ?? $row['transaction_code'];
            $alreadySeen = false;
            foreach ($modernTxCodes as $mc) {
                if (str_starts_with($mc, $baseCode)) {
                    $alreadySeen = true;
                    break;
                }
            }
            if (!$alreadySeen) {
                $merged[] = $row;
            }
        }

        // Sort by payment_date DESC
        usort($merged, fn($a, $b) => strcmp($b['payment_date'] ?? '', $a['payment_date'] ?? ''));

        return array_slice($merged, 0, $limit);
    }

    // ── Private: Legacy Table Sync ────────────────────────────────────────────

    /**
     * Write a Debit row to the legacy `payment` and `bank_payment` tables.
     * Called after every successful UrubutoPay payment callback.
     *
     * Columns mapped:
     *   payment.student  → student regnumber
     *   bank_payment.reg_no → student regnumber
     *   bank_id = 1 (BK, from tbl_bank)
     *   fee_category = '147' (bank payment category)
     *   payment_chanel = 'BK'
     *   status = 1 (confirmed by payment gateway callback)
     */
    private function writeLegacyDebit(
        string $studentId,
        string $txCode,
        float  $amount,
        string $paymentDate,
        string $serviceCode,
        array  $student,
        ?int   $invoiceId = null
    ): void {
        $transCode   = $this->makeTransCode('UP');
        $accYear     = (string)($student['acc_year']      ?? '');
        $levelId     = (string)($student['current_level'] ?? '');
        $bankId      = self::LEGACY_BANK_ID;
        $feeCategory = self::FEE_CATEGORY_BK;
        $description = 'UrubutoPay — ' . ($serviceCode ?: 'mobile/USSD payment');
        $user        = 'UrubutoPay';
        $channel     = 'BK';
        $semester    = '1';
        $invoiRef    = $invoiceId ?? 0;

        try {
            $this->db->execute(
                "INSERT INTO payment
                 (trans_code, student, level_id, SESSION, bank_id, slip_no, invoi_ref,
                  user, acad_cycle_id, date, fee_category, amount, description,
                  Remark, action, external_transaction_id, payment_chanel, payment_notifi, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'Debit', ?, ?, 'Debit', 1)",
                [$transCode, $studentId, $levelId, $semester, $bankId, $txCode, $invoiRef,
                 $user, $accYear, $paymentDate, $feeCategory, $amount, $description,
                 $txCode, $channel]
            );
        } catch (\Throwable $e) {
            error_log('[LegacySync:payment ERROR] ' . $e->getMessage());
        }

        try {
            $this->db->execute(
                "INSERT INTO bank_payment
                 (trans_code, reg_no, level_id, bank_id, slip_no, invoi_ref,
                  user, acad_cycle_id, date, fee_category, amount, description,
                  Remark, action, external_transaction_id, payment_chanel, payment_notifi)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'Debit', ?, ?, 'Debit')",
                [$transCode, $studentId, (int)$levelId, $bankId, $txCode, $invoiRef,
                 $user, $accYear, $paymentDate, $feeCategory, $amount, $description,
                 $txCode, $channel]
            );
        } catch (\Throwable $e) {
            error_log('[LegacySync:bank_payment ERROR] ' . $e->getMessage());
        }
    }

    /**
     * Write a Credit (reversal) row to the legacy `payment` and `bank_payment` tables.
     * Mirrors the logic of Rest::delete_transaction() in the legacy path.
     */
    private function writeLegacyCredit(string $studentId, string $txCode, float $amount, array $student): void
    {
        $orig = $this->db->fetchOne(
            "SELECT trans_code, bank_id, slip_no, Remark, payment_chanel,
                    SESSION, level_id, acad_cycle_id
             FROM payment
             WHERE external_transaction_id = ? AND payment_notifi = 'Debit'
             ORDER BY id DESC LIMIT 1",
            [$txCode]
        );

        $reversalCode = $this->makeTransCode('UR');
        $user         = 'UrubutoPay';
        $now          = date('Y-m-d H:i:s');
        $bankId       = (int)(($orig['bank_id'] ?? null) ?: self::LEGACY_BANK_ID);
        $accYear      = (string)($orig['acad_cycle_id'] ?? $student['acc_year'] ?? '');
        $levelId      = (string)($orig['level_id']      ?? $student['current_level'] ?? '');
        $slipNo       = (string)($orig['slip_no']       ?? $txCode);
        $remark       = (int)($orig['Remark']           ?? 0);
        $channel      = (string)($orig['payment_chanel'] ?? 'BK');
        $semester     = (string)($orig['SESSION']        ?? '1');
        $description  = 'Reversal of ' . ($orig['trans_code'] ?? $txCode);

        try {
            $this->db->execute(
                "INSERT INTO payment
                 (trans_code, student, level_id, SESSION, bank_id, slip_no, invoi_ref,
                  user, acad_cycle_id, date, fee_category, amount, description,
                  Remark, action, external_transaction_id, payment_chanel, payment_notifi, status)
                 VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, '146', ?, ?, ?, 'Credit', ?, ?, 'Credit', 1)",
                [$reversalCode, $studentId, $levelId, $semester, $bankId, $slipNo,
                 $user, $accYear, $now, $amount, $description,
                 $remark, $txCode, $channel]
            );
        } catch (\Throwable $e) {
            error_log('[LegacySync:payment Credit ERROR] ' . $e->getMessage());
        }

        try {
            $this->db->execute(
                "INSERT INTO bank_payment
                 (trans_code, reg_no, level_id, bank_id, slip_no, invoi_ref,
                  user, acad_cycle_id, date, fee_category, amount, description,
                  Remark, action, external_transaction_id, payment_chanel, payment_notifi)
                 VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, '146', ?, ?, ?, 'Credit', ?, ?, 'Credit')",
                [$reversalCode, $studentId, (int)$levelId, $bankId, $slipNo,
                 $user, $accYear, $now, $amount, $description,
                 $remark, $txCode, $channel]
            );
        } catch (\Throwable $e) {
            error_log('[LegacySync:bank_payment Credit ERROR] ' . $e->getMessage());
        }
    }

    // ── Private Helpers ───────────────────────────────────────────────────────

    private function lookupStudent(string $payerCode): ?array
    {
        $clean = ltrim($payerCode, '0');
        if ($clean !== $payerCode) {
            $row = $this->db->fetchOne(
                "SELECT regnumber, fname, lname, acc_year, current_level,
                        COALESCE(phone, telephone, '') AS phone
                 FROM student WHERE regnumber = ? LIMIT 1",
                [$clean]
            );
            if ($row) return $row;
        }

        $row = $this->db->fetchOne(
            "SELECT regnumber, fname, lname, acc_year, current_level,
                    COALESCE(phone, telephone, '') AS phone
             FROM student WHERE regnumber = ? LIMIT 1",
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

    private function resolveAcademicYearId(string $studentId): ?int
    {
        $row = $this->db->fetchOne(
            "SELECT ay.id FROM student s
             JOIN academic_years ay
               ON ay.label = s.acc_year
               OR ay.label = REPLACE(s.acc_year, '-', '/')
               OR ay.label = REPLACE(s.acc_year, '/', '-')
             WHERE s.regnumber = ? LIMIT 1",
            [$studentId]
        );
        if ($row) {
            return (int)$row['id'];
        }
        $row = $this->db->fetchOne("SELECT id FROM academic_years WHERE is_current = 1 LIMIT 1", []);
        return $row ? (int)$row['id'] : null;
    }

    /**
     * Generate a unique transaction code with a given prefix.
     * Format: PREFIX-BASETIMECODE-RANDOMHEX  e.g. UP-LQEXA-3F2A
     */
    private function makeTransCode(string $prefix): string
    {
        $base   = strtoupper(base_convert((string)(time() % 1_000_000), 10, 36));
        $random = strtoupper(substr(bin2hex(random_bytes(2)), 0, 4));
        return $prefix . '-' . $base . '-' . $random;
    }
}

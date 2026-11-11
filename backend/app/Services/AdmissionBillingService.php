<?php

declare(strict_types=1);

namespace App\Services;

use Core\Database;
use App\Models\ApplicationInvoiceModel;
use App\Models\ApplicationInvoicePaymentModel;
use App\Models\ApplicationCreditModel;
use App\Models\StudentApplicationModel;
use App\Models\AdmissionOfferModel;
use App\Models\FeeStructureModel;
use App\Models\UrubutoServiceModel;
use App\Helpers\EmailTemplateHelper;

/**
 * AdmissionBillingService
 *
 * Owns the step between "admission offered" and "registration number issued":
 * the admitted applicant is billed the fees Finance has published for that
 * stage (Registration and CURSU by default), pays them through UrubutoPay on
 * the same payer code as the application fee, and the moment the last one is
 * settled the enrollment runs itself.
 *
 * Three rules shape everything here:
 *
 *  1. AMOUNTS ARE NEVER INVENTED. Every bill is cut from a published
 *     `fee_structures` row matched to the applicant's year / department /
 *     level / category. A fee type with no published price is not billed at
 *     all — better an incomplete bill than a fabricated one.
 *
 *  2. THE GATEWAY IS THE ONLY THING THAT CONFIRMS MONEY. `applyGatewayPayment()`
 *     runs from the UrubutoPay callback. A validator can record an offline
 *     settlement, but that is an explicit, attributed, logged act
 *     (`recordManualPayment()`), never an implicit one.
 *
 *  3. EVERY TRANSITION TELLS BOTH ENDS. Each bill raised, each payment
 *     received, and the completion itself sends the applicant an email and an
 *     in-system notification, and notifies the admissions desk.
 */
class AdmissionBillingService
{
    private Database                       $db;
    private ApplicationInvoiceModel        $invoices;
    private ApplicationInvoicePaymentModel $payments;
    private ApplicationCreditModel         $credits;
    private StudentApplicationModel        $applications;
    private AdmissionOfferModel            $offers;
    private FeeStructureModel              $structures;
    private UrubutoServiceModel            $catalogue;
    private MailService                    $mail;

    private const CHECKOUT_BASE = 'https://urubutopay.rw/pay-now';

    /** Used when no fee type list is configured. */
    private const DEFAULT_FEE_TYPES = ['REGISTRATION', 'CURSU'];

    public function __construct()
    {
        $this->db           = Database::getInstance();
        $this->invoices     = new ApplicationInvoiceModel();
        $this->payments     = new ApplicationInvoicePaymentModel();
        $this->credits     = new ApplicationCreditModel();
        $this->applications = new StudentApplicationModel();
        $this->offers       = new AdmissionOfferModel();
        $this->structures   = new FeeStructureModel();
        $this->catalogue    = new UrubutoServiceModel();
        $this->mail         = new MailService();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Configuration
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * The `fee_structures.fee_type` codes an admitted applicant is billed,
     * in the order they are presented. Configurable so adding a third
     * pre-enrollment fee is a settings change, not a deploy.
     *
     * @return list<string>
     */
    public function billableFeeTypes(): array
    {
        $raw = $this->setting('admission_billing_fee_types', implode(',', self::DEFAULT_FEE_TYPES));

        $types = array_values(array_filter(array_map(
            static fn (string $t): string => strtoupper(trim($t)),
            explode(',', $raw)
        )));

        return $types ?: self::DEFAULT_FEE_TYPES;
    }

    public function autoBillOnOffer(): bool
    {
        return $this->setting('admission_billing_auto_bill', '1') === '1';
    }

    public function autoEnrollWhenPaid(): bool
    {
        return $this->setting('admission_billing_auto_enroll', '1') === '1';
    }

    private function setting(string $key, string $default): string
    {
        try {
            $row = $this->db->fetchOne(
                "SELECT value FROM `settings` WHERE key_name = ? LIMIT 1",
                [$key]
            );
        } catch (\Throwable $e) {
            return $default;
        }

        $value = trim((string)($row['value'] ?? ''));
        return $value !== '' ? $value : $default;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Pricing
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * What this applicant would be billed, priced from the published fee
     * structures. Returns one entry per configured fee type; entries with
     * `amount === null` are the ones Finance has not published a price for and
     * are therefore skipped by bill().
     *
     * @return list<array{fee_type:string,label:string,amount:float|null,currency:string,fee_structure_id:int|null,service_code:string|null,reason:string|null}>
     */
    public function priceFor(array $application): array
    {
        $yearId       = (int)($application['academic_year_id'] ?? 0);
        $departmentId = (int)($application['department_id'] ?? 0) ?: null;
        $levelId      = (int)($application['level_id'] ?? 0) ?: null;
        $category     = $this->studentCategory($application);
        $programme    = $this->programmeCategory($application);

        $out = [];
        foreach ($this->billableFeeTypes() as $feeType) {
            $structure = $yearId > 0
                ? $this->matchStructure($yearId, $feeType, $departmentId, $levelId, $category, $programme)
                : false;

            if (!$structure) {
                $out[] = [
                    'fee_type'         => $feeType,
                    'label'            => $this->humanise($feeType),
                    'amount'           => null,
                    'currency'         => 'RWF',
                    'fee_structure_id' => null,
                    'service_code'     => $this->serviceCodeFor($feeType),
                    'reason'           => $yearId > 0
                        ? 'No active fee structure published for this fee type, year and programme.'
                        : 'The application has no academic year, so no fee structure can be matched.',
                ];
                continue;
            }

            $label = trim((string)($structure['label'] ?? ''));

            $out[] = [
                'fee_type'         => $feeType,
                'label'            => $label !== '' ? $label : $this->humanise($feeType),
                'amount'           => (float)$structure['amount'],
                'currency'         => (string)($structure['currency'] ?? 'RWF'),
                'fee_structure_id' => (int)$structure['id'],
                'service_code'     => $this->serviceCodeFor($feeType),
                'reason'           => null,
            ];
        }

        return $out;
    }

    /**
     * Best published price for one fee type. Tries the applicant's own category
     * first, then falls back to 'local' — every live structure is registered
     * against 'local', so an international applicant would otherwise match
     * nothing and be billed nothing.
     */
    private function matchStructure(
        int $yearId,
        string $feeType,
        ?int $departmentId,
        ?int $levelId,
        string $category,
        ?string $programme = null
    ): array|false {
        try {
            $match = $this->structures->findBestMatch($yearId, $feeType, $departmentId, $levelId, null, $category, $programme);
            if (!$match && $category !== 'local') {
                $match = $this->structures->findBestMatch($yearId, $feeType, $departmentId, $levelId, null, 'local', $programme);
            }
            return $match;
        } catch (\Throwable $e) {
            error_log('[AdmissionBilling] fee structure lookup failed: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * The programme tier the applicant chose on the apply wizard, which decides
     * the Registration fee: undergraduate, postgraduate (PGDE) or masters.
     * Null for legacy rows with no tier, which then match untiered prices only.
     */
    private function programmeCategory(array $application): ?string
    {
        $cat = strtolower(trim((string)($application['programme_category'] ?? '')));
        return in_array($cat, ['undergraduate', 'postgraduate', 'masters'], true) ? $cat : null;
    }

    private function studentCategory(array $application): string
    {
        $nationality = strtolower(trim((string)($application['nationality'] ?? 'Rwandan')));
        return ($nationality === '' || $nationality === 'rwandan' || $nationality === 'rwanda')
            ? 'local'
            : 'international';
    }

    /**
     * The gateway service the applicant pays this fee type on. Matched on the
     * catalogue's PRICING vocabulary (`fee_structure_type`), which is what
     * distinguishes CURSU from REGISTRATION — both settle the same billing
     * `fee_type` on the student side, so codeForFeeType() would collapse them
     * onto one service and the payer could never say which they meant.
     */
    private function serviceCodeFor(string $feeType): ?string
    {
        foreach ($this->catalogue->catalogue() as $row) {
            if (!empty($row['alias_of'])) {
                continue;
            }
            if (strtoupper(trim((string)($row['fee_structure_type'] ?? ''))) === strtoupper($feeType)) {
                return (string)$row['service_code'];
            }
        }
        return null;
    }

    private function humanise(string $feeType): string
    {
        return ucwords(strtolower(str_replace('_', ' ', $feeType))) . ' Fee';
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Billing
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Raise (or re-price) the admission bills for an application.
     *
     * Idempotent and safe to re-run: a bill that has already taken money is
     * left exactly as it is — re-pricing a partly-paid Registration fee behind
     * the payer's back is how a receipt stops matching a ledger. An untouched
     * bill is re-priced from the current structure.
     *
     * @param  list<string>|null $onlyFeeTypes restrict to these types (null = all configured)
     * @return array{billed:list<array<string,mixed>>,skipped:list<array<string,mixed>>,summary:array<string,mixed>}
     */
    public function bill(int $applicationId, ?int $actorId = null, ?array $onlyFeeTypes = null): array
    {
        $application = $this->applications->find($applicationId);
        if (!$application) {
            throw new \RuntimeException('Application not found.');
        }

        $this->assertBillable($application);

        $wanted  = $onlyFeeTypes !== null
            ? array_map('strtoupper', array_map('trim', $onlyFeeTypes))
            : null;

        $billed  = [];
        $skipped = [];

        foreach ($this->priceFor($application) as $line) {
            if ($wanted !== null && !in_array($line['fee_type'], $wanted, true)) {
                continue;
            }

            if ($line['amount'] === null || $line['amount'] <= 0) {
                $skipped[] = [
                    'fee_type' => $line['fee_type'],
                    'reason'   => $line['reason'] ?? 'No published amount.',
                ];
                continue;
            }

            $existing = $this->invoices->findByFeeType($applicationId, $line['fee_type']);

            if ($existing && (float)$existing['amount_paid'] > 0) {
                $skipped[] = [
                    'fee_type' => $line['fee_type'],
                    'reason'   => 'Already partly or fully paid — left untouched.',
                ];
                continue;
            }

            if ($existing) {
                $this->invoices->update((int)$existing['id'], [
                    'fee_structure_id' => $line['fee_structure_id'],
                    'label'            => $line['label'],
                    'service_code'     => $line['service_code'],
                    'amount_due'       => $line['amount'],
                    'currency'         => $line['currency'],
                    'status'           => 'unpaid',
                    'billed_by'        => $actorId,
                    'billed_at'        => date('Y-m-d H:i:s'),
                ]);
                $billed[] = $this->invoices->find((int)$existing['id']) ?: [];
                continue;
            }

            $newId = (int)$this->invoices->create([
                'application_id'   => $applicationId,
                'fee_structure_id' => $line['fee_structure_id'],
                'fee_type'         => $line['fee_type'],
                'label'            => $line['label'],
                'service_code'     => $line['service_code'],
                'amount_due'       => $line['amount'],
                'amount_paid'      => 0,
                'currency'         => $line['currency'],
                'status'           => 'unpaid',
                'billed_by'        => $actorId,
                'billed_at'        => date('Y-m-d H:i:s'),
            ]);
            $billed[] = $this->invoices->find($newId) ?: [];
        }

        $summary = $this->invoices->summaryFor($applicationId);

        if (!empty($billed)) {
            SystemLogService::log(
                'CREATE',
                'ADMISSIONS',
                'Admission bills raised for application ' . ($application['application_number'] ?? $applicationId)
                    . ': ' . implode(', ', array_column($billed, 'fee_type'))
                    . ' — total ' . number_format($summary['total_due'], 0) . ' RWF.',
                $applicationId,
                'student_application',
                ['fee_types' => array_column($billed, 'fee_type'), 'total_due' => $summary['total_due']]
            );

            $this->announceBilled($application, $billed, $summary);
        }

        // Money received before these bills existed is waiting on the credit
        // ledger. Draw it now, so a bill raised after payment shows as settled.
        $this->allocateOpenCredits($applicationId);
        $summary = $this->invoices->summaryFor($applicationId);

        return ['billed' => $billed, 'skipped' => $skipped, 'summary' => $summary];
    }

    /**
     * An application can only be billed once it has actually been admitted —
     * billing a candidate who has not been offered a place would be asking for
     * money against a place they may never get.
     */
    private function assertBillable(array $application): void
    {
        $status = (string)($application['status'] ?? '');
        if (!in_array($status, ['offered', 'offer_accepted', 'enrolled'], true)) {
            throw new \RuntimeException(
                'Admission fees can only be billed after an admission offer has been issued. Current status: ' . $status . '.'
            );
        }
    }

    /**
     * Bill automatically at the moment the offer is issued, when the setting
     * allows it. Never throws: an offer must still be issued even if pricing is
     * incomplete, and the validator can raise the bill by hand afterwards.
     */
    public function autoBillForOffer(int $applicationId, ?int $actorId = null): ?array
    {
        if (!$this->autoBillOnOffer()) {
            return null;
        }

        try {
            return $this->bill($applicationId, $actorId);
        } catch (\Throwable $e) {
            error_log('[AdmissionBilling] auto-bill failed for application ' . $applicationId . ': ' . $e->getMessage());
            return null;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Reading
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Everything either end needs to render the billing stage: the bills, the
     * money against them, what would be billed if nothing has been yet, and
     * where the applicant stands in the enrollment gate.
     */
    public function overview(int $applicationId): array
    {
        $application = $this->applications->find($applicationId);
        if (!$application) {
            throw new \RuntimeException('Application not found.');
        }

        $bills   = $this->invoices->forApplication($applicationId);
        $summary = $this->invoices->summaryFor($applicationId);
        $offer   = $this->offers->findByApplicationId($applicationId) ?: null;

        $merchantCode = $this->merchantCode();

        $bills = array_map(function (array $bill) use ($application, $merchantCode): array {
            $balance = max(0.0, (float)$bill['amount_due'] - (float)$bill['amount_paid']);

            return [
                'id'             => (int)$bill['id'],
                'fee_type'       => (string)$bill['fee_type'],
                'label'          => (string)$bill['label'],
                'amount_due'     => (float)$bill['amount_due'],
                'amount_paid'    => (float)$bill['amount_paid'],
                'balance'        => round($balance, 2),
                'currency'       => (string)$bill['currency'],
                'status'         => (string)$bill['status'],
                'service_code'   => $bill['service_code'] ?: null,
                'transaction_id' => $bill['transaction_id'] ?: null,
                'paid_at'        => $bill['paid_at'] ?: null,
                'billed_at'      => $bill['billed_at'] ?: null,
                'checkout_url'   => $balance > 0
                    ? $this->checkoutUrl(
                        (string)$application['application_number'],
                        $bill['service_code'] ?: null,
                        round($balance, 2)
                      )
                    : null,
                'merchant_code'  => $merchantCode,
                'payer_code'     => (string)$application['application_number'],
            ];
        }, $bills);

        return [
            'application_id'     => $applicationId,
            'application_number' => (string)($application['application_number'] ?? ''),
            'status'             => (string)($application['status'] ?? ''),
            'bills'              => $bills,
            'payments'           => $this->payments->forApplication($applicationId),
            'credit'             => $this->credits->summaryFor($applicationId),
            'summary'            => $summary,
            // What bill() would raise — lets the validator see the price (and any
            // missing structure) before committing to it.
            'billable'           => $this->priceFor($application),
            'is_billed'          => $summary['count'] > 0,
            'fully_paid'         => $summary['fully_paid'],
            'merchant_code'      => $merchantCode,
            'kigali_merchant_code' => $this->kigaliMerchantCode($merchantCode),
            'payer_code'         => (string)($application['application_number'] ?? ''),
            'checkout_url'       => $this->outstandingCheckoutUrl(
                $applicationId,
                (string)($application['application_number'] ?? '')
            ),
            'offer_status'       => $offer['status'] ?? null,
            'enrollment_initiated' => $offer ? (int)$offer['enrollment_initiated'] === 1 : false,
            'registration_number'  => $application['enrolled_student_id'] ?: null,
            'auto_enroll'          => $this->autoEnrollWhenPaid(),
        ];
    }

    /**
     * UrubutoPay's pre-filled deep link. Same shape — and now the same builder —
     * as the application fee: the payer code is the application number, which is
     * what routes the callback back to this applicant, and `amnt` quotes what is
     * still owed so the payer is not asked to retype it.
     *
     * @param float|null $amount balance to pre-fill; null leaves the gateway to ask
     */
    public function checkoutUrl(string $applicationNumber, ?string $serviceCode, ?float $amount = null): string
    {
        return UrubutoPayService::checkoutLink(
            $this->merchantCode(),
            $applicationNumber,
            $serviceCode,
            $amount,
            $_ENV['URUBUTOPAY_CHECKOUT_URL'] ?? self::CHECKOUT_BASE
        );
    }

    private function merchantCode(): string
    {
        $code = (string)($_ENV['URUBUTOPAY_MERCHANT_CODE'] ?? '');
        if ($code === '') {
            try {
                $row  = $this->db->fetchOne('SELECT merchant_code FROM api_authorization LIMIT 1', []);
                $code = (string)($row['merchant_code'] ?? '');
            } catch (\Throwable $e) {
                $code = '';
            }
        }
        return $code;
    }

    /**
     * The Kigali Campus merchant code: the second TH-prefixed row in api_authorization
     * (the first is the primary merchant shown above). Null when no second code exists.
     */
    private function kigaliMerchantCode(string $primaryCode): ?string
    {
        try {
            $rows = $this->db->fetchAll(
                "SELECT merchant_code
                 FROM api_authorization
                 WHERE merchant_code IS NOT NULL
                   AND TRIM(merchant_code) <> ''
                   AND merchant_code LIKE 'TH%'
                 ORDER BY id ASC
                 LIMIT 2"
            );
        } catch (\Throwable $e) {
            return null;
        }

        $codes = array_values(array_unique(array_filter(array_map(
            static fn(array $row): string => trim((string)($row['merchant_code'] ?? '')),
            $rows
        ))));

        $second = $codes[1] ?? null;
        return ($second !== null && $second !== $primaryCode) ? $second : null;
    }

    /**
     * The gateway menu an admitted applicant sees: one entry per open bill,
     * carrying its own outstanding balance, so the payer can settle the
     * Registration fee and the CURSU fee as the two distinct things they are.
     *
     * @return list<array{service_code:string,service_name:string,amount:int,currency:string}>
     */
    public function gatewayServicesFor(int $applicationId): array
    {
        $services = [];
        foreach ($this->invoices->openForApplication($applicationId) as $bill) {
            $code = trim((string)($bill['service_code'] ?? ''));
            if ($code === '') {
                continue;
            }
            $services[] = [
                'service_code' => $code,
                'service_name' => (string)($bill['label'] ?: $bill['fee_type']),
                'amount'       => (int)round((float)$bill['amount_due'] - (float)$bill['amount_paid']),
                'currency'     => (string)$bill['currency'],
            ];
        }
        return $services;
    }

    public function hasOpenBills(int $applicationId): bool
    {
        return $this->invoices->openForApplication($applicationId) !== [];
    }

    /**
     * The "settle everything outstanding" link for an application.
     *
     * When exactly one bill is still open the link names its service too, so the
     * payer skips the gateway's service menu entirely. With several open bills
     * there is no single honest answer, so `sccd` is left off and the payer
     * chooses — the waterfall in applyGatewayPayment() then applies whatever
     * they send, starting with the service they picked.
     */
    public function outstandingCheckoutUrl(int $applicationId, string $applicationNumber): ?string
    {
        $open = $this->invoices->openForApplication($applicationId);
        if (!$open) {
            return null;
        }

        $balance = 0.0;
        foreach ($open as $bill) {
            $balance += max(0.0, (float)$bill['amount_due'] - (float)$bill['amount_paid']);
        }
        if ($balance <= 0) {
            return null;
        }

        $serviceCode = count($open) === 1 ? ($open[0]['service_code'] ?: null) : null;

        return $this->checkoutUrl($applicationNumber, $serviceCode, round($balance, 2));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Settlement
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Apply a verified UrubutoPay payment to an applicant's admission bills.
     *
     * The payment is written to the credit ledger (application_credits) first,
     * so the money is on record the moment the gateway confirms it. It is then
     * allocated to the open bills: the bill for the service the payer chose
     * first, the rest oldest-first. Anything no bill can take yet stays on the
     * credit as unapplied and is allocated automatically when the bill is
     * raised. A verified payment is never refused for want of a bill.
     *
     * Idempotent on the gateway transaction code: a retried callback returns
     * 'duplicate' and changes nothing.
     *
     * @return array{status:string,payment_id:int|null,message:string,internal_tx_id:string,external_tx_id:string,payer_phone_number:string,applied?:float,held_as_credit?:float}
     */
    public function applyGatewayPayment(
        array  $application,
        string $txCode,
        float  $amount,
        string $currency,
        string $paidAt,
        string $serviceCode,
        string $source = 'GATEWAY',
        ?int   $recordedBy = null
    ): array {
        $applicationId = (int)$application['id'];
        $appNumber     = (string)($application['application_number'] ?? '');
        $phone         = (string)($application['phone'] ?? '');
        $txCode        = trim($txCode);

        if ($txCode === '' || $amount <= 0) {
            return $this->gatewayResult('error', null, 'A transaction reference and a positive amount are required.', $appNumber, $txCode, $phone);
        }

        $settled = $this->inTransaction(
            fn () => $this->settleGatewayPaymentInTx(
                $application, $txCode, $amount, $currency, $paidAt, $serviceCode, $source, $recordedBy
            )
        );

        if ($settled['duplicate']) {
            return $this->gatewayResult('duplicate', $settled['payment_id'], 'Payment already recorded', $appNumber, $txCode, $phone);
        }

        // Announcements, the log and enrollment run only after the money is committed.
        $this->notifyAllocations($application, $settled['allocations'], $settled['summary']);

        $own = $this->ownAllocation($settled['allocations'], (int)$settled['credit_id']);

        return [
            'status'             => 'recorded',
            'payment_id'         => $own['first_payment_id'] ?? null,
            'message'            => 'Payment recorded',
            'internal_tx_id'     => (string)($own['first_receipt'] ?? $appNumber),
            'external_tx_id'     => $txCode,
            'payer_phone_number' => $phone,
            'applied'            => (float)$own['applied'],
            'held_as_credit'     => (float)$own['unapplied'],
        ];
    }

    /**
     * Record one settlement on the credit ledger and allocate what the open bills
     * can take. DATABASE WORK ONLY: nothing is announced, logged or enrolled here,
     * so the caller can run it inside a larger transaction (the application-fee
     * path does) and call notifyAllocations() after commit.
     *
     * Must run inside inTransaction(). Locks the application row first, so two
     * callbacks, or a callback and a bill being raised, cannot interleave.
     *
     * @return array{duplicate:bool,payment_id:int|null,credit_id:int|null,allocations:list<array<string,mixed>>,summary:array}
     */
    public function settleGatewayPaymentInTx(
        array  $application,
        string $txCode,
        float  $amount,
        string $currency,
        string $paidAt,
        string $serviceCode,
        string $source = 'GATEWAY',
        ?int   $recordedBy = null
    ): array {
        $applicationId = (int)$application['id'];
        $this->lockApplication($applicationId);

        $existing = $this->findRecordedReference($applicationId, $txCode);
        if ($existing !== null) {
            return [
                'duplicate'   => true,
                'payment_id'  => $existing,
                'credit_id'   => null,
                'allocations' => [],
                'summary'     => $this->invoices->summaryFor($applicationId),
            ];
        }

        $creditId = (int)$this->credits->create([
            'application_id'   => $applicationId,
            'reference_number' => $txCode,
            'payer_code'       => (string)($application['application_number'] ?? ''),
            'service_code'     => $serviceCode !== '' ? $serviceCode : null,
            'currency'         => $currency ?: 'RWF',
            'source'           => $source === 'MANUAL' ? 'MANUAL' : 'GATEWAY',
            'amount_received'  => round($amount, 2),
            'amount_allocated' => 0.00,
            'amount_remaining' => round($amount, 2),
            'status'           => 'open',
            'received_at'      => $paidAt,
            'notes'            => $recordedBy ? 'Recorded by user #' . $recordedBy : null,
            'updated_at'       => date('Y-m-d H:i:s'),
        ]);

        $allocations = $this->allocateOpenCreditsInTx($applicationId);

        // The new credit may have found no bill to draw on, in which case the
        // allocator never reached it. Record it explicitly as fully unapplied.
        if ($this->ownAllocation($allocations, $creditId) === []) {
            $allocations[] = [
                'credit_id'       => $creditId,
                'reference'       => $txCode,
                'source'          => $source === 'MANUAL' ? 'MANUAL' : 'GATEWAY',
                'currency'        => $currency ?: 'RWF',
                'received'        => round($amount, 2),
                'applied'         => 0.0,
                'unapplied'       => round($amount, 2),
                'lines'           => [],
                'first_payment_id' => null,
                'first_receipt'    => null,
            ];
        }

        return [
            'duplicate'   => false,
            'payment_id'  => null,
            'credit_id'   => $creditId,
            'allocations' => $allocations,
            'summary'     => $this->invoices->summaryFor($applicationId),
        ];
    }

    /**
     * Draw every open credit on the application against the open bills, oldest
     * credit first. Writes application_invoice_payments rows (source and
     * application_credit_id say where the money came from), reduces each credit's
     * amount_remaining, and marks it exhausted when nothing is left.
     *
     * Must run inside inTransaction() with the application row locked.
     * A credit can only be spent once: the row is updated in the same transaction
     * that wrote its allocations, and the application lock serialises callers.
     *
     * @return list<array<string,mixed>> one entry per credit that was examined
     */
    private function allocateOpenCreditsInTx(int $applicationId): array
    {
        $results = [];

        foreach ($this->credits->openForApplication($applicationId) as $credit) {
            $creditId  = (int)$credit['id'];
            $received  = round((float)$credit['amount_received'], 2);
            $remaining = round((float)$credit['amount_remaining'], 2);
            if ($remaining <= 0.009) {
                continue;
            }

            $bills = $this->invoices->openForApplication($applicationId);
            if (empty($bills)) {
                // No open bill at all: this credit and any later ones wait.
                break;
            }

            $code   = trim((string)($credit['service_code'] ?? ''));
            $target = $code !== '' ? $this->serviceTarget($code) : null;

            // The payer named a fee type. Until a bill of that type exists on this
            // application, the money waits: it must not be applied to a different fee
            // (CURSU money is not Registration money). An unidentifiable code keeps
            // the old behaviour: matching bills first, then the rest.
            if ($target !== null && $target['type'] !== '' && !$this->hasBillOfTarget($applicationId, $target)) {
                continue;
            }

            $bills = $this->prioritiseByServiceCode($bills, $code);

            $lines           = [];
            $firstPaymentId  = null;
            $firstReceipt    = null;
            $index           = 0;

            foreach ($bills as $bill) {
                if ($remaining <= 0.009) {
                    break;
                }

                $gap = round((float)$bill['amount_due'] - (float)$bill['amount_paid'], 2);
                if ($gap <= 0) {
                    continue;
                }

                $apply     = round(min($remaining, $gap), 2);
                // Unique per (credit, bill): the credit id is unique, and the
                // suffix separates several bills drawn from one credit.
                $reference = $credit['reference_number'] . '-CR' . $creditId . '-B' . (int)$bill['id'];
                $receipt   = $this->generateReceiptNumber();

                $paymentId = (int)$this->payments->create([
                    'application_invoice_id' => (int)$bill['id'],
                    'application_id'         => $applicationId,
                    'application_credit_id'  => $creditId,
                    'amount'                 => $apply,
                    'currency'               => (string)($credit['currency'] ?: $bill['currency']),
                    'payment_method'         => ($credit['source'] ?? 'GATEWAY') === 'MANUAL' ? 'MANUAL' : 'MOBILE_MONEY',
                    'reference_number'       => $reference,
                    'receipt_number'         => $receipt,
                    'service_code'           => $credit['service_code'] ?: null,
                    'source'                 => (string)($credit['source'] ?? 'GATEWAY'),
                    'recorded_by'            => null,
                    'notes'                  => mb_substr('Allocated from credit — tx: ' . $credit['reference_number'], 0, 255),
                    'paid_at'                => (string)$credit['received_at'],
                ]);

                $this->invoices->applyPayment(
                    (int)$bill['id'],
                    $apply,
                    (string)$credit['reference_number'],
                    (string)$credit['received_at']
                );

                $firstPaymentId ??= $paymentId;
                $firstReceipt   ??= $receipt;
                $lines[] = [
                    'fee_type'       => (string)$bill['fee_type'],
                    'label'          => (string)($bill['label'] ?: $bill['fee_type']),
                    'amount'         => $apply,
                    'receipt_number' => $receipt,
                    'bill_id'        => (int)$bill['id'],
                ];

                $remaining = round($remaining - $apply, 2);
                $index++;
            }

            $applied = round(array_sum(array_column($lines, 'amount')), 2);

            if ($applied > 0) {
                $allocated = round((float)$credit['amount_allocated'] + $applied, 2);
                $left      = max(0.0, round($received - $allocated, 2));

                $this->credits->update($creditId, [
                    'amount_allocated' => $allocated,
                    'amount_remaining' => $left,
                    'status'           => $left <= 0.009 ? 'exhausted' : 'open',
                    'updated_at'       => date('Y-m-d H:i:s'),
                ]);
            } else {
                $left = $remaining;
            }

            $results[] = [
                'credit_id'        => $creditId,
                'reference'        => (string)$credit['reference_number'],
                'source'           => (string)($credit['source'] ?? 'GATEWAY'),
                'currency'         => (string)($credit['currency'] ?: 'RWF'),
                'received'         => $received,
                'applied'          => $applied,
                'unapplied'        => round($left, 2),
                'lines'            => $lines,
                'first_payment_id' => $firstPaymentId,
                'first_receipt'    => $firstReceipt,
            ];
        }

        return $results;
    }

    /**
     * Allocate any unapplied credit to the bills that are now open. Called when
     * bills are raised, so money received before admission is applied the moment
     * the bill appears. Idempotent: an already-drawn credit has nothing left to give.
     *
     * @return list<array<string,mixed>>
     */
    public function allocateOpenCredits(int $applicationId): array
    {
        $application = $this->applications->find($applicationId);
        if (!$application) {
            return [];
        }

        $allocations = $this->inTransaction(function () use ($applicationId) {
            $this->lockApplication($applicationId);
            return $this->allocateOpenCreditsInTx($applicationId);
        });
        // Only credits that actually drew money are worth announcing.
        $allocations = array_values(array_filter($allocations, static fn (array $a): bool => $a['applied'] > 0));

        if (!empty($allocations)) {
            $this->notifyAllocations($application, $allocations, $this->invoices->summaryFor($applicationId));
        }

        return $allocations;
    }

    /**
     * Everything that happens AFTER money has been committed: the applicant and
     * desk are told, the log is written, and enrollment runs if the bills are now
     * all settled. Never call this from inside a transaction.
     *
     * @param list<array<string,mixed>> $allocations
     */
    public function notifyAllocations(array $application, array $allocations, array $summary): void
    {
        $applicationId = (int)$application['id'];
        $appNumber     = (string)($application['application_number'] ?? $applicationId);
        $appliedTotal  = 0.0;

        foreach ($allocations as $a) {
            $applied = (float)$a['applied'];
            $appliedTotal += $applied;

            if ($applied > 0) {
                $this->announcePayment(
                    $application,
                    $a['lines'],
                    $applied,
                    (string)$a['currency'],
                    (string)$a['reference'],
                    $summary
                );
            }

            SystemLogService::log(
                'CREATE',
                'ADMISSIONS',
                ($a['source'] === 'MANUAL' ? 'Confirmed' : 'UrubutoPay') . ' admission fee: tx=' . $a['reference']
                    . ', application=' . $appNumber
                    . ', received=' . number_format((float)$a['received'], 0) . ' RWF'
                    . ', applied=' . number_format($applied, 0) . ' RWF'
                    . ', held as credit=' . number_format((float)$a['unapplied'], 0) . ' RWF'
                    . ', balance=' . number_format($summary['balance'], 0) . ' RWF.',
                $applicationId,
                'student_application',
                [
                    'transaction_code' => $a['reference'],
                    'credit_id'        => $a['credit_id'],
                    'received'         => $a['received'],
                    'applied'          => $applied,
                    'unapplied'        => $a['unapplied'],
                    'lines'            => $a['lines'],
                ]
            );
        }

        if ($appliedTotal > 0.009 && $summary['fully_paid']) {
            $this->onFullyPaid($applicationId);
        }
    }

    /**
     * Run $work in one transaction. Joins an enclosing transaction when one is
     * already open, because PDO does not nest and the callers of this service
     * include code that is already inside a transaction.
     */
    public function inTransaction(callable $work): mixed
    {
        if ($this->db->getPdo()->inTransaction()) {
            return $work();
        }

        return $this->db->transaction(static fn () => $work());
    }

    /**
     * What a service code means for allocation: the fee type it pays for and every code
     * that identifies it. type is '' when the catalogue does not know the code.
     *
     * @return array{type:string,codes:list<string>}
     */
    private function serviceTarget(string $code): array
    {
        $resolved = $this->catalogue->findByCode($code);
        $type     = $resolved ? strtoupper(trim((string)($resolved['fee_structure_type'] ?? ''))) : '';
        $live     = $resolved ? (string)$resolved['service_code'] : $code;

        return ['type' => $type, 'codes' => array_values(array_unique([$code, $live]))];
    }

    /** Does this application have a bill (open or settled) that the payer's service pays for? */
    private function hasBillOfTarget(int $applicationId, array $target): bool
    {
        foreach ($this->invoices->forApplication($applicationId) as $bill) {
            if (in_array((string)($bill['service_code'] ?? ''), $target['codes'], true)) {
                return true;
            }
            if ($target['type'] !== '' && strtoupper((string)$bill['fee_type']) === $target['type']) {
                return true;
            }
        }

        return false;
    }

    /** Serialises every money write on one application. */
    private function lockApplication(int $applicationId): void
    {
        $this->db->fetchOne(
            'SELECT id FROM `student_applications` WHERE id = ? FOR UPDATE',
            [$applicationId]
        );
    }

    /**
     * Has this gateway transaction already been recorded? Checked against the
     * credit ledger first, then the bill payments for transactions recorded before
     * the credit ledger existed.
     *
     * @return int|null the existing row's id, or null when the transaction is new
     */
    public function findRecordedReference(int $applicationId, string $txCode): ?int
    {
        $payment = $this->payments->existsForReference($txCode);
        if ($payment) {
            return (int)$payment['id'];
        }

        $credit = $this->credits->findByReference($applicationId, $txCode);

        return $credit ? (int)$credit['id'] : null;
    }

    /** The allocation entry for one credit, or [] when it drew nothing. */
    private function ownAllocation(array $allocations, int $creditId): array
    {
        foreach ($allocations as $a) {
            if ((int)$a['credit_id'] === $creditId) {
                return $a;
            }
        }

        return [];
    }

    /** @return array{status:string,payment_id:int|null,message:string,internal_tx_id:string,external_tx_id:string,payer_phone_number:string} */
    private function gatewayResult(string $status, ?int $paymentId, string $message, string $appNumber, string $txCode, string $phone): array
    {
        return [
            'status'             => $status,
            'payment_id'         => $paymentId,
            'message'            => $message,
            'internal_tx_id'     => $appNumber,
            'external_tx_id'     => $txCode,
            'payer_phone_number' => $phone,
        ];
    }

    /**
     * Reorder open bills so the one the payer actually selected on the gateway
     * menu comes first. Nothing is dropped — the caller's waterfall still walks
     * the whole list, so an overpayment spills onto the remaining bills.
     *
     * @param  list<array<string,mixed>> $bills
     * @return list<array<string,mixed>>
     */
    private function prioritiseByServiceCode(array $bills, string $serviceCode): array
    {
        $code = trim($serviceCode);
        if ($code === '') {
            return $bills;
        }

        // Resolve aliases so a retired code from the previous merchant
        // registration still points at the bill the payer meant.
        $resolved      = $this->catalogue->findByCode($code);
        $structureType = $resolved ? strtoupper(trim((string)($resolved['fee_structure_type'] ?? ''))) : '';
        $liveCode      = $resolved ? (string)$resolved['service_code'] : $code;

        $matching = [];
        $rest     = [];
        foreach ($bills as $bill) {
            $billCode = (string)($bill['service_code'] ?? '');
            $billType = strtoupper((string)($bill['fee_type'] ?? ''));

            if ($billCode === $liveCode || $billCode === $code
                || ($structureType !== '' && $billType === $structureType)) {
                $matching[] = $bill;
            } else {
                $rest[] = $bill;
            }
        }

        return [...$matching, ...$rest];
    }

    /**
     * Record a settlement that reached the institution outside the gateway
     * (bank transfer, cash at the finance desk). Attributed to the validator
     * who confirms it, and reference-checked against the gateway ledger so the
     * same transaction cannot be booked twice.
     */
    public function recordManualPayment(
        int    $applicationId,
        int    $billId,
        float  $amount,
        string $reference,
        ?int   $actorId,
        ?string $notes = null
    ): array {
        $application = $this->applications->find($applicationId);
        if (!$application) {
            throw new \RuntimeException('Application not found.');
        }

        $bill = $this->invoices->find($billId);
        if (!$bill || (int)$bill['application_id'] !== $applicationId) {
            throw new \RuntimeException('Bill not found on this application.');
        }

        $reference = trim($reference);
        if ($reference === '') {
            throw new \RuntimeException('A transaction or receipt reference is required.');
        }

        if ($amount <= 0) {
            throw new \RuntimeException('The amount must be greater than zero.');
        }

        $gap = round((float)$bill['amount_due'] - (float)$bill['amount_paid'], 2);
        if ($gap <= 0) {
            throw new \RuntimeException('This bill is already fully settled.');
        }
        if ($amount - $gap > 0.009) {
            throw new \RuntimeException(
                'The amount exceeds the ' . number_format($gap, 0) . ' RWF still owed on this bill.'
            );
        }

        if ($this->payments->existsForReference($reference)) {
            throw new \RuntimeException('That reference has already been recorded against an admission bill.');
        }

        $paidAt  = date('Y-m-d H:i:s');
        $receipt = $this->generateReceiptNumber();

        $paymentId = (int)$this->payments->create([
            'application_invoice_id' => $billId,
            'application_id'         => $applicationId,
            'amount'                 => $amount,
            'currency'               => (string)$bill['currency'],
            'payment_method'         => 'MANUAL',
            'reference_number'       => $reference,
            'receipt_number'         => $receipt,
            'service_code'           => $bill['service_code'] ?: null,
            'source'                 => 'MANUAL',
            'recorded_by'            => $actorId ?: null,
            'notes'                  => $notes !== null && trim($notes) !== '' ? mb_substr(trim($notes), 0, 255) : null,
            'paid_at'                => $paidAt,
        ]);

        $this->invoices->applyPayment($billId, $amount, $reference, $paidAt);

        $summary = $this->invoices->summaryFor($applicationId);

        SystemLogService::log(
            'CREATE',
            'ADMISSIONS',
            'Offline admission fee confirmed: application ' . ($application['application_number'] ?? $applicationId)
                . ', ' . $bill['fee_type'] . ', ' . number_format($amount, 0) . ' RWF, ref ' . $reference . '.',
            $applicationId,
            'student_application',
            ['bill_id' => $billId, 'amount' => $amount, 'reference' => $reference, 'source' => 'MANUAL']
        );

        $this->announcePayment(
            $application,
            [['fee_type' => (string)$bill['fee_type'], 'label' => (string)($bill['label'] ?: $bill['fee_type']), 'amount' => $amount, 'receipt_number' => $receipt]],
            $amount,
            (string)$bill['currency'],
            $reference,
            $summary
        );

        if ($summary['fully_paid']) {
            $this->onFullyPaid($applicationId);
        }

        return ['payment_id' => $paymentId, 'receipt_number' => $receipt, 'summary' => $summary];
    }

    /**
     * Enroll an applicant whose admission bills are all settled and who has not
     * been enrolled yet. Used by the bulk enrollment script. Does nothing while any
     * bill is still open. Enrollment failures are reported by onFullyPaid(), not thrown.
     */
    public function enrollIfSettled(int $applicationId): void
    {
        $summary = $this->invoices->summaryFor($applicationId);
        if (!$summary['fully_paid']) {
            return;
        }

        $this->onFullyPaid($applicationId);
    }

    /**
     * Settle admission bills from approved bordereau (bank deposit) submissions.
     *
     * Approving a bordereau marks the application paid, but on its own it leaves
     * the admission bills open, so the enrollment gate keeps refusing an applicant
     * who has paid. This applies each approved amount to the open bills, oldest
     * first, through recordManualPayment() so the bill and the payment ledger
     * move together.
     *
     * Idempotent: the payments it books are referenced BDX-{submissionId}-{n}, and
     * a re-run only applies what is not yet booked. Any amount left once every bill
     * is settled stays unapplied and is reported back.
     *
     * @return list<array{submission_id:int,applied:float,unapplied:float}>
     */
    public function allocateApprovedBordereaux(int $applicationId, ?int $actorId = null): array
    {
        $submissions = $this->db->fetchAll(
            "SELECT id, amount, receipt_number, reviewed_by
               FROM `bordereau_submissions`
              WHERE application_id = ? AND status = 'approved'
              ORDER BY id ASC",
            [$applicationId]
        );

        $results = [];
        foreach ($submissions as $submission) {
            $submissionId = (int)$submission['id'];
            $prefix       = 'BDX-' . $submissionId . '-';

            $booked = $this->db->fetchOne(
                "SELECT COUNT(*) AS cnt, COALESCE(SUM(amount), 0) AS total
                   FROM `application_invoice_payments`
                  WHERE application_id = ? AND reference_number LIKE ?",
                [$applicationId, $prefix . '%']
            ) ?: [];

            $sequence  = (int)($booked['cnt'] ?? 0);
            $remaining = round((float)$submission['amount'] - (float)($booked['total'] ?? 0), 2);
            $recorder  = (int)($submission['reviewed_by'] ?? 0) ?: $actorId;
            $applied   = 0.0;

            while ($remaining > 0.009) {
                $open = $this->invoices->openForApplication($applicationId);
                if ($open === []) {
                    break;
                }

                $bill = $open[0];
                $gap  = round((float)$bill['amount_due'] - (float)$bill['amount_paid'], 2);
                $take = min($remaining, $gap);
                if ($take <= 0.009) {
                    break;
                }

                $sequence++;
                $this->recordManualPayment(
                    $applicationId,
                    (int)$bill['id'],
                    $take,
                    $prefix . $sequence,
                    $recorder,
                    'Bordereau ' . (string)$submission['receipt_number'] . ' approved'
                );

                $remaining = round($remaining - $take, 2);
                $applied  += $take;
            }

            $results[] = [
                'submission_id' => $submissionId,
                'applied'       => round($applied, 2),
                'unapplied'     => max(0.0, $remaining),
            ];
        }

        return $results;
    }

    /**
     * Finance's view of every admission-fee payment received, whether or not the
     * applicant has been enrolled yet. The ledger copy (creditAdmissionBills) only
     * runs at enrollment, so without this the money is invisible to Finance until
     * a registration number exists.
     *
     * @return array{rows:list<array<string,mixed>>,summary:array<string,mixed>,pagination:array<string,int>}
     */
    public function financePaymentsReport(?int $academicYearId, int $page, int $perPage): array
    {
        $where  = '1 = 1';
        $params = [];
        if ($academicYearId) {
            $where   .= ' AND sa.academic_year_id = ?';
            $params[] = $academicYearId;
        }

        $totals = $this->db->fetchOne(
            "SELECT COUNT(*)                          AS total,
                    COALESCE(SUM(aip.amount), 0)      AS total_amount,
                    COUNT(DISTINCT aip.application_id) AS applicants
               FROM `application_invoice_payments` aip
               JOIN `application_invoices` ai ON ai.id = aip.application_invoice_id
               JOIN `student_applications` sa ON sa.id = aip.application_id
              WHERE {$where}",
            $params
        ) ?: [];

        $total   = (int)($totals['total'] ?? 0);
        $perPage = max(1, min(100, $perPage));
        $page    = max(1, $page);
        $offset  = ($page - 1) * $perPage;

        $rows = $this->db->fetchAll(
            "SELECT aip.id, aip.amount, aip.currency, aip.payment_method, aip.source,
                    aip.reference_number, aip.receipt_number, aip.paid_at, aip.notes,
                    ai.fee_type, ai.label, ai.amount_due, ai.status AS bill_status,
                    sa.id AS application_id, sa.application_number, sa.first_name,
                    sa.last_name, sa.email, sa.status AS application_status,
                    sa.enrolled_student_id
               FROM `application_invoice_payments` aip
               JOIN `application_invoices` ai ON ai.id = aip.application_invoice_id
               JOIN `student_applications` sa ON sa.id = aip.application_id
              WHERE {$where}
              ORDER BY aip.paid_at DESC, aip.id DESC
              LIMIT {$perPage} OFFSET {$offset}",
            $params
        );

        return [
            'rows'    => array_map(static fn (array $r): array => [
                'id'                  => (int)$r['id'],
                'paid_at'             => $r['paid_at'],
                'application_id'      => (int)$r['application_id'],
                'application_number'  => (string)$r['application_number'],
                'applicant_name'      => trim((string)$r['first_name'] . ' ' . (string)$r['last_name']),
                'email'               => (string)($r['email'] ?? ''),
                'fee_type'            => (string)$r['fee_type'],
                'label'               => (string)($r['label'] ?: $r['fee_type']),
                'amount'              => (float)$r['amount'],
                'amount_due'          => (float)$r['amount_due'],
                'currency'            => (string)($r['currency'] ?: 'RWF'),
                'reference_number'    => (string)$r['reference_number'],
                'receipt_number'      => (string)($r['receipt_number'] ?? ''),
                'payment_method'      => (string)($r['payment_method'] ?? ''),
                'source'              => (string)($r['source'] ?? ''),
                'bill_status'         => (string)$r['bill_status'],
                'application_status'  => (string)($r['application_status'] ?? ''),
                'enrolled_student_id' => $r['enrolled_student_id'] ?: null,
            ], $rows),
            'summary' => [
                'count'        => $total,
                'total_amount' => (float)($totals['total_amount'] ?? 0),
                'applicants'   => (int)($totals['applicants'] ?? 0),
            ],
            'pagination' => [
                'current_page' => $page,
                'per_page'     => $perPage,
                'total'        => $total,
                'last_page'    => max(1, (int)ceil($total / $perPage)),
            ],
        ];
    }

    private function generateReceiptNumber(): string
    {
        return 'ADM-' . date('Ymd') . '-' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 6));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // What happens when the last bill is settled
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * The gate opens: the applicant has paid everything they were billed.
     *
     * Payment IS the acceptance of the offer — an applicant does not part with
     * the Registration fee for a place they are declining — so a still-pending
     * offer is accepted here, and enrollment (which mints the registration
     * number) runs on top of it. Both steps are best-effort: money has already
     * moved and must stay recorded even if enrollment cannot complete, in which
     * case the validator finishes it by hand from the same screen.
     */
    private function onFullyPaid(int $applicationId): void
    {
        $application = $this->applications->find($applicationId);
        if (!$application) {
            return;
        }

        $this->announceFullyPaid($application);

        if (!$this->autoEnrollWhenPaid()) {
            return;
        }

        try {
            $offer = $this->offers->findByApplicationId($applicationId);
            if (!$offer) {
                return;
            }

            if ((int)$offer['enrollment_initiated'] === 1) {
                return;
            }

            if ((string)$offer['status'] === 'pending') {
                $this->db->execute(
                    "UPDATE `admission_offers`
                        SET status = 'accepted', responded_at = NOW(), updated_at = NOW()
                      WHERE id = ?",
                    [(int)$offer['id']]
                );
                $this->db->execute(
                    "UPDATE `student_applications` SET status = 'offer_accepted', updated_at = NOW() WHERE id = ?",
                    [$applicationId]
                );

                (new ApplicationService())->logStatusChange(
                    $applicationId,
                    (string)$application['status'],
                    'offer_accepted',
                    null,
                    'system',
                    'Admission fees paid in full — offer accepted automatically.'
                );
            } elseif ((string)$offer['status'] !== 'accepted') {
                // Declined or expired: the money is recorded, but nobody should
                // be auto-enrolled onto an offer they turned down.
                return;
            }

            $levelId = (int)($application['level_id'] ?? 0) ?: 1;
            $result  = (new ApplicationService())->initiateEnrollment((int)$offer['id'], 0, $levelId);

            SystemLogService::log(
                'UPDATE',
                'ADMISSIONS',
                'Automatic enrollment after full admission-fee payment: application '
                    . ($application['application_number'] ?? $applicationId)
                    . ' → registration number ' . ($result['regnumber'] ?? '?') . '.',
                $applicationId,
                'student_application',
                ['regnumber' => $result['regnumber'] ?? null, 'trigger' => 'admission_billing']
            );

            $this->announceEnrolled($application, (string)($result['regnumber'] ?? ''));
        } catch (\Throwable $e) {
            error_log('[AdmissionBilling] auto-enrollment failed for application ' . $applicationId . ': ' . $e->getMessage());

            NotificationService::pushToPermissionHolders(
                \App\Constants\Permissions::MANAGE_ADMISSIONS,
                'admission_billing',
                'Automatic enrollment needs attention',
                ($application['first_name'] ?? '') . ' ' . ($application['last_name'] ?? '')
                    . ' (' . ($application['application_number'] ?? '') . ') has paid every admission fee, but the '
                    . 'registration number could not be generated automatically. Please finalise the enrollment manually.',
                '/admin/admissions/applications/' . $applicationId,
                'student_application',
                $applicationId,
                'warning'
            );
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Telling both ends
    // ─────────────────────────────────────────────────────────────────────────

    /** users.id behind an application, for in-system notifications. */
    private function applicantUserId(int $applicationId): int
    {
        try {
            $row = $this->db->fetchOne(
                "SELECT user_id FROM `applicant_profiles` WHERE application_id = ? LIMIT 1",
                [$applicationId]
            );
            return (int)($row['user_id'] ?? 0);
        } catch (\Throwable $e) {
            return 0;
        }
    }

    private function applicantName(array $application): string
    {
        return trim(($application['first_name'] ?? '') . ' ' . ($application['last_name'] ?? ''));
    }

    /** @param list<array<string,mixed>> $bills */
    private function announceBilled(array $application, array $bills, array $summary): void
    {
        $applicationId = (int)$application['id'];
        $name          = $this->applicantName($application);

        $rows = array_map(
            static fn (array $b): array => [
                ($b['label'] ?: $b['fee_type']),
                number_format((float)$b['amount_due'], 0) . ' ' . ($b['currency'] ?? 'RWF'),
            ],
            $bills
        );

        $this->email(
            $application,
            'Admission fees to pay — Catholic University of Rwanda',
            EmailTemplateHelper::admissionFeeBilledTemplate(
                $name,
                (string)($application['application_number'] ?? ''),
                $rows,
                number_format($summary['balance'], 0) . ' RWF'
            ),
            "Dear {$name}, the following admission fees are now due before your registration number can be issued: total "
                . number_format($summary['balance'], 0) . ' RWF. Pay through Urubuto Pay using your application number '
                . ($application['application_number'] ?? '') . ' as the payer code.'
        );

        // The Registration fee is mandatory, so name it explicitly when it is billed.
        $registration = array_values(array_filter($bills, static fn (array $b): bool => $b['fee_type'] === 'REGISTRATION'));
        $registrationNote = $registration
            ? ' You must pay the Registration fee of ' . number_format((float)$registration[0]['amount_due'], 0) . ' RWF.'
            : '';

        NotificationService::push(
            $this->applicantUserId($applicationId),
            'admission_billing',
            $registration ? 'Registration fee to pay' : 'Admission fees ready to pay',
            'Your admission fees (' . implode(', ', array_column($bills, 'fee_type')) . ') total '
                . number_format($summary['total_due'], 0) . ' RWF.' . $registrationNote
                . ' Pay them to receive your registration number.',
            '/applicant',
            'student_application',
            $applicationId,
            'warning'
        );
    }

    /** @param list<array{fee_type:string,label:string,amount:float,receipt_number:string}> $applied */
    private function announcePayment(
        array  $application,
        array  $applied,
        float  $amount,
        string $currency,
        string $reference,
        array  $summary
    ): void {
        $applicationId = (int)$application['id'];
        $name          = $this->applicantName($application);
        $paidLabel     = number_format($amount, 0) . ' ' . ($currency ?: 'RWF');
        $what          = implode(', ', array_map(
            static fn (array $a): string => (string)($a['label'] ?: $a['fee_type']),
            $applied
        ));

        $this->email(
            $application,
            'Payment received — Catholic University of Rwanda',
            EmailTemplateHelper::admissionFeePaymentTemplate(
                $name,
                (string)($application['application_number'] ?? ''),
                $paidLabel,
                $what !== '' ? $what : 'Admission fees',
                $reference,
                (string)($applied[0]['receipt_number'] ?? ''),
                number_format($summary['balance'], 0) . ' RWF',
                $summary['fully_paid']
            ),
            "Dear {$name}, we have received {$paidLabel} towards your admission fees ({$what}). Reference {$reference}. "
                . ($summary['fully_paid']
                    ? 'Your admission fees are now fully paid.'
                    : 'Outstanding balance: ' . number_format($summary['balance'], 0) . ' RWF.')
        );

        NotificationService::push(
            $this->applicantUserId($applicationId),
            'admission_billing',
            'Admission fee payment received',
            $paidLabel . ' received towards ' . ($what !== '' ? $what : 'your admission fees') . '. '
                . ($summary['fully_paid']
                    ? 'All admission fees are settled.'
                    : 'Balance remaining: ' . number_format($summary['balance'], 0) . ' RWF.'),
            '/applicant',
            'student_application',
            $applicationId,
            'success'
        );

        NotificationService::pushToPermissionHolders(
            \App\Constants\Permissions::MANAGE_ADMISSIONS,
            'admission_billing',
            'Admission fee payment received',
            $name . ' (' . ($application['application_number'] ?? '') . ') paid ' . $paidLabel . ' — ' . $what . '. '
                . ($summary['fully_paid'] ? 'Fully settled.' : 'Balance ' . number_format($summary['balance'], 0) . ' RWF.'),
            '/admin/admissions/applications/' . $applicationId,
            'student_application',
            $applicationId,
            'success'
        );
    }

    private function announceFullyPaid(array $application): void
    {
        NotificationService::pushToPermissionHolders(
            \App\Constants\Permissions::MANAGE_ADMISSIONS,
            'admission_billing',
            'Admission fees fully paid',
            $this->applicantName($application) . ' (' . ($application['application_number'] ?? '')
                . ') has settled every admission fee and is ready for a registration number.',
            '/admin/admissions/applications/' . (int)$application['id'],
            'student_application',
            (int)$application['id'],
            'success'
        );
    }

    private function announceEnrolled(array $application, string $regNumber): void
    {
        NotificationService::push(
            $this->applicantUserId((int)$application['id']),
            'admission_billing',
            'Registration number issued',
            'Your registration number is ' . $regNumber . '. Welcome to the Catholic University of Rwanda.',
            '/applicant',
            'student_application',
            (int)$application['id'],
            'success'
        );
    }

    /** Best-effort mail — a delivery failure must never undo a recorded payment. */
    private function email(array $application, string $subject, string $html, string $text): void
    {
        $to = trim((string)($application['email'] ?? ''));
        if ($to === '') {
            return;
        }

        try {
            $this->mail->send($to, $subject, $html, $text);
        } catch (\Throwable $e) {
            error_log('[AdmissionBilling] email failed for ' . $to . ': ' . $e->getMessage());
        }
    }
}

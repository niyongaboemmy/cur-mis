<?php

declare(strict_types=1);

namespace App\Services;

use Core\Database;
use App\Models\ApplicationInvoiceModel;
use App\Models\ApplicationInvoicePaymentModel;
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

        $out = [];
        foreach ($this->billableFeeTypes() as $feeType) {
            $structure = $yearId > 0
                ? $this->matchStructure($yearId, $feeType, $departmentId, $levelId, $category)
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
        string $category
    ): array|false {
        try {
            $match = $this->structures->findBestMatch($yearId, $feeType, $departmentId, $levelId, null, $category);
            if (!$match && $category !== 'local') {
                $match = $this->structures->findBestMatch($yearId, $feeType, $departmentId, $levelId, null, 'local');
            }
            return $match;
        } catch (\Throwable $e) {
            error_log('[AdmissionBilling] fee structure lookup failed: ' . $e->getMessage());
            return false;
        }
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
            'summary'            => $summary,
            // What bill() would raise — lets the validator see the price (and any
            // missing structure) before committing to it.
            'billable'           => $this->priceFor($application),
            'is_billed'          => $summary['count'] > 0,
            'fully_paid'         => $summary['fully_paid'],
            'merchant_code'      => $merchantCode,
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
     * Apply a confirmed UrubutoPay payment to an applicant's admission bills.
     *
     * The bill matching the service the payer chose is settled first; anything
     * left over spills onto the remaining bills oldest-first, so an overpayment
     * lands on real debt instead of sitting unapplied. Idempotent on the gateway
     * transaction code.
     *
     * @return array{status:string,payment_id:int|null,message:string,internal_tx_id:string,external_tx_id:string,payer_phone_number:string}
     */
    public function applyGatewayPayment(
        array  $application,
        string $txCode,
        float  $amount,
        string $currency,
        string $paidAt,
        string $serviceCode
    ): array {
        $applicationId = (int)$application['id'];
        $phone         = (string)($application['phone'] ?? '');

        $duplicate = $this->payments->existsForReference($txCode);
        if ($duplicate) {
            return [
                'status'             => 'duplicate',
                'payment_id'         => (int)$duplicate['id'],
                'message'            => 'Payment recorded',
                'internal_tx_id'     => (string)($duplicate['receipt_number'] ?? $txCode),
                'external_tx_id'     => $txCode,
                'payer_phone_number' => $phone,
            ];
        }

        $open = $this->invoices->openForApplication($applicationId);
        if (empty($open)) {
            return [
                'status'             => 'error',
                'payment_id'         => null,
                'message'            => 'No outstanding admission bill for application ' . ($application['application_number'] ?? $applicationId),
                'internal_tx_id'     => (string)($application['application_number'] ?? ''),
                'external_tx_id'     => $txCode,
                'payer_phone_number' => $phone,
            ];
        }

        $open = $this->prioritiseByServiceCode($open, $serviceCode);

        $remaining      = $amount;
        $firstPaymentId = null;
        $applied        = [];
        $index          = 0;

        foreach ($open as $bill) {
            if ($remaining <= 0.009) {
                break;
            }

            $gap = round((float)$bill['amount_due'] - (float)$bill['amount_paid'], 2);
            if ($gap <= 0) {
                continue;
            }

            $apply     = min($remaining, $gap);
            $reference = $txCode . ($index > 0 ? '-' . ($index + 1) : '');
            $receipt   = $this->generateReceiptNumber();

            $paymentId = (int)$this->payments->create([
                'application_invoice_id' => (int)$bill['id'],
                'application_id'         => $applicationId,
                'amount'                 => $apply,
                'currency'               => $currency ?: (string)$bill['currency'],
                'payment_method'         => 'MOBILE_MONEY',
                'reference_number'       => $reference,
                'receipt_number'         => $receipt,
                'service_code'           => $serviceCode !== '' ? $serviceCode : null,
                'source'                 => 'GATEWAY',
                'notes'                  => 'UrubutoPay — service: ' . ($serviceCode ?: 'unspecified') . ', tx: ' . $txCode,
                'paid_at'                => $paidAt,
            ]);

            $this->invoices->applyPayment((int)$bill['id'], $apply, $txCode, $paidAt);

            $firstPaymentId ??= $paymentId;
            $applied[]        = [
                'fee_type'       => (string)$bill['fee_type'],
                'label'          => (string)($bill['label'] ?: $bill['fee_type']),
                'amount'         => $apply,
                'receipt_number' => $receipt,
            ];
            $remaining -= $apply;
            $index++;
        }

        $summary = $this->invoices->summaryFor($applicationId);

        SystemLogService::log(
            'CREATE',
            'ADMISSIONS',
            'UrubutoPay admission fee: tx=' . $txCode
                . ', application=' . ($application['application_number'] ?? $applicationId)
                . ', amount=' . $amount . ' RWF, bills_settled=' . count($applied)
                . ', balance=' . number_format($summary['balance'], 0) . ' RWF.',
            $applicationId,
            'student_application',
            ['transaction_code' => $txCode, 'amount' => $amount, 'service_code' => $serviceCode, 'applied' => $applied]
        );

        $this->announcePayment($application, $applied, $amount, $currency, $txCode, $summary);

        if ($summary['fully_paid']) {
            $this->onFullyPaid($applicationId);
        }

        return [
            'status'             => 'recorded',
            'payment_id'         => $firstPaymentId,
            'message'            => 'Payment recorded',
            'internal_tx_id'     => (string)($applied[0]['receipt_number'] ?? $application['application_number'] ?? ''),
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
        int    $actorId,
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
            'recorded_by'            => $actorId,
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

        NotificationService::push(
            $this->applicantUserId($applicationId),
            'admission_billing',
            'Admission fees ready to pay',
            'Your admission fees (' . implode(', ', array_column($bills, 'fee_type')) . ') total '
                . number_format($summary['total_due'], 0) . ' RWF. Pay them to receive your registration number.',
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

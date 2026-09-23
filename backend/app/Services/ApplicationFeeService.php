<?php

declare(strict_types=1);

namespace App\Services;

use Core\Database;
use App\Models\FeeStructureModel;
use App\Models\StudentApplicationModel;

/**
 * ApplicationFeeService
 *
 * One place that answers the two questions the application (processing) fee
 * raises, and that every screen and the gateway callback now agree on:
 *
 *   1. HOW MUCH IS OWED?  → quoteFor()
 *   2. HOW MUCH IS PAID?  → summaryFor()
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * PRICING. The fee used to be read from `settings.application_fee_mapped_fee_
 * structure_id`, which migration 086 introduced for a different purpose: it
 * names the invoice the applicant's payment is CREDITED onto at enrollment
 * (REGISTRATION by default). Pointing at a REGISTRATION row makes that credit
 * land correctly and simultaneously quotes the registration price as the
 * application fee — the two meanings had been collapsed onto one setting. Here
 * they are separated: the price comes from a published `fee_structures` row of
 * fee_type APPLICATION matched to the applicant's year / department / level /
 * category, exactly the way AdmissionBillingService prices REGISTRATION and
 * CURSU. The mapping setting is honoured for pricing only when it genuinely
 * points at an APPLICATION structure.
 *
 * PARTIAL PAYMENTS. UrubutoPay lets the payer name the amount, so a 5,000 RWF
 * quote can be met with 100. Payments are therefore a ledger
 * (`application_fee_payments`), not a single column: `student_applications.
 * payment_amount` carries the cumulative total and `paid_at` is stamped only
 * when the balance reaches zero.
 *
 * The quote is frozen onto `student_applications.application_fee_due` at the
 * first payment, so a price change mid-pipeline never moves a balance the
 * applicant is already paying down.
 */
class ApplicationFeeService
{
    /** Amounts within this much of each other are the same amount (RWF, 2dp). */
    private const EPSILON = 0.009;

    private Database                $db;
    private FeeStructureModel       $structures;
    private StudentApplicationModel $applications;

    public function __construct()
    {
        $this->db           = Database::getInstance();
        $this->structures   = new FeeStructureModel();
        $this->applications = new StudentApplicationModel();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Pricing
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * What this applicant must pay for their application to be processed.
     *
     * Resolution order — the first tier that yields a positive amount wins:
     *
     *  1. `application_fee_due` already frozen on the application (a quote in
     *     flight is never re-priced under the payer).
     *  2. Published APPLICATION fee structure matched to year + department +
     *     level + student category.
     *  3. Published APPLICATION structure for the year, institution-wide — used
     *     when every department publishes the same price (the usual case), so a
     *     department that has no row of its own is still priced from Finance's
     *     published figure rather than from a fallback constant.
     *  4. `settings.application_fee_mapped_fee_structure_id`, but only when it
     *     points at an APPLICATION structure (see the class note).
     *  5. `settings.application_fee_amount`.
     *  6. Hard default: 5,000 RWF.
     *
     * @param  array<string,mixed> $application a `student_applications` row
     * @return array{amount:float,currency:string,fee_structure_id:?int,label:string,source:string,frozen:bool}
     */
    public function quoteFor(array $application): array
    {
        $frozen = $application['application_fee_due'] ?? null;
        if ($frozen !== null && (float)$frozen > 0) {
            return [
                'amount'           => round((float)$frozen, 2),
                'currency'         => (string)($application['payment_currency'] ?: 'RWF'),
                'fee_structure_id' => isset($application['application_fee_structure_id'])
                    ? ((int)$application['application_fee_structure_id'] ?: null)
                    : null,
                'label'            => 'Application Fee',
                'source'           => 'frozen_quote',
                'frozen'           => true,
            ];
        }

        $yearId       = (int)($application['academic_year_id'] ?? 0);
        $departmentId = (int)($application['department_id'] ?? 0) ?: null;
        $levelId      = (int)($application['level_id'] ?? 0) ?: null;
        $category     = $this->studentCategory($application);

        // 2. Best published match for this applicant.
        if ($yearId > 0) {
            $match = $this->matchStructure($yearId, $departmentId, $levelId, $category);
            if ($match && (float)$match['amount'] > 0) {
                return $this->fromStructure($match, 'fee_structure_match');
            }

            // 3. Institution-wide APPLICATION price for the year.
            $wide = $this->institutionWidePrice($yearId);
            if ($wide) {
                return $this->fromStructure($wide, 'fee_structure_institution_wide');
            }
        }

        // 4. The mapped structure — pricing only when it really is an APPLICATION fee.
        $mapped = $this->mappedStructure();
        if ($mapped && strtoupper((string)$mapped['fee_type']) === 'APPLICATION' && (float)$mapped['amount'] > 0) {
            return $this->fromStructure($mapped, 'mapped_setting');
        }

        // 5. The settings amount.
        $row    = $this->db->fetchOne(
            "SELECT value FROM `settings` WHERE key_name = 'application_fee_amount' LIMIT 1",
            []
        );
        $amount = $row ? (float)$row['value'] : 0.0;
        if ($amount > 0) {
            return [
                'amount'           => round($amount, 2),
                'currency'         => 'RWF',
                'fee_structure_id' => null,
                'label'            => 'Application Fee',
                'source'           => 'settings_amount',
                'frozen'           => false,
            ];
        }

        // 6. Hard default.
        return [
            'amount'           => 5000.0,
            'currency'         => 'RWF',
            'fee_structure_id' => null,
            'label'            => 'Application Fee',
            'source'           => 'default',
            'frozen'           => false,
        ];
    }

    /** Quote by application id — same rules, one fetch. */
    public function quoteForApplication(int $applicationId): array
    {
        $app = $this->applications->find($applicationId);
        return $this->quoteFor($app ?: []);
    }

    /**
     * @param  array<string,mixed> $structure
     * @return array{amount:float,currency:string,fee_structure_id:?int,label:string,source:string,frozen:bool}
     */
    private function fromStructure(array $structure, string $source): array
    {
        $label = trim((string)($structure['label'] ?? ''));

        return [
            'amount'           => round((float)$structure['amount'], 2),
            'currency'         => (string)($structure['currency'] ?? 'RWF'),
            'fee_structure_id' => (int)$structure['id'],
            'label'            => $label !== '' ? $label : 'Application Fee',
            'source'           => $source,
            'frozen'           => false,
        ];
    }

    /**
     * Best published APPLICATION price for this applicant. Falls back to the
     * 'local' category the way AdmissionBillingService does — every live
     * structure is registered against 'local', so an international applicant
     * would otherwise match nothing.
     */
    private function matchStructure(int $yearId, ?int $departmentId, ?int $levelId, string $category): array|false
    {
        try {
            $match = $this->structures->findBestMatch($yearId, 'APPLICATION', $departmentId, $levelId, null, $category);
            if (!$match && $category !== 'local') {
                $match = $this->structures->findBestMatch($yearId, 'APPLICATION', $departmentId, $levelId, null, 'local');
            }
            return $match;
        } catch (\Throwable $e) {
            error_log('[ApplicationFee] fee structure lookup failed: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * The year's APPLICATION price when the institution publishes a single one.
     *
     * Most departments publish the same application fee, so a department with
     * no row of its own (or an application with no department yet) should still
     * be quoted Finance's published figure. Deliberately returns nothing when
     * the published prices disagree: guessing which department's price applies
     * is how an applicant gets charged a number nobody approved for them.
     */
    private function institutionWidePrice(int $yearId): array|false
    {
        try {
            $rows = $this->db->fetchAll(
                "SELECT id, amount, currency, label, fee_type
                   FROM `fee_structures`
                  WHERE academic_year_id = ? AND fee_type = 'APPLICATION' AND is_active = 1
                  ORDER BY (department_id IS NULL) DESC, id ASC",
                [$yearId]
            );
        } catch (\Throwable $e) {
            error_log('[ApplicationFee] institution-wide lookup failed: ' . $e->getMessage());
            return false;
        }

        if (!$rows) {
            return false;
        }

        $amounts = array_unique(array_map(
            static fn(array $r): string => number_format((float)$r['amount'], 2, '.', ''),
            $rows
        ));

        return count($amounts) === 1 ? $rows[0] : false;
    }

    /** The structure named by `settings.application_fee_mapped_fee_structure_id`, if any. */
    private function mappedStructure(): array|false
    {
        try {
            return $this->db->fetchOne(
                "SELECT fs.id, fs.amount, fs.currency, fs.label, fs.fee_type
                   FROM `settings` s
                   JOIN `fee_structures` fs ON fs.id = CAST(s.value AS UNSIGNED)
                  WHERE s.key_name = 'application_fee_mapped_fee_structure_id'
                    AND fs.is_active = 1
                  LIMIT 1",
                []
            );
        } catch (\Throwable $e) {
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

    // ─────────────────────────────────────────────────────────────────────────
    // The ledger
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Everything the portal, the admin desk and the gateway need to say where
     * this applicant stands on the processing fee.
     *
     * @return array{
     *   application_id:int, currency:string, required:float, paid:float,
     *   balance:float, percent:float, status:string, fully_paid:bool,
     *   quote:array<string,mixed>, payments:list<array<string,mixed>>,
     *   first_paid_at:?string, last_paid_at:?string, transaction_id:?string
     * }
     */
    public function summaryFor(int $applicationId, ?array $application = null): array
    {
        // A caller may hand in a partial row (the gateway's payer lookup selects
        // only a handful of columns). Pricing needs the year, department, level
        // and nationality, so anything short of that is re-read — quoting the
        // fallback amount because a SELECT was narrow is exactly the class of
        // silent mispricing this service exists to end.
        $app = $application && array_key_exists('academic_year_id', $application)
            ? $application
            : ($this->applications->find($applicationId) ?: ($application ?: []));

        $quote    = $this->quoteFor($app);
        $required = (float)$quote['amount'];
        $payments = $this->paymentsFor($applicationId);

        $paid = 0.0;
        foreach ($payments as $p) {
            $paid += (float)$p['amount'];
        }

        // Legacy safety net: an application settled before the ledger existed
        // and not caught by the backfill still reports what it carries.
        $flat = (float)($app['payment_amount'] ?? 0);
        if (!$payments && $flat > 0) {
            $paid = $flat;
        }

        $paid    = round($paid, 2);
        $balance = round(max(0.0, $required - $paid), 2);

        $status = 'unpaid';
        if ($paid > self::EPSILON) {
            if ($balance <= self::EPSILON) {
                $status = ($paid - $required) > self::EPSILON ? 'overpaid' : 'paid';
            } else {
                $status = 'partial';
            }
        }

        $percent = $required > 0 ? min(100.0, round(($paid / $required) * 100, 1)) : ($paid > 0 ? 100.0 : 0.0);

        return [
            'application_id' => $applicationId,
            'currency'       => (string)$quote['currency'],
            'required'       => $required,
            'paid'           => $paid,
            'balance'        => $balance,
            'percent'        => $percent,
            'status'         => $status,
            'fully_paid'     => $balance <= self::EPSILON && $paid > self::EPSILON,
            'quote'          => $quote,
            'payments'       => $payments,
            'first_paid_at'  => $payments ? (string)$payments[0]['paid_at'] : null,
            'last_paid_at'   => $payments ? (string)$payments[count($payments) - 1]['paid_at'] : ($app['paid_at'] ?? null),
            'transaction_id' => $app['transaction_id'] ?? null,
        ];
    }

    /** @return list<array<string,mixed>> oldest first */
    public function paymentsFor(int $applicationId): array
    {
        try {
            $rows = $this->db->fetchAll(
                "SELECT id, amount, currency, payment_method, reference_number, receipt_number,
                        service_code, source, notes, paid_at
                   FROM `application_fee_payments`
                  WHERE application_id = ?
                  ORDER BY paid_at ASC, id ASC",
                [$applicationId]
            );
        } catch (\Throwable $e) {
            // Table not migrated yet — the flat columns still answer.
            return [];
        }

        return array_map(static function (array $r): array {
            $r['id']     = (int)$r['id'];
            $r['amount'] = (float)$r['amount'];
            return $r;
        }, $rows ?: []);
    }

    /**
     * Record money received against the application fee.
     *
     * Idempotent on `$reference`: the gateway retries its callback, and the
     * UNIQUE key on `reference_number` is what makes a retry a no-op.
     *
     * Only the part that fits the balance is taken — the surplus is handed back
     * in `surplus` so the caller can spill it onto the admission bills rather
     * than burying an overpayment here.
     *
     * @return array{status:string,applied:float,surplus:float,summary:array<string,mixed>,payment_id:?int}
     */
    public function recordPayment(
        array  $application,
        string $reference,
        float  $amount,
        string $currency,
        string $paidAt,
        string $serviceCode = '',
        string $source = 'GATEWAY',
        ?int   $recordedBy = null,
        ?string $notes = null
    ): array {
        $applicationId = (int)($application['id'] ?? 0);
        $reference     = trim($reference);

        if ($applicationId <= 0 || $reference === '' || $amount <= 0) {
            return [
                'status'     => 'skipped',
                'applied'    => 0.0,
                'surplus'    => 0.0,
                'payment_id' => null,
                'summary'    => $this->summaryFor($applicationId, $application ?: null),
            ];
        }

        // Scoped to the application, matching the (application_id,
        // reference_number) unique key: the reference alone does not identify an
        // application — the payer code does — and legacy data repeats one
        // reference across several applicants.
        $existing = $this->db->fetchOne(
            "SELECT id FROM `application_fee_payments`
              WHERE application_id = ? AND reference_number = ?
              LIMIT 1",
            [$applicationId, $reference]
        );
        if ($existing) {
            return [
                'status'     => 'duplicate',
                'applied'    => 0.0,
                'surplus'    => 0.0,
                'payment_id' => (int)$existing['id'],
                'summary'    => $this->summaryFor($applicationId, $application),
            ];
        }

        $before  = $this->summaryFor($applicationId, $application);
        $applied = min($amount, max(0.0, $before['balance']));
        $surplus = round($amount - $applied, 2);

        // Nothing left owing: the whole payment belongs somewhere else.
        if ($applied <= self::EPSILON) {
            return [
                'status'     => 'no_balance',
                'applied'    => 0.0,
                'surplus'    => round($amount, 2),
                'payment_id' => null,
                'summary'    => $before,
            ];
        }

        $this->db->execute(
            "INSERT INTO `application_fee_payments`
                (application_id, amount, currency, payment_method, reference_number,
                 receipt_number, service_code, source, recorded_by, notes, paid_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                $applicationId,
                $applied,
                $currency ?: 'RWF',
                $source === 'MANUAL' ? 'MANUAL' : 'MOBILE_MONEY',
                $reference,
                $this->generateReceiptNumber(),
                $serviceCode !== '' ? $serviceCode : null,
                in_array($source, ['GATEWAY', 'MANUAL', 'SIMULATED'], true) ? $source : 'GATEWAY',
                $recordedBy,
                $notes,
                $paidAt,
            ]
        );
        $paymentId = (int)$this->db->lastInsertId();

        $after = $this->summaryFor($applicationId, $application);

        // Mirror the ledger onto the flat columns every other reader still uses.
        // `paid_at` means SETTLED, so it is stamped only once the balance is clear.
        $this->db->execute(
            "UPDATE `student_applications`
                SET payment_amount              = ?,
                    payment_currency            = ?,
                    transaction_id              = ?,
                    application_fee_due         = COALESCE(application_fee_due, ?),
                    application_fee_structure_id = COALESCE(application_fee_structure_id, ?),
                    paid_at                     = ?,
                    updated_at                  = NOW()
              WHERE id = ?",
            [
                $after['paid'],
                $currency ?: 'RWF',
                $reference,
                $after['required'],
                $after['quote']['fee_structure_id'],
                $after['fully_paid'] ? $paidAt : null,
                $applicationId,
            ]
        );

        $after['transaction_id'] = $reference;

        return [
            'status'     => 'recorded',
            'applied'    => round($applied, 2),
            'surplus'    => $surplus,
            'payment_id' => $paymentId,
            'summary'    => $after,
        ];
    }

    /** RCP-YYYYMMDD-XXXXXX, the shape used across the admission ledgers. */
    private function generateReceiptNumber(): string
    {
        return 'RCP-' . date('Ymd') . '-' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 6));
    }
}

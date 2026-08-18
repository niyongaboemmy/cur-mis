<?php

declare(strict_types=1);

namespace App\Models;

/**
 * UrubutoServiceModel
 *
 * The catalogue of services registered on the UrubutoPay merchant account
 * (migration 134). Each row ties a gateway `service_code` to the internal
 * `fee_invoices.fee_type` it settles, which is what lets a callback say WHAT
 * the payer paid for instead of just how much.
 *
 * Rows are read on every validate-payer and every payment callback, and the
 * catalogue is tiny (~25 rows) and effectively static, so the whole table is
 * memoised per request.
 */
class UrubutoServiceModel extends BaseModel
{
    protected string $table = 'urubuto_services';
    protected array $fillable = [
        'urubuto_service_id', 'service_code', 'service_name', 'fee_type', 'fee_structure_type', 'payer_target',
        'account_number', 'bank_name', 'default_amount', 'alias_of',
        'show_in_menu', 'is_active', 'sort_order',
    ];

    /** @var array<string,array<string,mixed>>|null service_code => row */
    private static ?array $cache = null;

    /**
     * Whole active catalogue keyed by service_code. Named `catalogue()` rather
     * than `all()` so it does not clash with BaseModel::all(orderBy, direction).
     *
     * Falls back to an empty catalogue if the table is missing (migration 134
     * not yet applied) so a webhook never 500s on a fresh deploy — callers then
     * behave exactly as they did before the catalogue existed.
     *
     * @return array<string,array<string,mixed>>
     */
    public function catalogue(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }

        try {
            $rows = $this->db->fetchAll(
                "SELECT * FROM `urubuto_services` WHERE `is_active` = 1 ORDER BY `sort_order` ASC, `id` ASC",
                []
            );
        } catch (\Throwable $e) {
            error_log('[UrubutoServiceModel] catalogue unavailable: ' . $e->getMessage());
            $rows = [];
        }

        $byCode = [];
        foreach ($rows as $row) {
            $byCode[(string)$row['service_code']] = $row;
        }

        return self::$cache = $byCode;
    }

    /**
     * Resolve a gateway service_code to its catalogue row, following `alias_of`
     * one hop so retired codes from the previous merchant registration still
     * land on the live service.
     *
     * @return array<string,mixed>|null
     */
    public function findByCode(string $serviceCode): ?array
    {
        $code = trim($serviceCode);
        if ($code === '') {
            return null;
        }

        $all = $this->catalogue();
        $row = $all[$code] ?? null;
        if (!$row) {
            return null;
        }

        $alias = trim((string)($row['alias_of'] ?? ''));
        if ($alias !== '' && isset($all[$alias])) {
            // Keep the alias's own code visible for reconciliation, but adopt
            // the live service's mapping.
            $live                 = $all[$alias];
            $live['matched_code'] = $code;
            return $live;
        }

        $row['matched_code'] = $code;
        return $row;
    }

    /**
     * Resolve whatever the gateway sent to identify the chosen service.
     *
     * A callback may name the service by its `service_code` ('fines-1062'), by
     * the gateway-side numeric `service_id` ('10264'), or by its display name
     * ('Fines'). findByCode() handles only the first, so a callback carrying
     * either of the other two resolved to nothing and the payment lost the one
     * fact that says WHAT was paid for. Alias resolution is inherited from
     * findByCode().
     *
     * @return array<string,mixed>|null
     */
    public function resolveAny(string $candidate): ?array
    {
        $needle = trim($candidate);
        if ($needle === '') {
            return null;
        }

        $row = $this->findByCode($needle);
        if ($row) {
            return $row;
        }

        $all = $this->catalogue();

        if (ctype_digit($needle)) {
            foreach ($all as $svc) {
                if ((string)($svc['urubuto_service_id'] ?? '') === $needle) {
                    return $this->findByCode((string)$svc['service_code']);
                }
            }
        }

        $slug = preg_replace('/[^a-z0-9]+/', '', strtolower($needle)) ?? '';
        if ($slug !== '') {
            foreach ($all as $svc) {
                $name = preg_replace('/[^a-z0-9]+/', '', strtolower((string)$svc['service_name'])) ?? '';
                if ($name !== '' && $name === $slug) {
                    return $this->findByCode((string)$svc['service_code']);
                }
            }
        }

        return null;
    }

    /**
     * The internal fee_invoices.fee_type a gateway service settles — the BILLING
     * vocabulary, used to pick which invoice a payment pays down. Null when the
     * service maps to none.
     *
     * Returned verbatim, not upper-cased: live fee_invoices rows use both
     * 'TUITION' and lowercase 'service_request', and the caller compares
     * case-insensitively anyway.
     */
    public function feeTypeForCode(string $serviceCode): ?string
    {
        $row  = $this->findByCode($serviceCode);
        $type = $row ? trim((string)($row['fee_type'] ?? '')) : '';
        return $type !== '' ? $type : null;
    }

    /**
     * The fee_structures.fee_type that PRICES a gateway service — the pricing
     * vocabulary, which is deliberately distinct from feeTypeForCode()'s billing
     * vocabulary (live fee_structures use 'CURSU', 'GRADUATION', 'TRANSCRIPT',
     * 'INTERNSHIP' … where fee_invoices only has 'TUITION' / 'service_request').
     *
     * Null when no central price is configured for the service yet.
     */
    public function feeStructureTypeForCode(string $serviceCode): ?string
    {
        $row  = $this->findByCode($serviceCode);
        $type = $row ? trim((string)($row['fee_structure_type'] ?? '')) : '';
        return $type !== '' ? $type : null;
    }

    /**
     * Every active, non-alias service belonging to a payer branch, in sort order.
     * Aliases are excluded — a retired code must never be offered for a new payment.
     *
     * @return list<array<string,mixed>>
     */
    public function forTarget(string $payerTarget): array
    {
        $out = [];
        foreach ($this->catalogue() as $row) {
            if (!empty($row['alias_of'])) {
                continue;
            }
            if (strtoupper((string)$row['payer_target']) !== strtoupper($payerTarget)) {
                continue;
            }
            $out[] = $row;
        }
        return $out;
    }

    /**
     * Subset of forTarget() that should appear on the payer's UrubutoPay menu.
     * Document services are billed through their own service-request checkout
     * link, so they carry show_in_menu = 0 and stay off the student menu.
     *
     * @return list<array<string,mixed>>
     */
    public function menuFor(string $payerTarget): array
    {
        return array_values(array_filter(
            $this->forTarget($payerTarget),
            static fn (array $row): bool => (int)($row['show_in_menu'] ?? 0) === 1
        ));
    }

    /**
     * First active, non-alias service code mapped to the given internal fee_type
     * for a payer branch — used to pick the outbound `sccd=` on a checkout link.
     */
    public function codeForFeeType(string $feeType, string $payerTarget = 'STUDENT'): ?string
    {
        foreach ($this->catalogue() as $row) {
            if (!empty($row['alias_of'])) {
                continue;
            }
            if (strtoupper((string)($row['fee_type'] ?? '')) !== strtoupper($feeType)) {
                continue;
            }
            if (strtoupper((string)$row['payer_target']) !== strtoupper($payerTarget)) {
                continue;
            }
            return (string)$row['service_code'];
        }
        return null;
    }

    /** Drop the per-request memo — for tests and for admin edits to the catalogue. */
    public static function flushCache(): void
    {
        self::$cache = null;
    }
}

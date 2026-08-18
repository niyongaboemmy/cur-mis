<?php

declare(strict_types=1);

/**
 * UrubutoPay service-mapping audit.
 *
 * Read-only health check for the `urubuto_services` catalogue (migration 134).
 * The mapping is the only thing that lets a payment say what it was for, so a
 * silent gap in it — a gateway service with no fee type, no published price, or
 * a code arriving on callbacks that nobody registered — turns into unattributed
 * revenue. This surfaces those gaps instead of letting them accumulate.
 *
 * Run it after UrubutoPay registers or retires a service, and after finance
 * edits the fee schedule.
 *
 *   php scripts/urubuto_mapping_audit.php
 *
 * Exit code 0 = clean, 1 = at least one finding.
 */

define('BASE_PATH', dirname(__DIR__));
require BASE_PATH . '/vendor/autoload.php';
(Dotenv\Dotenv::createImmutable(BASE_PATH))->load();

use Core\Database;

$db       = Database::getInstance();
$findings = [];

function section(string $title): void
{
    echo "\n\033[1m{$title}\033[0m\n";
}

function note(string $line): void
{
    echo "  {$line}\n";
}

function warn(string $line): void
{
    global $findings;
    $findings[] = $line;
    echo "  \033[33m!\033[0m {$line}\n";
}

function good(string $line): void
{
    echo "  \033[32m✓\033[0m {$line}\n";
}

// ── 0. Catalogue present ──────────────────────────────────────────────────────
$exists = $db->fetchOne(
    "SELECT 1 AS p FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'urubuto_services' LIMIT 1",
    []
);
if (!$exists) {
    echo "\033[31murubuto_services is missing — migration 134 has not been applied.\033[0m\n";
    exit(1);
}

$services = $db->fetchAll('SELECT * FROM `urubuto_services` ORDER BY `sort_order` ASC, `id` ASC', []);
$live     = array_values(array_filter($services, static fn (array $r): bool => empty($r['alias_of']) && (int)$r['is_active'] === 1));

section('1. Catalogue');
note(sprintf('%d rows (%d live services, %d retired aliases)',
    count($services), count($live), count($services) - count($live)));

// ── 1. Billing mapping: every service should name a fee_invoices.fee_type ─────
section('2. Billing mapping (service → fee_invoices.fee_type)');
$unmappedBilling = array_filter($live, static fn (array $r): bool => trim((string)$r['fee_type']) === '');
foreach ($unmappedBilling as $r) {
    // `other-fees` is intentionally unmapped — it is the catch-all bucket.
    if ($r['service_code'] === 'other-fees-8272') {
        good("{$r['service_code']} — intentionally unmapped (catch-all, applies FIFO)");
        continue;
    }
    warn("{$r['service_code']} ({$r['service_name']}) has no fee_type — its payments will apply FIFO to the oldest debt");
}
if (count($unmappedBilling) <= 1) {
    good('every other service settles a specific fee type');
}

// ── 2. Pricing mapping: fee_structure_type must exist in fee_structures ───────
section('3. Pricing mapping (service → fee_structures.fee_type)');
$structureTypes = array_column(
    $db->fetchAll("SELECT DISTINCT fee_type FROM `fee_structures` WHERE is_active = 1", []),
    'fee_type'
);

$pricedCount = 0;
foreach ($live as $r) {
    $type = trim((string)($r['fee_structure_type'] ?? ''));
    if ($type === '') {
        // The catch-all bucket has no single price by definition.
        if ($r['service_code'] === 'other-fees-8272') {
            good("{$r['service_code']} — intentionally unpriced (payer names the amount)");
            continue;
        }
        warn("{$r['service_code']} ({$r['service_name']}) has no fee_structure_type — the payer is never quoted a price for it");
        continue;
    }
    if (!in_array($type, $structureTypes, true)) {
        warn("{$r['service_code']} points at fee_structure_type '{$type}', which has no active row in fee_structures");
        continue;
    }
    $pricedCount++;
}
good("{$pricedCount} of " . count($live) . ' live services resolve to a published fee structure');

// ── 3. Fee structures nobody can pay for ─────────────────────────────────────
section('4. Fee structures with no gateway service');
$mappedTypes = array_filter(array_map(
    static fn (array $r): string => trim((string)($r['fee_structure_type'] ?? '')),
    $live
));
foreach ($structureTypes as $type) {
    if (!in_array($type, $mappedTypes, true)) {
        $n = $db->fetchOne('SELECT COUNT(*) AS n FROM `fee_structures` WHERE fee_type = ? AND is_active = 1', [$type]);
        warn("fee_structures type '{$type}' ({$n['n']} active rows) has no UrubutoPay service — students cannot pay it online");
    }
}
if (count($mappedTypes) === count(array_unique($mappedTypes))) {
    // duplicates are legitimate (two internship services share INTERNSHIP)
    good('no duplicate pricing mappings');
}

// ── 4. Codes seen in the wild that the catalogue does not know ───────────────
section('5. Unrecognised codes in recorded payments');
$hasColumn = $db->fetchOne(
    "SELECT 1 AS p FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fee_payments' AND COLUMN_NAME = 'urubuto_service_code' LIMIT 1",
    []
);
if ($hasColumn) {
    $unknown = $db->fetchAll(
        "SELECT fp.urubuto_service_code AS code, COUNT(*) AS n, ROUND(SUM(fp.amount)) AS total
           FROM `fee_payments` fp
      LEFT JOIN `urubuto_services` us ON us.service_code = fp.urubuto_service_code
          WHERE fp.urubuto_service_code IS NOT NULL
            AND fp.urubuto_service_code <> ''
            AND us.id IS NULL
       GROUP BY fp.urubuto_service_code
       ORDER BY n DESC",
        []
    );
    foreach ($unknown as $u) {
        warn("'{$u['code']}' appears on {$u['n']} payment(s) totalling {$u['total']} RWF but is not in the catalogue");
    }
    if (empty($unknown)) {
        good('every recorded service code is registered');
    }

    $unattributed = $db->fetchOne(
        "SELECT COUNT(*) AS n FROM `fee_payments`
          WHERE payment_method = 'MOBILE_MONEY'
            AND status = 'confirmed'
            AND (urubuto_service_code IS NULL OR urubuto_service_code = '')",
        []
    );
    if ((int)$unattributed['n'] > 0) {
        note("{$unattributed['n']} confirmed gateway payment(s) carry no service code (recorded before migration 134)");
    }
} else {
    warn('fee_payments.urubuto_service_code is missing — migration 134 is only half applied');
}

// ── 5. Retired-code aliases still point somewhere live ───────────────────────
section('6. Retired-code aliases');
$byCode = array_column($services, null, 'service_code');
foreach ($services as $r) {
    $alias = trim((string)($r['alias_of'] ?? ''));
    if ($alias === '') {
        continue;
    }
    if (!isset($byCode[$alias])) {
        warn("retired code '{$r['service_code']}' aliases '{$alias}', which does not exist — its callbacks will not resolve");
    } elseif (!empty($byCode[$alias]['alias_of'])) {
        warn("retired code '{$r['service_code']}' aliases '{$alias}', which is itself an alias (only one hop is followed)");
    } else {
        good("'{$r['service_code']}' → '{$alias}'");
    }
    if ((int)$r['show_in_menu'] === 1) {
        warn("retired code '{$r['service_code']}' is still on the payer menu — new payments should never use it");
    }
}

// ── Summary ───────────────────────────────────────────────────────────────────
echo "\n" . str_repeat('─', 72) . "\n";
if (empty($findings)) {
    echo "\033[32mMapping is clean — every service resolves to a fee type and a price.\033[0m\n";
    exit(0);
}
printf("\033[33m%d finding(s) — each is a service whose payments cannot be fully attributed.\033[0m\n", count($findings));
exit(1);

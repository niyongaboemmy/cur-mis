<?php

declare(strict_types=1);

/**
 * Integration test for the UrubutoPay service mapping (migration 134).
 *
 * Covers the question the mapping exists to answer — "which service did this
 * payer pay for?" — end to end:
 *   1. catalogue resolution, including retired-code aliases
 *   2. the USSD menu built for a student (one row per service, no double-count)
 *   3. a real recordMobilePayment() callback settling the invoice matching the
 *      paid-for service first, then spilling the remainder onto the rest
 *
 * Drives the real service against the real database, then removes every row it
 * created. Fixtures are prefixed `ZZTEST_` so a crashed run is easy to spot and
 * clean by hand.
 *
 *   php scripts/tests/urubuto_service_mapping_test.php
 */

define('BASE_PATH', dirname(__DIR__, 2));
require BASE_PATH . '/vendor/autoload.php';
(Dotenv\Dotenv::createImmutable(BASE_PATH))->load();

use Core\Database;
use App\Models\UrubutoServiceModel;
use App\Services\UrubutoPayService;

$db      = Database::getInstance();
$catalog = new UrubutoServiceModel();
$service = new UrubutoPayService();

$passed = 0;
$failed = [];

function ok(string $name): void
{
    global $passed;
    $passed++;
    echo "  \033[32m✓\033[0m {$name}\n";
}

function fail(string $name, string $detail): void
{
    global $failed;
    $failed[] = "{$name} — {$detail}";
    echo "  \033[31m✗\033[0m {$name}\n      {$detail}\n";
}

function check(string $name, bool $cond, string $detail = ''): void
{
    $cond ? ok($name) : fail($name, $detail ?: 'assertion failed');
}

function equals(string $name, mixed $expected, mixed $actual): void
{
    check($name, $expected === $actual, 'expected ' . var_export($expected, true) . ', got ' . var_export($actual, true));
}

/** Call a private method on the service under test. */
function callPrivate(object $obj, string $method, mixed ...$args): mixed
{
    $m = (new ReflectionClass($obj))->getMethod($method);
    $m->setAccessible(true);
    return $m->invoke($obj, ...$args);
}

// Kept short: student.regnumber and fee_invoices.invoice_number are narrow.
$REG    = 'ZZT' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 8));
$TXCODE = 'ZZTESTTX' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 8));

// ── 1. Catalogue resolution ───────────────────────────────────────────────────
echo "\n1. Catalogue resolution\n";

check('catalogue is seeded', count($catalog->catalogue()) >= 22, 'only ' . count($catalog->catalogue()) . ' rows');
equals('tuition maps to TUITION',         'TUITION',       $catalog->feeTypeForCode('tuition-fees-4679'));
equals('retake maps to REPEAT_MODULE',    'REPEAT_MODULE', $catalog->feeTypeForCode('retake-5953'));
equals('fines maps to FINE',              'FINE',          $catalog->feeTypeForCode('fines-1062'));
equals('other-fees maps to nothing',      null,            $catalog->feeTypeForCode('other-fees-8272'));
equals('document service keeps live billing type', 'service_request', $catalog->feeTypeForCode('transcript-1712'));
equals('unknown code maps to nothing',    null,            $catalog->feeTypeForCode('not-a-real-code-9'));
equals('empty code maps to nothing',      null,            $catalog->feeTypeForCode(''));

$alias = $catalog->findByCode('tuition-fees-1258');
check('retired tuition code resolves to the live one', ($alias['service_code'] ?? null) === 'tuition-fees-4679',
    'got ' . var_export($alias['service_code'] ?? null, true));
equals('retired tuition code keeps its own code for reconciliation', 'tuition-fees-1258', $alias['matched_code'] ?? null);
equals('retired CURSU code still maps to REGISTRATION', 'REGISTRATION', $catalog->feeTypeForCode('cursu-fees-8249'));

// The pricing vocabulary is deliberately separate from the billing one.
equals('tuition priced by TUITION structures',      'TUITION',    $catalog->feeStructureTypeForCode('tuition-fees-4679'));
equals('CURSU bills REGISTRATION but prices CURSU', 'REGISTRATION', $catalog->feeTypeForCode('cursu-fees-5227'));
equals('…and prices from the CURSU structure',      'CURSU',      $catalog->feeStructureTypeForCode('cursu-fees-5227'));
equals('graduation priced by GRADUATION',           'GRADUATION', $catalog->feeStructureTypeForCode('graduation-fees-8196'));
equals('transcript priced by TRANSCRIPT',           'TRANSCRIPT', $catalog->feeStructureTypeForCode('transcript-1712'));
equals('retired code inherits the live price type', 'TUITION',    $catalog->feeStructureTypeForCode('tuition-fees-1258'));
equals('unpriced service has no structure type',    null,         $catalog->feeStructureTypeForCode('retake-5953'));

$menu = $catalog->menuFor('STUDENT');
check('student menu excludes retired codes',
    !in_array('tuition-fees-1258', array_column($menu, 'service_code'), true));
check('student menu excludes document services',
    !in_array('transcript-1712', array_column($menu, 'service_code'), true));
check('document services are still resolvable', count($catalog->forTarget('SERVICE_REQUEST')) === 5,
    'got ' . count($catalog->forTarget('SERVICE_REQUEST')));

// ── 2. Fixtures: a student owing two different fee types ──────────────────────
echo "\n2. Fixtures\n";

$db->execute(
    "INSERT INTO `student` (regnumber, fname, lname, student_state, faculty, phone, email)
     VALUES (?, 'ZZTEST', 'PAYER', 'active', '0', '0780000000', ?)",
    [$REG, strtolower($REG) . '@example.test']
);

// TUITION is the OLDER invoice, so a plain FIFO waterfall would settle it first.
$db->execute(
    "INSERT INTO `fee_invoices`
       (invoice_number, student_id, academic_year_id, semester, fee_type, description,
        amount_due, amount_paid, bursary_applied, status, is_system_generated, created_at)
     VALUES (?, ?, NULL, NULL, 'TUITION', 'ZZTEST tuition', 100000.00, 0.00, 0.00, 'unpaid', 1, DATE_SUB(NOW(), INTERVAL 2 DAY))",
    ['ZZT-T-' . $REG, $REG]
);
$tuitionInvoiceId = (int)$db->fetchOne('SELECT LAST_INSERT_ID() AS id', [])['id'];

$db->execute(
    "INSERT INTO `fee_invoices`
       (invoice_number, student_id, academic_year_id, semester, fee_type, description,
        amount_due, amount_paid, bursary_applied, status, is_system_generated, created_at)
     VALUES (?, ?, NULL, NULL, 'REPEAT_MODULE', 'ZZTEST retake', 30000.00, 0.00, 0.00, 'unpaid', 1, NOW())",
    ['ZZT-R-' . $REG, $REG]
);
$retakeInvoiceId = (int)$db->fetchOne('SELECT LAST_INSERT_ID() AS id', [])['id'];

ok("fixtures created for {$REG}");

// ── 3. The USSD menu the student sees ─────────────────────────────────────────
echo "\n3. USSD menu\n";

$services = callPrivate($service, 'buildServices', $REG);
$byCode   = array_column($services, 'amount', 'service_code');

equals('tuition service carries the tuition balance',   100000, $byCode['tuition-fees-4679'] ?? null);
equals('retake service carries the retake balance',      30000, $byCode['retake-5953'] ?? null);
equals('unrelated service shows zero',                       0, $byCode['graduation-fees-8196'] ?? null);
// A single debt must be claimed by exactly one service. Before the catalogue,
// one REGISTRATION balance would have been shown against registration-fees,
// CURSU fees and technology fees at once — three times the real debt.
equals('the tuition balance is shown exactly once', 1,
    count(array_keys($byCode, 100000, true)));
equals('the retake balance is shown exactly once',  1,
    count(array_keys($byCode, 30000, true)));
check('every menu entry is unique', count($services) === count(array_unique(array_column($services, 'service_code'))));

// ── 4. A callback that says "I am paying for a retake" ────────────────────────
echo "\n4. Targeted application\n";

$result = $service->recordMobilePayment([
    'callback_type'     => 'PAYMENT',
    'status'            => 'SUCCESSFUL',
    'transaction_id'    => $TXCODE,
    'payer_code'        => $REG,
    'amount'            => 50000,
    'currency'          => 'RWF',
    'service_code'      => 'retake-5953',
    'payment_date_time' => date('Y-m-d H:i:s'),
]);

equals('callback recorded', 'recorded', $result['status'] ?? null);

$retake  = $db->fetchOne('SELECT amount_paid, status FROM fee_invoices WHERE id = ?', [$retakeInvoiceId]);
$tuition = $db->fetchOne('SELECT amount_paid, status FROM fee_invoices WHERE id = ?', [$tuitionInvoiceId]);

equals('retake invoice settled in full first', 30000.00, (float)$retake['amount_paid']);
equals('retake invoice marked paid',           'paid',   $retake['status']);
equals('remainder spilled onto tuition',       20000.00, (float)$tuition['amount_paid']);
equals('tuition invoice left partial',         'partial', $tuition['status']);

$rows = $db->fetchAll(
    'SELECT fee_type, amount, urubuto_service_code FROM fee_payments
      WHERE student_id = ? ORDER BY id ASC',
    [$REG]
);
equals('two payment rows written', 2, count($rows));
equals('paid-for service recorded on the payment', 'retake-5953', $rows[0]['urubuto_service_code'] ?? null);
equals('spillover row records the same service',   'retake-5953', $rows[1]['urubuto_service_code'] ?? null);
equals('first row typed as the retake',            'REPEAT_MODULE', $rows[0]['fee_type'] ?? null);
equals('spillover row typed as tuition',           'TUITION',       $rows[1]['fee_type'] ?? null);

// ── 5. History names the service ──────────────────────────────────────────────
echo "\n5. Payment history\n";

$history = $service->getMobilePaymentHistory($REG, 10);
check('history returns the payment', count($history) >= 1, 'got ' . count($history));
equals('history names the paid-for service', 'Retake', $history[0]['service_name'] ?? null);

// ── 6. An unmapped service still applies FIFO ─────────────────────────────────
echo "\n6. Unmapped service falls back to FIFO\n";

$TX2 = $TXCODE . 'B';
$service->recordMobilePayment([
    'callback_type'     => 'PAYMENT',
    'status'            => 'SUCCESSFUL',
    'transaction_id'    => $TX2,
    'payer_code'        => $REG,
    'amount'            => 10000,
    'currency'          => 'RWF',
    'service_code'      => 'other-fees-8272',   // deliberately maps to no fee_type
    'payment_date_time' => date('Y-m-d H:i:s'),
]);

$tuition = $db->fetchOne('SELECT amount_paid FROM fee_invoices WHERE id = ?', [$tuitionInvoiceId]);
equals('unmapped service pays the oldest open invoice', 30000.00, (float)$tuition['amount_paid']);

// ── 7. Fee structure resolution ───────────────────────────────────────────────
// The other half of the mapping: the service code names a *pricing* fee type,
// and the student's own year/department pick the exact published structure.
echo "\n7. Fee structure resolution\n";

$cursu = $db->fetchOne(
    "SELECT fs.id, fs.amount, fs.academic_year_id, fs.department_id, fs.semester, ay.label
       FROM fee_structures fs
       JOIN academic_years ay ON ay.id = fs.academic_year_id
      WHERE fs.fee_type = 'CURSU' AND fs.is_active = 1 AND fs.department_id IS NOT NULL
      LIMIT 1",
    []
);

if (!$cursu) {
    echo "  (skipped — no active CURSU fee structure in this database)\n";
} else {
    $REG2 = 'ZZS' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 8));
    $TX3  = $TXCODE . 'C';

    $db->execute(
        "INSERT INTO `student` (regnumber, fname, lname, student_state, faculty, department, current_level, acc_year, phone, email)
         VALUES (?, 'ZZTEST', 'STRUCT', 'active', '0', ?, '1', ?, '0780000001', ?)",
        [$REG2, (string)$cursu['department_id'], (string)$cursu['label'], strtolower($REG2) . '@example.test']
    );

    // No invoice exists — the menu must still quote the published price.
    $menu2  = callPrivate($service, 'buildServices', $REG2);
    $quoted = array_column($menu2, 'amount', 'service_code');
    equals('uninvoiced CURSU service quotes the published price',
        (int)round((float)$cursu['amount']), $quoted['cursu-fees-5227'] ?? null);
    equals('service with no published price still quotes 0', 0, $quoted['retake-5953'] ?? null);

    // A PART payment must not look like a settled invoice.
    $part = max(1.0, round((float)$cursu['amount'] / 2));
    $res2 = $service->recordMobilePayment([
        'callback_type'     => 'PAYMENT',
        'status'            => 'SUCCESSFUL',
        'transaction_id'    => $TX3,
        'payer_code'        => $REG2,
        'amount'            => $part,
        'currency'          => 'RWF',
        'service_code'      => 'cursu-fees-5227',
        'payment_date_time' => date('Y-m-d H:i:s'),
    ]);
    equals('structure-priced callback recorded', 'recorded', $res2['status'] ?? null);

    $auto = $db->fetchOne(
        'SELECT fee_structure_id, fee_type, amount_due, amount_paid, status, description
           FROM fee_invoices WHERE student_id = ? LIMIT 1',
        [$REG2]
    );
    equals('auto-invoice links the resolved fee structure', (int)$cursu['id'], (int)($auto['fee_structure_id'] ?? 0));
    equals('auto-invoice bills the published amount, not the amount sent',
        (float)$cursu['amount'], (float)($auto['amount_due'] ?? 0));
    equals('auto-invoice credits only what was paid', $part, (float)($auto['amount_paid'] ?? 0));
    equals('part payment leaves the invoice partial', 'partial', $auto['status'] ?? null);
    equals('auto-invoice is billed under the billing fee type', 'REGISTRATION', $auto['fee_type'] ?? null);

    $pay2 = $db->fetchOne(
        'SELECT urubuto_service_code, fee_structure_id FROM fee_payments WHERE student_id = ? LIMIT 1',
        [$REG2]
    );
    equals('payment records the paid-for service',   'cursu-fees-5227', $pay2['urubuto_service_code'] ?? null);
    equals('payment records the priced structure',   (int)$cursu['id'], (int)($pay2['fee_structure_id'] ?? 0));

    $hist2 = $service->getMobilePaymentHistory($REG2, 5);
    equals('history names the service',   'CURSU fees',      $hist2[0]['service_name'] ?? null);
    equals('history names the structure', (int)$cursu['id'], (int)($hist2[0]['fee_structure_id'] ?? 0));
    check('history carries the structure label', !empty($hist2[0]['fee_structure_label']),
        'got ' . var_export($hist2[0]['fee_structure_label'] ?? null, true));

    $db->execute('DELETE FROM `fee_payments` WHERE student_id = ?', [$REG2]);
    $db->execute('DELETE FROM `fee_invoices` WHERE student_id = ?', [$REG2]);
    $db->execute('DELETE FROM `payment` WHERE student = ?', [$REG2]);
    $db->execute('DELETE FROM `bank_payment` WHERE reg_no = ?', [$REG2]);
    $db->execute('DELETE FROM `student` WHERE regnumber = ?', [$REG2]);
    ok('structure fixtures removed');
}

// ── Teardown ──────────────────────────────────────────────────────────────────
echo "\nTeardown\n";

$db->execute('DELETE FROM `payment_reconciliation_log` WHERE invoice_id IN (?, ?)', [$tuitionInvoiceId, $retakeInvoiceId]);
$db->execute('DELETE FROM `fee_payments` WHERE student_id = ?', [$REG]);
$db->execute('DELETE FROM `fee_invoices` WHERE student_id = ?', [$REG]);
$db->execute('DELETE FROM `payment` WHERE student = ?', [$REG]);
$db->execute('DELETE FROM `bank_payment` WHERE reg_no = ?', [$REG]);
$db->execute('DELETE FROM `student` WHERE regnumber = ?', [$REG]);
$leftover = $db->fetchOne('SELECT COUNT(*) AS n FROM fee_invoices WHERE student_id = ?', [$REG]);
equals('fixtures removed', 0, (int)$leftover['n']);

// ── Summary ───────────────────────────────────────────────────────────────────
echo "\n" . str_repeat('─', 60) . "\n";
printf("Passed: %d   Failed: %d\n", $passed, count($failed));
foreach ($failed as $f) {
    echo "  ✗ {$f}\n";
}
exit(count($failed) === 0 ? 0 : 1);

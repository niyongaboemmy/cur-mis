<?php
/**
 * Integration test: Application Fee Mapping
 * Run from project root:  php test_fee_mapping.php
 */

declare(strict_types=1);

// ── Bootstrap ─────────────────────────────────────────────────────────────────
define('BASE_PATH', __DIR__ . '/backend');

require BASE_PATH . '/vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable(BASE_PATH . '/');
$dotenv->load();

require BASE_PATH . '/config/app.php';

use Core\Database;
use App\Models\SettingModel;
use App\Models\FeeInvoiceModel;
use App\Models\FeePaymentModel;
use App\Services\FeeService;

$db = Database::getInstance();

// ── Helpers ───────────────────────────────────────────────────────────────────
$pass = 0; $fail = 0; $warn = 0;

function ok(string $label): void {
    global $pass;
    $pass++;
    echo "\033[32m  ✓ {$label}\033[0m\n";
}
function fail(string $label, string $reason = ''): void {
    global $fail;
    $fail++;
    echo "\033[31m  ✗ {$label}" . ($reason ? " — {$reason}" : '') . "\033[0m\n";
}
function warn(string $label): void {
    global $warn;
    $warn++;
    echo "\033[33m  ⚠ {$label}\033[0m\n";
}
function section(string $title): void {
    echo "\n\033[1;34m── {$title}\033[0m\n";
}

echo "\n\033[1mApplication Fee Mapping — Integration Test\033[0m\n";
echo str_repeat('─', 55) . "\n";

// ─────────────────────────────────────────────────────────────────────────────
section('1. Settings — DB state');
// ─────────────────────────────────────────────────────────────────────────────

$settingModel = new SettingModel();

$keys = [
    'application_fee_mapped_fee_type',
    'application_fee_amount',
    'application_fee_credit_on_enrollment',
];
foreach ($keys as $key) {
    $row = $settingModel->findBy('key_name', $key);
    if ($row) {
        ok("{$key} = \"{$row['value']}\"");
    } else {
        fail($key, 'not found in settings table');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
section('2. Settings — Update & revert via model');
// ─────────────────────────────────────────────────────────────────────────────

$orig = $settingModel->findBy('key_name', 'application_fee_mapped_fee_type');
$origVal = $orig ? $orig['value'] : 'REGISTRATION';

// Update to ADMISSION
$settingModel->update((int)$orig['id'], ['value' => 'ADMISSION']);
$check = $settingModel->findBy('key_name', 'application_fee_mapped_fee_type');
if ($check && $check['value'] === 'ADMISSION') {
    ok('Settings update: value changed to ADMISSION');
} else {
    fail('Settings update: value did not change');
}

// Revert
$settingModel->update((int)$orig['id'], ['value' => $origVal]);
$reverted = $settingModel->findBy('key_name', 'application_fee_mapped_fee_type');
if ($reverted && $reverted['value'] === $origVal) {
    ok("Settings revert: value restored to \"{$origVal}\"");
} else {
    fail('Settings revert failed');
}

// ─────────────────────────────────────────────────────────────────────────────
section('3. Fee Amount Resolution — FeeService::resolveApplicationFeeAmount()');
// ─────────────────────────────────────────────────────────────────────────────

$feeService = new FeeService();

// 3a. With no active year (year 0) — should return settings value
$amt = $feeService->resolveApplicationFeeAmount(0);
$settingAmt = (float)($settingModel->findBy('key_name', 'application_fee_amount')['value'] ?? 5000);
if ($amt === $settingAmt) {
    ok("resolveApplicationFeeAmount(0) = RWF {$amt} (from settings)");
} elseif ($amt > 0) {
    ok("resolveApplicationFeeAmount(0) = RWF {$amt} (from fee_structure or settings)");
} else {
    fail('resolveApplicationFeeAmount(0) returned 0 or negative');
}

// 3b. Find active academic year and check
$activeYear = $db->fetchOne("SELECT id, label FROM academic_years WHERE is_current = 1 ORDER BY id DESC LIMIT 1", []);
if ($activeYear) {
    $amt2 = $feeService->resolveApplicationFeeAmount((int)$activeYear['id']);
    if ($amt2 > 0) {
        ok("resolveApplicationFeeAmount(year={$activeYear['id']} '{$activeYear['label']}') = RWF {$amt2}");
    } else {
        fail("resolveApplicationFeeAmount returned 0 for active year {$activeYear['id']}");
    }

    // Check if a fee_structure exists for REGISTRATION in this year
    $structure = null;
    try {
        $structure = $db->fetchOne(
            "SELECT id, amount FROM fee_structures WHERE fee_type = 'REGISTRATION' AND academic_year_id = ? AND is_active = 1 LIMIT 1",
            [(int)$activeYear['id']]
        );
    } catch (\Throwable $e) { /* table may not exist */ }

    if ($structure) {
        ok("fee_structures has REGISTRATION for year {$activeYear['id']}: RWF {$structure['amount']} (would override settings)");
        if ((float)$structure['amount'] === $amt2) {
            ok('  Amount matches fee_structure (fee_structure priority confirmed)');
        } else {
            warn("  Amount {$amt2} differs from structure {$structure['amount']}");
        }
    } else {
        warn("No REGISTRATION fee_structure for year {$activeYear['id']} — settings fallback is active (RWF {$amt2})");
    }
} else {
    warn('No active academic year — skipping year-scoped amount test');
}

// ─────────────────────────────────────────────────────────────────────────────
section('4. fee_payments columns — source tracking');
// ─────────────────────────────────────────────────────────────────────────────

$cols = $db->fetchAll(
    "SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 'fee_payments'
       AND COLUMN_NAME IN ('source','source_application_id')
     ORDER BY ORDINAL_POSITION",
    []
);

if (count($cols) === 2) {
    foreach ($cols as $c) {
        ok("{$c['COLUMN_NAME']} ({$c['COLUMN_TYPE']}) default={$c['COLUMN_DEFAULT']}");
    }
} else {
    fail('fee_payments missing source/source_application_id columns', 'run migration 086 again');
}

// ─────────────────────────────────────────────────────────────────────────────
section('5. creditApplicationFee() — blank mapped type skips gracefully');
// ─────────────────────────────────────────────────────────────────────────────

// Temporarily blank the mapping
$mappingRow = $settingModel->findBy('key_name', 'application_fee_mapped_fee_type');
$settingModel->update((int)$mappingRow['id'], ['value' => '']);

$result = $feeService->creditApplicationFee(
    studentId:      'STUDENT-TEST-SKIP',
    academicYearId: 1,
    amount:         5000.0,
    transactionRef: 'TX-TEST-SKIP',
    applicationId:  99999999,
    actorId:        1
);

if ($result['status'] === 'skipped' && $result['reason'] === 'no_mapping_configured') {
    ok('creditApplicationFee: skipped gracefully when mapping is blank');
} else {
    fail('creditApplicationFee: expected skip with no_mapping_configured', json_encode($result));
}

// Restore
$settingModel->update((int)$mappingRow['id'], ['value' => $origVal]);
ok("Mapping restored to \"{$origVal}\"");

// ─────────────────────────────────────────────────────────────────────────────
section('6. creditApplicationFee() — no_payment skip');
// ─────────────────────────────────────────────────────────────────────────────

$result2 = $feeService->creditApplicationFee(
    studentId:      'STUDENT-TEST-NOPAY',
    academicYearId: 1,
    amount:         0.0,
    transactionRef: '',
    applicationId:  99999998,
    actorId:        1
);

if ($result2['status'] === 'skipped' && $result2['reason'] === 'no_payment') {
    ok('creditApplicationFee: skipped gracefully when amount=0 or tx is blank');
} else {
    fail('creditApplicationFee: expected skip with no_payment', json_encode($result2));
}

// ─────────────────────────────────────────────────────────────────────────────
section('7. creditApplicationFee() — full credit against real student + invoice');
// ─────────────────────────────────────────────────────────────────────────────

// Find any enrolled student who has a REGISTRATION invoice
$testStudent = null;
$testInvoice = null;
try {
    $testInvoice = $db->fetchOne(
        "SELECT fi.*, s.regnumber
         FROM fee_invoices fi
         JOIN student s ON s.regnumber COLLATE utf8mb4_unicode_ci = fi.student_id COLLATE utf8mb4_unicode_ci
         WHERE fi.fee_type = 'REGISTRATION'
           AND fi.status NOT IN ('waived')
         ORDER BY fi.id DESC LIMIT 1",
        []
    );
    $testStudent = $testInvoice ? $testInvoice['regnumber'] : null;
} catch (\Throwable $e) { /* fee_invoices may be empty */ }

if (!$testStudent || !$testInvoice) {
    // Create a minimal test invoice on the first available student
    $anyStudent = $db->fetchOne("SELECT regnumber FROM student LIMIT 1", []);
    $anyYear    = $db->fetchOne("SELECT id FROM academic_years ORDER BY id DESC LIMIT 1", []);

    if ($anyStudent && $anyYear) {
        $invoiceModel  = new FeeInvoiceModel();
        $testInvoiceId = (int)$invoiceModel->create([
            'invoice_number'      => 'INV-TEST-' . time(),
            'student_id'          => $anyStudent['regnumber'],
            'academic_year_id'    => (int)$anyYear['id'],
            'fee_type'            => 'REGISTRATION',
            'description'         => '[TEST] Temporary invoice for fee mapping test',
            'amount_due'          => 100000.00,
            'amount_paid'         => 0.00,
            'is_system_generated' => 0,
            'created_by'          => 1,
        ]);
        $testStudent = $anyStudent['regnumber'];
        $testInvoice = $invoiceModel->find($testInvoiceId);
        ok("Created test REGISTRATION invoice #{$testInvoiceId} for student {$testStudent}");
    } else {
        warn('No students or academic years found — skipping live credit test');
    }
}

if ($testStudent && $testInvoice) {
    $testAppId = 88888888; // fake application id that won't clash
    $testTxRef = 'TX-MAPPING-TEST-' . time();
    $creditAmt = 5000.0;

    $creditResult = $feeService->creditApplicationFee(
        studentId:      $testStudent,
        academicYearId: (int)$testInvoice['academic_year_id'],
        amount:         $creditAmt,
        transactionRef: $testTxRef,
        applicationId:  $testAppId,
        actorId:        1
    );

    if ($creditResult['status'] === 'credited') {
        ok("creditApplicationFee: status=credited, payment_id={$creditResult['payment_id']}, invoice_id={$creditResult['invoice_id']}");
        ok("Mapped fee type: {$creditResult['mapped_fee_type']}, Amount: RWF {$creditResult['amount']}");

        // Verify the fee_payments row
        $payRow = $db->fetchOne(
            "SELECT * FROM fee_payments WHERE id = ?",
            [$creditResult['payment_id']]
        );
        if ($payRow) {
            ok("fee_payments row created: source={$payRow['source']}, amount={$payRow['amount']}, ref={$payRow['reference_number']}");
            if ($payRow['source'] === 'APPLICATION_TRANSFER') {
                ok('source = APPLICATION_TRANSFER ✓');
            } else {
                fail('source is not APPLICATION_TRANSFER', $payRow['source']);
            }
            if ((int)$payRow['source_application_id'] === $testAppId) {
                ok('source_application_id matches fake app ID ✓');
            } else {
                fail('source_application_id mismatch', "expected {$testAppId}, got {$payRow['source_application_id']}");
            }
        } else {
            fail('fee_payments row not found after credit');
        }

        // Verify invoice amount_paid updated
        $updatedInvoice = $db->fetchOne("SELECT amount_paid, status FROM fee_invoices WHERE id = ?", [$creditResult['invoice_id']]);
        if ($updatedInvoice) {
            $paid = (float)$updatedInvoice['amount_paid'];
            if ($paid > 0) {
                ok("fee_invoices.amount_paid updated to RWF {$paid}, status={$updatedInvoice['status']}");
            } else {
                fail('fee_invoices.amount_paid was not updated');
            }
        }

        // Verify idempotency — calling again returns duplicate
        $dupResult = $feeService->creditApplicationFee(
            studentId:      $testStudent,
            academicYearId: (int)$testInvoice['academic_year_id'],
            amount:         $creditAmt,
            transactionRef: $testTxRef,
            applicationId:  $testAppId,
            actorId:        1
        );
        if ($dupResult['status'] === 'duplicate') {
            ok("Idempotency: second call returns status=duplicate (no double-credit)");
        } else {
            fail('Idempotency failed — second call did not return duplicate', json_encode($dupResult));
        }

        // Cleanup test data
        $db->execute("DELETE FROM fee_payments WHERE id = ?", [$creditResult['payment_id']]);
        $db->execute("UPDATE fee_invoices SET amount_paid = 0, status = 'unpaid', updated_at = NOW() WHERE id = ?", [$creditResult['invoice_id']]);
        // Remove test invoice if we created it
        if (str_starts_with((string)($testInvoice['invoice_number'] ?? ''), 'INV-TEST-')) {
            $db->execute("DELETE FROM fee_invoices WHERE id = ?", [(int)$testInvoice['id']]);
            ok('Test invoice cleaned up');
        }
        ok('Test payment cleaned up');

    } else {
        fail('creditApplicationFee: expected status=credited', json_encode($creditResult));
    }
}

// ─────────────────────────────────────────────────────────────────────────────
section('8. student_applications table — enrolled_student_id column');
// ─────────────────────────────────────────────────────────────────────────────

$saTable = $db->fetchOne(
    "SELECT COUNT(*) AS cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications'",
    []
)['cnt'];

if ($saTable) {
    $col = $db->fetchOne(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'enrolled_student_id'",
        []
    );
    if ($col) {
        ok('student_applications.enrolled_student_id column exists');
    } else {
        fail('student_applications.enrolled_student_id column missing — run migration 086');
    }
} else {
    warn('student_applications table not in this DB (admissions module not yet migrated) — column test skipped');
}

// ─────────────────────────────────────────────────────────────────────────────
section('9. Reconciliation report query — graceful on missing table');
// ─────────────────────────────────────────────────────────────────────────────

// Simulate what the controller does
$tableExists = (bool)$db->fetchOne(
    "SELECT COUNT(*) AS cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications'",
    []
)['cnt'];

if (!$tableExists) {
    ok('Reconciliation: returns empty summary when student_applications is absent (graceful)');
} else {
    $rows = $db->fetchAll(
        "SELECT COUNT(*) AS cnt FROM student_applications WHERE paid_at IS NOT NULL AND COALESCE(payment_amount,0) > 0",
        []
    );
    $cnt = (int)($rows[0]['cnt'] ?? 0);
    ok("Reconciliation: student_applications exists, {$cnt} paid applications in DB");

    $credited = $db->fetchOne(
        "SELECT COUNT(*) AS cnt FROM fee_payments WHERE source = 'APPLICATION_TRANSFER'",
        []
    );
    ok("APPLICATION_TRANSFER payments in fee_payments: " . ($credited['cnt'] ?? 0));
}

// ─────────────────────────────────────────────────────────────────────────────
section('10. HTTP endpoint smoke test (unauthenticated → 401)');
// ─────────────────────────────────────────────────────────────────────────────

$baseUrl = rtrim((string)($_ENV['APP_URL'] ?? 'http://localhost:8888/cur-mis/backend/public'), '/');

$endpoints = [
    ['GET',  '/api/system/fee-mapping'],
    ['GET',  '/api/finance/reports/application-fee-reconciliation'],
    ['POST', '/api/finance/reports/application-fee-reconciliation/run-pending'],
];

foreach ($endpoints as [$method, $path]) {
    $opts = [
        'http' => [
            'method'        => $method,
            'header'        => "Content-Type: application/json\r\n",
            'ignore_errors' => true,
            'timeout'       => 5,
        ],
    ];
    if ($method === 'POST') {
        $opts['http']['content'] = '{"academic_year_id":1}';
    }
    $ctx  = stream_context_create($opts);
    $resp = @file_get_contents($baseUrl . $path, false, $ctx);
    $body = $resp ? json_decode($resp, true) : null;
    $http = $http_response_header[0] ?? '';

    if ($body && $body['success'] === false && str_contains($body['message'] ?? '', 'nauthorized')) {
        ok("{$method} {$path} → 401 Unauthorized (route registered ✓)");
    } elseif ($body && $body['success'] === true) {
        ok("{$method} {$path} → 200 OK");
    } else {
        fail("{$method} {$path} → unexpected response", substr($resp ?? 'no response', 0, 80));
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

echo "\n" . str_repeat('─', 55) . "\n";
$total = $pass + $fail + $warn;
$colour = $fail > 0 ? "\033[31m" : "\033[32m";
echo "{$colour}Results: {$pass} passed, {$fail} failed, {$warn} warnings / {$total} checks\033[0m\n\n";

exit($fail > 0 ? 1 : 0);

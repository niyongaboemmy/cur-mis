<?php
/**
 * Reconcile an UrubutoPay admission-fee payment that never reached the bills.
 *
 * Symptom: the applicant's flat columns on student_applications (payment_amount,
 * transaction_id, paid_at) show the payment, but application_invoices still reads
 * "Paid 0 / 36,000" and the registration number is withheld.
 *
 * Usage (dry run is the default):
 *   php scripts/reconcile_admission_payment.php APP-2026-01392 11202610202125038509 36000
 *   php scripts/reconcile_admission_payment.php APP-2026-01392 11202610202125038509 36000 --apply
 *
 * Arguments:
 *   1. application number (the payer code)
 *   2. gateway transaction code, as UrubutoPay sent it as transaction_id
 *   3. amount actually received on the gateway, in RWF
 *   --service=CODE   optional UrubutoPay service code the payer chose
 *
 * With --apply the payment goes through AdmissionBillingService::applyGatewayPayment(),
 * the same code the webhook uses: it is waterfalled over the open bills and
 * automatic enrollment runs once they are all settled. It refuses to run when the
 * transaction is already recorded against an admission bill.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/config/database.php';
require_once dirname(__DIR__) . '/core/Database.php';
require_once dirname(__DIR__) . '/vendor/autoload.php';

use App\Services\AdmissionBillingService;
use Core\Database;

$args    = array_slice($argv, 1);
$apply   = in_array('--apply', $args, true);
$service = '';
foreach ($args as $arg) {
    if (str_starts_with($arg, '--service=')) {
        $service = substr($arg, strlen('--service='));
    }
}
$positional = array_values(array_filter($args, static fn (string $a): bool => !str_starts_with($a, '--')));

if (count($positional) !== 3) {
    fwrite(STDERR, "Usage: php scripts/reconcile_admission_payment.php <application_number> <transaction_code> <amount> [--service=CODE] [--apply]\n");
    exit(1);
}

[$appNumber, $txCode, $amountRaw] = $positional;
$amount = (float)$amountRaw;

if ($amount <= 0) {
    fwrite(STDERR, "The amount must be greater than zero.\n");
    exit(1);
}

$db = Database::getInstance();

function line(string $label, mixed $value): void
{
    printf("  %-28s %s\n", $label . ':', $value === null ? 'NULL' : (string)$value);
}

// ── 1. The application and its flat columns ───────────────────────────────────
$app = $db->fetchOne(
    "SELECT id, application_number, first_name, last_name, phone, status,
            payment_amount, payment_currency, transaction_id, paid_at,
            application_fee_due, enrolled_student_id
       FROM `student_applications`
      WHERE application_number = ?
      LIMIT 1",
    [$appNumber]
);

if (!$app) {
    fwrite(STDERR, "Application not found: {$appNumber}\n");
    exit(1);
}

$appId = (int)$app['id'];

echo "\nApplication {$app['application_number']} (id {$appId})\n";
line('Name', trim($app['first_name'] . ' ' . $app['last_name']));
line('Status', $app['status']);
line('payment_amount (flat)', $app['payment_amount']);
line('transaction_id (flat)', $app['transaction_id']);
line('paid_at (flat)', $app['paid_at']);
line('application_fee_due', $app['application_fee_due']);
line('enrolled_student_id', $app['enrolled_student_id']);

// ── 2. Admission bills ────────────────────────────────────────────────────────
$bills = $db->fetchAll(
    "SELECT id, fee_type, label, service_code, amount_due, amount_paid, status
       FROM `application_invoices`
      WHERE application_id = ? AND status <> 'cancelled'
      ORDER BY id ASC",
    [$appId]
);

echo "\nAdmission bills\n";
if (!$bills) {
    echo "  (none — bills have not been generated for this applicant)\n";
}
foreach ($bills as $b) {
    printf(
        "  #%-6d %-14s due %10s  paid %10s  %s\n",
        (int)$b['id'],
        (string)$b['fee_type'],
        number_format((float)$b['amount_due'], 0),
        number_format((float)$b['amount_paid'], 0),
        (string)$b['status']
    );
}

// ── 3. Has this transaction already been booked anywhere? ─────────────────────
$onBill = $db->fetchAll(
    "SELECT id, application_invoice_id, amount, reference_number, source, paid_at
       FROM `application_invoice_payments`
      WHERE reference_number = ? OR reference_number LIKE ?",
    [$txCode, $txCode . '-%']
);

$onLedger = $db->fetchAll(
    "SELECT id, amount, reference_number, source, paid_at
       FROM `application_fee_payments`
      WHERE application_id = ? AND (reference_number = ? OR reference_number LIKE ?)",
    [$appId, $txCode, $txCode . '-%']
);

echo "\nTransaction {$txCode}\n";
line('On admission bills', count($onBill) . ' row(s)');
line('On application-fee ledger', count($onLedger) . ' row(s)');

if ($onBill) {
    echo "\nAlready booked on an admission bill. Nothing to do.\n";
    exit(0);
}

// ── 4. Plan ───────────────────────────────────────────────────────────────────
$openBills = array_filter($bills, static fn (array $b): bool => (float)$b['amount_due'] - (float)$b['amount_paid'] > 0.009);
$openTotal = array_sum(array_map(static fn (array $b): float => (float)$b['amount_due'] - (float)$b['amount_paid'], $openBills));

echo "\nPlan\n";
line('Gateway amount', number_format($amount, 0) . ' RWF');
line('Open balance on bills', number_format($openTotal, 0) . ' RWF');

if (!$openBills) {
    echo "\nNo open admission bill to apply the payment to. Stopping.\n";
    exit(1);
}

if ($amount - $openTotal > 0.009) {
    echo "\nWarning: the amount is larger than the open balance. The surplus will not be booked.\n";
}

if (!$apply) {
    echo "\nDry run. Re-run with --apply to book the payment.\n";
    exit(0);
}

// ── 5. Apply through the same path the webhook uses ───────────────────────────
$result = (new AdmissionBillingService())->applyGatewayPayment(
    $app,
    $txCode,
    $amount,
    (string)($app['payment_currency'] ?: 'RWF'),
    date('Y-m-d H:i:s'),
    $service
);

echo "\nResult: {$result['status']} — {$result['message']}\n";

if ($result['status'] !== 'recorded') {
    exit(1);
}

$after = $db->fetchOne(
    "SELECT COALESCE(SUM(amount_due), 0) AS due, COALESCE(SUM(amount_paid), 0) AS paid
       FROM `application_invoices`
      WHERE application_id = ? AND status <> 'cancelled'",
    [$appId]
);
line('Bills now', number_format((float)$after['paid'], 0) . ' / ' . number_format((float)$after['due'], 0) . ' RWF paid');
echo "If the bills are now fully paid, the registration number was issued by the same call.\n";

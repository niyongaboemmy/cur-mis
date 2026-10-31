<?php
/**
 * Settle admission bills from bordereau (bank deposit) payments that were approved
 * before approval started settling bills, so applicants who paid by bank transfer
 * are no longer refused their registration number.
 *
 * For every application with an approved bordereau submission, the approved amount
 * is applied to its open admission bills (oldest first) through
 * AdmissionBillingService::allocateApprovedBordereaux(). Applications whose bills
 * become fully paid are enrolled automatically, the same as a gateway payment.
 *
 * Usage (dry run is the default, nothing is written):
 *   php scripts/backfill_bordereau_allocations.php
 *   php scripts/backfill_bordereau_allocations.php --apply
 *   php scripts/backfill_bordereau_allocations.php --apply --application=APP-2026-01351
 *
 * Re-running is safe: each submission is booked only for the part not yet on a bill.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/config/database.php';
require_once dirname(__DIR__) . '/core/Database.php';
require_once dirname(__DIR__) . '/vendor/autoload.php';

use App\Services\AdmissionBillingService;
use Core\Database;

$args   = array_slice($argv, 1);
$apply  = in_array('--apply', $args, true);
$only   = '';
foreach ($args as $arg) {
    if (str_starts_with($arg, '--application=')) {
        $only = substr($arg, strlen('--application='));
    }
}

$db = Database::getInstance();

$params = [];
$filter = '';
if ($only !== '') {
    $filter   = ' AND sa.application_number = ?';
    $params[] = $only;
}

$applications = $db->fetchAll(
    "SELECT sa.id, sa.application_number, sa.first_name, sa.last_name,
            COALESCE((SELECT SUM(bs.amount) FROM `bordereau_submissions` bs
                       WHERE bs.application_id = sa.id AND bs.status = 'approved'), 0) AS approved_amount,
            COALESCE((SELECT SUM(ai.amount_due) FROM `application_invoices` ai
                       WHERE ai.application_id = sa.id AND ai.status <> 'cancelled'), 0) AS bills_due,
            COALESCE((SELECT SUM(ai.amount_paid) FROM `application_invoices` ai
                       WHERE ai.application_id = sa.id AND ai.status <> 'cancelled'), 0) AS bills_paid
       FROM `student_applications` sa
      WHERE EXISTS (SELECT 1 FROM `bordereau_submissions` bs
                     WHERE bs.application_id = sa.id AND bs.status = 'approved')
            {$filter}
      ORDER BY sa.id ASC",
    $params
);

echo count($applications) . " application(s) with approved bordereau payments.\n";
echo $apply ? "APPLYING.\n\n" : "DRY RUN. Re-run with --apply to write.\n\n";

$billing = new AdmissionBillingService();
$changed = 0;
$stuck   = 0;

foreach ($applications as $app) {
    $appId   = (int)$app['id'];
    $approved = (float)$app['approved_amount'];
    $owed     = round((float)$app['bills_due'] - (float)$app['bills_paid'], 2);
    $name     = trim($app['first_name'] . ' ' . $app['last_name']);

    printf(
        "%-18s %-28s approved %10s  bills owed %10s\n",
        $app['application_number'],
        $name,
        number_format($approved, 0),
        number_format(max(0, $owed), 0)
    );

    if (!$apply) {
        if ($owed <= 0.009 && $app['bills_due'] > 0) {
            echo "    bills already settled; registration needs checking by hand\n";
            $stuck++;
        } elseif ($owed > 0.009) {
            $changed++;
        }
        continue;
    }

    try {
        $results = $billing->allocateApprovedBordereaux($appId, null);
        foreach ($results as $r) {
            printf(
                "    submission #%d: applied %s, unapplied %s\n",
                $r['submission_id'],
                number_format($r['applied'], 0),
                number_format($r['unapplied'], 0)
            );
        }
        $changed++;
    } catch (\Throwable $e) {
        $stuck++;
        echo "    FAILED: " . $e->getMessage() . "\n";
    }
}

echo "\n" . ($apply ? 'Applications updated' : 'Applications that would be updated') . ": {$changed}\n";
echo "Needing a manual look: {$stuck}\n";

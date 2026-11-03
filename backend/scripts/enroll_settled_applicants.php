<?php
/**
 * Issue registration numbers to every admitted applicant whose admission fees are
 * fully paid but who has not been enrolled yet.
 *
 * Two steps, in order:
 *   1. Approved bordereau (bank deposit) payments are applied to the open bills.
 *   2. Every applicant whose bills are now all settled is enrolled, the same as an
 *      automatic enrollment after a gateway payment. Offers still pending are
 *      accepted on the way, as they are for a gateway payment.
 *
 * Applicants who still owe money are listed and left alone. Pending bordereau
 * deposits are not approved by this script; Finance still verifies those.
 *
 * Usage (dry run is the default, nothing is written):
 *   php scripts/enroll_settled_applicants.php
 *   php scripts/enroll_settled_applicants.php --apply
 *   php scripts/enroll_settled_applicants.php --apply --application=APP-2026-01351
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/vendor/autoload.php';

// Load backend/.env into $_ENV, the same way public/index.php does.
Dotenv\Dotenv::createImmutable(dirname(__DIR__))->load();

require_once dirname(__DIR__) . '/core/Database.php';

use App\Models\ApplicationInvoiceModel;
use App\Services\AdmissionBillingService;
use Core\Database;

$args  = array_slice($argv, 1);
$apply = in_array('--apply', $args, true);
$only  = '';
foreach ($args as $arg) {
    if (str_starts_with($arg, '--application=')) {
        $only = substr($arg, strlen('--application='));
    }
}

$db      = Database::getInstance();
$billing = new AdmissionBillingService();
$bills   = new ApplicationInvoiceModel();

echo $apply ? "APPLYING.\n\n" : "DRY RUN. Re-run with --apply to write.\n\n";

// ── 1. Approved bordereau deposits onto the bills ─────────────────────────────
$filter = $only !== '' ? ' AND sa.application_number = ?' : '';
$params = $only !== '' ? [$only] : [];

$deposits = $db->fetchAll(
    "SELECT DISTINCT sa.id, sa.application_number
       FROM `bordereau_submissions` bs
       JOIN `student_applications` sa ON sa.id = bs.application_id
      WHERE bs.status = 'approved' {$filter}
      ORDER BY sa.id ASC",
    $params
);

echo "Step 1: " . count($deposits) . " application(s) with approved deposits.\n";
if ($apply) {
    foreach ($deposits as $row) {
        try {
            $billing->allocateApprovedBordereaux((int)$row['id'], null);
        } catch (\Throwable $e) {
            echo "  {$row['application_number']}: FAILED to apply deposit: " . $e->getMessage() . "\n";
        }
    }
}
echo "\n";

// ── 2. Enroll every applicant whose bills are settled ─────────────────────────
$candidates = $db->fetchAll(
    "SELECT sa.id, sa.application_number, sa.first_name, sa.last_name,
            ao.id AS offer_id, ao.status AS offer_status
       FROM `admission_offers` ao
       JOIN `student_applications` sa ON sa.id = ao.application_id
      WHERE ao.enrollment_initiated = 0
        AND ao.status IN ('accepted', 'pending')
        AND EXISTS (SELECT 1 FROM `application_invoices` ai
                     WHERE ai.application_id = sa.id AND ai.status <> 'cancelled')
            {$filter}
      ORDER BY sa.id ASC",
    $params
);

echo "Step 2: " . count($candidates) . " admitted applicant(s) not yet enrolled with admission bills.\n";

$enrolled = 0;
$owing    = 0;
$failed   = 0;

foreach ($candidates as $row) {
    $appId   = (int)$row['id'];
    $name    = trim($row['first_name'] . ' ' . $row['last_name']);
    $summary = $bills->summaryFor($appId);
    $label   = sprintf('%-18s %-28s', $row['application_number'], $name);

    if (!$summary['fully_paid']) {
        $owing++;
        printf("  %s owes %s RWF, skipped\n", $label, number_format((float)$summary['balance'], 0));

        $pending = $db->fetchOne(
            "SELECT COUNT(*) AS cnt, COALESCE(SUM(amount), 0) AS total
               FROM `bordereau_submissions`
              WHERE application_id = ? AND status = 'pending'",
            [$appId]
        ) ?: [];
        if ((int)($pending['cnt'] ?? 0) > 0) {
            printf(
                "      %d pending deposit(s) totalling %s RWF await Finance approval\n",
                (int)$pending['cnt'],
                number_format((float)$pending['total'], 0)
            );
        } else {
            echo "      no pending deposit: the balance has not been paid or recorded\n";
        }
        continue;
    }

    if (!$apply) {
        $enrolled++;
        printf("  %s fully paid, would be enrolled\n", $label);
        continue;
    }

    $billing->enrollIfSettled($appId);

    $after = $db->fetchOne(
        "SELECT enrollment_initiated, student_id FROM `admission_offers` WHERE id = ?",
        [(int)$row['offer_id']]
    );

    if ($after && (int)$after['enrollment_initiated'] === 1) {
        $enrolled++;
        printf("  %s enrolled (student id %s)\n", $label, $after['student_id']);
    } else {
        $failed++;
        printf("  %s NOT enrolled, check the notification to admissions\n", $label);
    }
}

echo "\n" . ($apply ? 'Enrolled' : 'Would be enrolled') . ": {$enrolled}\n";
echo "Still owing fees: {$owing}\n";
if ($apply) {
    echo "Failed: {$failed}\n";
}

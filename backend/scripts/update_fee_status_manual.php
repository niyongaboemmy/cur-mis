<?php
/**
 * Manual Fee Status Update Script
 * Updates fee invoice status to "paid" when payment has been confirmed
 *
 * This script is used when:
 * - A student has paid fees (confirmed by payment gateway/Urubuto)
 * - But the invoice status hasn't been automatically updated
 * - Manual update is needed
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/config/database.php';
require_once dirname(__DIR__) . '/core/Database.php';

use Core\Database;

try {
    $db = Database::getInstance();

    echo "\n╔════════════════════════════════════════════════════════════════╗\n";
    echo "║          Manual Fee Invoice Status Update Script               ║\n";
    echo "╚════════════════════════════════════════════════════════════════╝\n\n";

    // Get application ID from command line or stdin
    $appNumber = trim($argv[1] ?? '');
    if (empty($appNumber)) {
        echo "Enter Application Number (e.g., APP-2026-00250): ";
        $appNumber = trim(fgets(STDIN));
    }

    if (empty($appNumber)) {
        echo "❌ Application number required.\n";
        exit(1);
    }

    echo "🔍 Looking up application: $appNumber\n\n";

    // Find the application
    $app = $db->fetchOne(
        "SELECT a.id, a.student_id, a.status, s.regnumber, s.fname, s.lname
         FROM `applications` a
         LEFT JOIN `student` s ON s.student_id = a.student_id
         WHERE a.app_number = ?
         LIMIT 1",
        [$appNumber]
    );

    if (!$app) {
        echo "❌ Application not found: $appNumber\n";
        exit(1);
    }

    $studentId = $app['student_id'];
    $regNumber = $app['regnumber'] ?? 'N/A';
    $fname = $app['fname'] ?? '';
    $lname = $app['lname'] ?? '';
    $fullName = trim("$fname $lname");

    echo "✅ Application found:\n";
    echo "   ID: {$app['id']}\n";
    echo "   Student ID: $studentId\n";
    echo "   Reg Number: $regNumber\n";
    echo "   Name: $fullName\n";
    echo "   Status: {$app['status']}\n\n";

    // Find fee invoices for this student
    echo "🔍 Finding fee invoices...\n\n";

    $invoices = $db->fetchAll(
        "SELECT id, invoice_number, fee_type, amount_due, amount_paid, bursary_applied, status, academic_year_id
         FROM `fee_invoices`
         WHERE student_id COLLATE utf8mb4_unicode_ci = ?
         ORDER BY created_at DESC",
        [$studentId]
    );

    if (empty($invoices)) {
        echo "⚠️  No fee invoices found for this student.\n";
        exit(0);
    }

    echo "Found " . count($invoices) . " invoice(s):\n\n";

    foreach ($invoices as $i => $inv) {
        $remaining = $inv['amount_due'] - $inv['amount_paid'] - $inv['bursary_applied'];
        $status = $inv['status'];

        echo ($i + 1) . ". Invoice #{$inv['invoice_number']}\n";
        echo "   Type: {$inv['fee_type']}\n";
        echo "   Amount Due: " . number_format($inv['amount_due'], 0) . " RWF\n";
        echo "   Amount Paid: " . number_format($inv['amount_paid'], 0) . " RWF\n";
        echo "   Bursary: " . number_format($inv['bursary_applied'], 0) . " RWF\n";
        echo "   Remaining: " . number_format(max(0, $remaining), 0) . " RWF\n";
        echo "   Current Status: " . strtoupper($status) . "\n\n";
    }

    // Ask which invoice to update
    echo "Which invoice would you like to update? (1-" . count($invoices) . "): ";
    $choice = (int)trim(fgets(STDIN));

    if ($choice < 1 || $choice > count($invoices)) {
        echo "❌ Invalid choice.\n";
        exit(1);
    }

    $selected = $invoices[$choice - 1];
    $invoiceId = $selected['id'];

    echo "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";
    echo "Selected Invoice #{$selected['invoice_number']}\n";
    echo "Current Status: " . strtoupper($selected['status']) . "\n\n";

    // Show what will happen
    $remaining = $selected['amount_due'] - $selected['amount_paid'] - $selected['bursary_applied'];

    if ($remaining <= 0) {
        $newStatus = 'paid';
    } elseif ($selected['amount_paid'] > 0 || $selected['bursary_applied'] > 0) {
        $newStatus = 'partial';
    } else {
        $newStatus = 'unpaid';
    }

    echo "✅ New Status: " . strtoupper($newStatus) . "\n";
    echo "   Reason: ";

    if ($remaining <= 0) {
        echo "Amount paid + bursary ≥ amount due (FULLY PAID)\n";
    } elseif ($selected['amount_paid'] > 0 || $selected['bursary_applied'] > 0) {
        echo "Partial payment received\n";
    } else {
        echo "No payments yet\n";
    }

    echo "\n⚠️  Update? (yes/no): ";
    $confirm = strtolower(trim(fgets(STDIN)));

    if ($confirm !== 'yes' && $confirm !== 'y') {
        echo "❌ Cancelled.\n";
        exit(0);
    }

    // Update the invoice
    echo "\n📝 Updating invoice...\n";
    $db->execute(
        "UPDATE `fee_invoices` SET status = ?, updated_at = NOW() WHERE id = ?",
        [$newStatus, $invoiceId]
    );

    echo "✅ Invoice status updated to: " . strtoupper($newStatus) . "\n\n";

    // Verify the update
    $updated = $db->fetchOne(
        "SELECT status FROM `fee_invoices` WHERE id = ? LIMIT 1",
        [$invoiceId]
    );

    if ($updated && $updated['status'] === $newStatus) {
        echo "╔════════════════════════════════════════════════════════════════╗\n";
        echo "║                  ✅ UPDATE SUCCESSFUL ✅                       ║\n";
        echo "╚════════════════════════════════════════════════════════════════╝\n\n";

        echo "Student: $fullName\n";
        echo "Invoice: #{$selected['invoice_number']}\n";
        echo "Status: " . strtoupper($newStatus) . "\n";
        echo "Amount Paid: " . number_format($selected['amount_paid'], 0) . " RWF\n\n";

        if ($newStatus === 'paid') {
            echo "🎉 Student fees are now marked as PAID!\n";
            echo "📧 Consider sending enrollment confirmation email.\n";
        } elseif ($newStatus === 'partial') {
            echo "⚠️  Student has paid partially.\n";
            echo "📊 Remaining balance: " . number_format($remaining, 0) . " RWF\n";
        }
        echo "\n";
    } else {
        echo "❌ Update verification failed!\n";
        exit(1);
    }

} catch (Exception $e) {
    echo "\n❌ Error: " . $e->getMessage() . "\n\n";
    exit(1);
}
?>

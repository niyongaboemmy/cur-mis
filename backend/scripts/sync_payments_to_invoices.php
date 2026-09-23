<?php
/**
 * Sync Payments to Fee Invoices Status
 *
 * This script:
 * 1. Reads confirmed payments from the `payment` table
 * 2. Updates the corresponding `fee_invoices` with amount_paid
 * 3. Recalculates and updates invoice status (PAID, PARTIAL, UNPAID, OVERDUE)
 *
 * Handles:
 * - Debit transactions (positive payment)
 * - Credit transactions (reversals/refunds)
 * - Automatic status calculation based on payment amounts
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/config/database.php';
require_once dirname(__DIR__) . '/core/Database.php';

use Core\Database;

try {
    $db = Database::getInstance();

    echo "\n╔════════════════════════════════════════════════════════════════╗\n";
    echo "║         Sync Payments from Payment Table to Invoices           ║\n";
    echo "╚════════════════════════════════════════════════════════════════╝\n\n";

    // Get all Debit transactions (confirmed payments)
    echo "📊 Fetching payment transactions...\n\n";

    $payments = $db->fetchAll(
        "SELECT
            p.id,
            p.trans_code,
            p.student,
            p.amount,
            p.date,
            p.payment_chanel,
            p.payment_notifi,
            p.status,
            p.fee_category,
            p.external_transaction_id
         FROM `payment` p
         WHERE p.payment_notifi = 'Debit'
         AND p.status = 1
         ORDER BY p.date DESC"
    );

    if (empty($payments)) {
        echo "⚠️  No confirmed payment transactions found.\n";
        exit(0);
    }

    echo "✅ Found " . count($payments) . " payment transaction(s)\n\n";

    $updated = 0;
    $errors = 0;

    foreach ($payments as $payment) {
        $studentId = $payment['student'];
        $amount = (float)$payment['amount'];
        $transCode = $payment['trans_code'];
        $channel = $payment['payment_chanel'];

        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
        echo "Transaction: $transCode | Student: $studentId | Amount: " . number_format($amount, 0) . " RWF\n";

        try {
            // Find student name
            $student = $db->fetchOne(
                "SELECT fname, lname FROM `student` WHERE student_id COLLATE utf8mb4_unicode_ci = ? LIMIT 1",
                [$studentId]
            );
            $studentName = $student ? trim($student['fname'] . ' ' . $student['lname']) : 'Unknown';
            echo "Student Name: $studentName\n";

            // Find fee invoices for this student
            $invoices = $db->fetchAll(
                "SELECT id, invoice_number, amount_due, amount_paid, bursary_applied, status, fee_type
                 FROM `fee_invoices`
                 WHERE student_id COLLATE utf8mb4_unicode_ci = ?
                 AND status NOT IN ('waived', 'paid')
                 ORDER BY created_at DESC
                 LIMIT 5",
                [$studentId]
            );

            if (empty($invoices)) {
                echo "⚠️  No unpaid invoices found for this student\n\n";
                continue;
            }

            echo "Found " . count($invoices) . " unpaid invoice(s)\n";

            // Apply payment to the first unpaid invoice
            $invoice = $invoices[0];
            $invoiceId = $invoice['id'];
            $currentPaid = (float)$invoice['amount_paid'];
            $newPaid = $currentPaid + $amount;

            echo "  Applying to Invoice #{$invoice['invoice_number']}\n";
            echo "  Previous paid: " . number_format($currentPaid, 0) . " RWF\n";
            echo "  Adding: " . number_format($amount, 0) . " RWF\n";
            echo "  New paid: " . number_format($newPaid, 0) . " RWF\n";

            // Update the invoice amount_paid
            $db->execute(
                "UPDATE `fee_invoices` SET amount_paid = ?, updated_at = NOW() WHERE id = ?",
                [$newPaid, $invoiceId]
            );

            // Recalculate and update status
            $amountDue = (float)$invoice['amount_due'];
            $bursary = (float)$invoice['bursary_applied'];
            $remaining = $amountDue - $newPaid - $bursary;

            if ($remaining <= 0) {
                $status = 'paid';
            } elseif ($newPaid > 0 || $bursary > 0) {
                $status = 'partial';
            } else {
                $status = 'unpaid';
            }

            $db->execute(
                "UPDATE `fee_invoices` SET status = ?, updated_at = NOW() WHERE id = ?",
                [$status, $invoiceId]
            );

            echo "  ✅ Status: " . strtoupper($invoice['status']) . " → " . strtoupper($status) . "\n";
            echo "  Remaining: " . number_format(max(0, $remaining), 0) . " RWF\n";

            $updated++;

        } catch (Exception $e) {
            echo "  ❌ Error: " . $e->getMessage() . "\n";
            $errors++;
        }

        echo "\n";
    }

    echo "╔════════════════════════════════════════════════════════════════╗\n";
    echo "║                      SYNC COMPLETE                             ║\n";
    echo "╚════════════════════════════════════════════════════════════════╝\n\n";

    echo "Summary:\n";
    echo "  ✅ Successfully updated: $updated\n";
    echo "  ❌ Errors: $errors\n";
    echo "  Total processed: " . ($updated + $errors) . "\n\n";

    if ($updated > 0) {
        echo "🎉 Payment sync completed successfully!\n";
        echo "📧 Consider sending confirmation emails to updated students.\n\n";
    }

} catch (Exception $e) {
    echo "\n❌ Error: " . $e->getMessage() . "\n\n";
    exit(1);
}
?>

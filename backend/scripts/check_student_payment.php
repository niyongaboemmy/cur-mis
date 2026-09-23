<?php
/**
 * Check Student Payment Status
 *
 * Verifies if a student has confirmed payments in the payment table
 * and shows what would be synced to fee_invoices
 */

declare(strict_types=1);

// Sample data from the payment table (from your SQL dump)
$payments = [
    ['id' => 17, 'trans_code' => 'UP-TBNP9D01', 'student' => '2CUR26AK001096', 'amount' => 15, 'payment_notifi' => 'Debit', 'status' => 1],
    ['id' => 18, 'trans_code' => 'UP-HZZ38DU9', 'student' => '2CUR26AK001096', 'amount' => 5, 'payment_notifi' => 'Debit', 'status' => 1],
    ['id' => 19, 'trans_code' => 'UP-D32YAOST', 'student' => '1CUR25AK011064', 'amount' => 5, 'payment_notifi' => 'Debit', 'status' => 1],
    ['id' => 31, 'trans_code' => 'UP-5WQWY1N2', 'student' => '2CUR26AK000974', 'amount' => 50000, 'payment_notifi' => 'Debit', 'status' => 1],
    ['id' => 33, 'trans_code' => 'UP-3Z97IP2M', 'student' => '1CUR24AK08463', 'amount' => 140000, 'payment_notifi' => 'Debit', 'status' => 1],
    ['id' => 41, 'trans_code' => 'UP-ME6P69ZI', 'student' => '1CUR24AK09125', 'amount' => 33000, 'payment_notifi' => 'Debit', 'status' => 1],
    ['id' => 53, 'trans_code' => 'UP-REBZEFR5', 'student' => '1CUR24AK09009', 'amount' => 131000, 'payment_notifi' => 'Debit', 'status' => 1],
    ['id' => 77, 'trans_code' => 'UP-J8W9AHFB', 'student' => '2CUR26AK000859', 'amount' => 250000, 'payment_notifi' => 'Debit', 'status' => 1],
    ['id' => 79, 'trans_code' => 'UP-M78FBMPA', 'student' => '2CUR26AK000859', 'amount' => 450000, 'payment_notifi' => 'Debit', 'status' => 1],
];

echo "\n╔════════════════════════════════════════════════════════════════╗\n";
echo "║           Student Payment Verification Report                  ║\n";
echo "╚════════════════════════════════════════════════════════════════╝\n\n";

// Get search parameter
$searchStudent = $argv[1] ?? '';

if (empty($searchStudent)) {
    echo "Usage: php check_student_payment.php <STUDENT_ID>\n";
    echo "Example: php check_student_payment.php 2CUR26AK001096\n\n";
    echo "Available students with payments:\n";

    $students = [];
    foreach ($payments as $p) {
        if ($p['payment_notifi'] === 'Debit' && $p['status'] === 1) {
            if (!isset($students[$p['student']])) {
                $students[$p['student']] = 0;
            }
            $students[$p['student']] += $p['amount'];
        }
    }

    foreach ($students as $studentId => $totalAmount) {
        echo "  • $studentId: " . number_format($totalAmount, 0) . " RWF\n";
    }
    echo "\n";
    exit(0);
}

echo "🔍 Searching for student: $searchStudent\n\n";

// Filter payments for this student
$studentPayments = array_filter($payments, function($p) use ($searchStudent) {
    return $p['student'] === $searchStudent && $p['payment_notifi'] === 'Debit' && $p['status'] === 1;
});

if (empty($studentPayments)) {
    echo "❌ NO PAYMENTS FOUND for student: $searchStudent\n";
    echo "⚠️  This student does not have confirmed payment records in the payment table.\n";
    echo "❌ Cannot sync - no matching student found.\n\n";
    exit(0);
}

echo "✅ FOUND " . count($studentPayments) . " PAYMENT RECORD(S) for student: $searchStudent\n\n";

$totalAmount = 0;
echo "Payment Details:\n";
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";

foreach ($studentPayments as $payment) {
    echo sprintf("%-20s | Amount: %s RWF | Status: %s\n",
        $payment['trans_code'],
        number_format($payment['amount'], 0),
        $payment['payment_notifi']
    );
    $totalAmount += $payment['amount'];
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
echo "Total Amount Paid: " . number_format($totalAmount, 0) . " RWF\n\n";

echo "╔════════════════════════════════════════════════════════════════╗\n";
echo "║              ✅ STUDENT FOUND - READY TO SYNC ✅              ║\n";
echo "║                                                                ║\n";
echo "║ When you run the sync script on production:                    ║\n";
echo "║ - These payment records will be matched                        ║\n";
echo "║ - Fee invoice amount_paid will be updated                      ║\n";
echo "║ - Invoice status will change to PAID (if amount covers due)    ║\n";
echo "║ - Registration number will be released                         ║\n";
echo "║ - Enrollment can proceed                                       ║\n";
echo "╚════════════════════════════════════════════════════════════════╝\n\n";

echo "Next Step:\n";
echo "Run on production database:\n";
echo "  php scripts/sync_payments_to_invoices.php\n\n";

?>

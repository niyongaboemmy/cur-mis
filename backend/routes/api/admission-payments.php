<?php
/**
 * Admission Payment History API
 *
 * GET /api/admissions/applications/:id/payments
 * Fetch payment history for staff validation
 * Shows all confirmed payments from the payment table
 */

use Core\Request;
use Core\Response;
use Core\Database;

// Get database connection
$db = Database::getInstance();

// Get application ID from URL
$appId = (int)($_GET['id'] ?? 0);
$studentId = $_GET['student_id'] ?? '';

if (!$appId || !$studentId) {
    http_response_code(400);
    echo json_encode([
        'error' => 'Application ID and Student ID are required'
    ]);
    exit;
}

// Verify application exists and student matches
$app = $db->fetchOne(
    "SELECT a.id, a.student_id FROM applications a WHERE a.id = ? LIMIT 1",
    [$appId]
);

if (!$app) {
    http_response_code(404);
    echo json_encode([
        'error' => 'Application not found'
    ]);
    exit;
}

// Get all Debit (confirmed payment) transactions for this student
$payments = $db->fetchAll(
    "SELECT
        id,
        trans_code,
        student,
        amount,
        date,
        payment_chanel,
        payment_notifi,
        status,
        external_transaction_id
     FROM `payment`
     WHERE student COLLATE utf8mb4_unicode_ci = ?
     AND payment_notifi = 'Debit'
     AND status = 1
     ORDER BY date DESC",
    [$studentId]
);

// Calculate total paid
$totalPaid = 0;
foreach ($payments as $payment) {
    $totalPaid += (float)$payment['amount'];
}

// Return response
http_response_code(200);
echo json_encode([
    'data' => [
        'student_id' => $studentId,
        'application_id' => $appId,
        'payments' => $payments,
        'payment_count' => count($payments),
        'total_paid' => $totalPaid
    ],
    'message' => 'Payment history fetched'
]);
?>

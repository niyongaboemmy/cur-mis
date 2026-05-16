<?php
/**
 * POST /api/cancel_transaction.php
 * Reverses a payment AND rolls back fee_invoices amount_paid.
 */
require_once __DIR__ . '/Rest.php';
require_once __DIR__ . '/payment_reconciler.php';

$input = json_decode(file_get_contents('php://input'), true) ?? [];

ob_start();
(new Rest())->delete_transaction($input);
$responseJson = ob_get_clean();
echo $responseJson;

$response = json_decode($responseJson, true);
if (isset($response['status']) && $response['status'] === 200) {
    try {
        $conn  = new mysqli('localhost', 'curac_save', 'curac_save', 'curac_save');
        $conn->set_charset('utf8mb4');

        // Find the original Debit trans_code by external_transaction_id
        $extId = trim($input['transaction_id'] ?? '');
        $stmt  = $conn->prepare(
            "SELECT trans_code FROM payment
             WHERE external_transaction_id = ? AND payment_notifi = 'Debit'
             ORDER BY recorded_date DESC LIMIT 1"
        );
        $stmt->bind_param('s', $extId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if ($row) {
            $reconciler = new PaymentReconciler($conn);
            $reconciler->reverse($row['trans_code'], (float)($input['amount'] ?? 0));
            error_log('[Reconciler REVERSE] orig_trans=' . $row['trans_code']);
        }
        $conn->close();
    } catch (\Throwable $e) {
        error_log('[Reconciler REVERSE ERROR] ' . $e->getMessage());
    }
}
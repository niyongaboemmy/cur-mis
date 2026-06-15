<?php
/**
 * POST /api/payment.php
 * Records a bank/mobile payment AND auto-updates fee_invoices.
 *
 * Flow:
 *  1. insertPayment() saves to payment table, returns JSON with internal trans_code
 *  2. PaymentReconciler::reconcile() finds/creates fee_invoice and updates amount_paid
 */
require_once __DIR__ . '/Rest.php';
require_once __DIR__ . '/payment_reconciler.php';

$input = json_decode(file_get_contents('php://input'), true) ?? [];

// Buffer the REST response so we can read trans_code before sending
ob_start();
(new Rest())->insertPayment($input);
$responseJson = ob_get_clean();

// Send response to client immediately
echo $responseJson;

// Now reconcile in the background (after client gets their response)
$response = json_decode($responseJson, true);

if (
    isset($response['status']) && $response['status'] === 200 &&
    !empty($response['data']['internal_transaction_id'])
) {
    try {
        $creds = getDbCredentials();
        $conn  = new mysqli($creds['host'], $creds['user'], $creds['pass'], $creds['db'], $creds['port']);
        $conn->set_charset('utf8mb4');

        $reconciler = new PaymentReconciler($conn);
        $affected   = $reconciler->reconcile($response['data']['internal_transaction_id']);

        // Log result for debugging
        error_log('[Reconciler] trans=' . $response['data']['internal_transaction_id']
            . ' invoices_updated=' . implode(',', $affected));

        $conn->close();
    } catch (\Throwable $e) {
        error_log('[Reconciler ERROR] ' . $e->getMessage());
    }
}
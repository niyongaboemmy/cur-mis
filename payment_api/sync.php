<?php
/**
 * POST /api/sync.php
 * Manual full re-sync: re-applies ALL bank payments to fee_invoices from scratch.
 * Use this once to backfill historical payments.
 * Requires bearer token.
 */
require_once __DIR__ . '/Rest.php';          // runs token guard
require_once __DIR__ . '/payment_reconciler.php';

$conn = new mysqli('localhost', 'curac_save', 'curac_save', 'curac_save');
$conn->set_charset('utf8mb4');

$reconciler = new PaymentReconciler($conn);
$report     = $reconciler->fullSync();
$conn->close();

http_response_code(200);
echo json_encode([
    'timestamp'          => date('Y-m-d H:i:s'),
    'message'            => 'Sync complete',
    'status'             => 200,
    'payments_processed' => $report['processed'],
    'invoices_updated'   => $report['invoices_updated'],
    'errors'             => $report['errors'],
], JSON_PRETTY_PRINT);
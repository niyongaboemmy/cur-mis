<?php
/**
 * POST /api/cancel_transaction.php
 * Reverse / cancel an existing bank payment.
 *
 * Headers: Authorization: Bearer <token>
 * Body   : {
 *   "transaction_id"          : "TXN20260508001",
 *   "external_transaction_id" : "DG-A1B2C3D4",
 *   "amount"                  : 150000,
 *   "merchant_code"           : "TH97990720_1"
 * }
 */
require_once __DIR__ . '/Rest.php';

$input = json_decode(file_get_contents('php://input'), true) ?? [];
(new Rest())->delete_transaction($input);

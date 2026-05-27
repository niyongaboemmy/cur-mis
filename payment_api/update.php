<?php
/**
 * POST /api/update.php
 * Update slip number and/or confirmation status of an existing payment.
 *
 * Headers: Authorization: Bearer <token>
 * Body   : {
 *   "transaction_id" : "TXN20260508001",
 *   "slip_number"    : "SLP-FINAL-001",
 *   "status"         : 1
 * }
 */
require_once __DIR__ . '/Rest.php';

$input = json_decode(file_get_contents('php://input'), true) ?? [];
(new Rest())->update_new($input);

<?php
/**
 * POST /api/payment.php
 * Record a bank payment for an active student.
 *
 * Headers: Authorization: Bearer <token>
 * Body   : {
 *   "payer_code"           : "1CUR18AK05399",
 *   "transaction_id"       : "TXN20260508001",
 *   "payment_channel"      : "BK",
 *   "bank_account"         : "000123456789",
 *   "initial_slip_number"  : "SLP001",
 *   "slip_number"          : "SLP001",
 *   "amount"               : 150000,
 *   "term"                 : "1",
 *   "academic_year"        : "2025-2026",
 *   "payment_date_time"    : "2026-05-08 10:00:00",
 *   "payment_purpose_code" : "147",
 *   "merchant_code"        : "TH97990720_1"
 * }
 */
require_once __DIR__ . '/Rest.php';

$input = json_decode(file_get_contents('php://input'), true) ?? [];
(new Rest())->insertPayment($input);

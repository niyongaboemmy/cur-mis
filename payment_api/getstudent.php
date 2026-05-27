<?php
/**
 * POST /api/getstudent.php
 * Verify a payer (student) before accepting a bank payment.
 *
 * Headers: Authorization: Bearer <token>
 * Body   : { "payer_code": "1CUR18AK05399", "merchant_code": "TH97990720_1" }
 */
require_once __DIR__ . '/Rest.php';

$input = json_decode(file_get_contents('php://input'), true) ?? [];
(new Rest())->getStudent($input);

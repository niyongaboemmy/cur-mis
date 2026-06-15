<?php
/**
 * POST /payment_api/getstudent.php  (legacy alias — kept for backward compat)
 * Canonical endpoint is now: POST /payment_api/payer/verify  (doc §3.2)
 *
 * Headers: Authorization: Bearer <token>
 * Body   : { "payer_code": "2CUR26AK001096", "merchant_code": "TH90989816" }
 */
require_once __DIR__ . '/Rest.php';

$input = json_decode(file_get_contents('php://input'), true) ?? [];
(new Rest())->getStudent($input);

<?php
/**
 * callback_debug.php — UrubutoPay callback inspector
 *
 * PURPOSE: Register this URL temporarily with UrubutoPay instead of
 * callback.php. It logs every detail of the incoming request (headers,
 * body, IP, method) to a rotating log file so you can see exactly what
 * UrubutoPay sends, without running any payment logic.
 *
 * HOW TO USE:
 *   1. In the UrubutoPay merchant portal, set the Payment Notification URL to:
 *      https://cur.ac.rw/payment_api/callback_debug.php
 *   2. Trigger a real or test payment.
 *   3. Read the log: cat /tmp/urubutopay_callback_debug.log
 *      (or tail -f /tmp/urubutopay_callback_debug.log)
 *   4. Switch the URL back to callback.php once done.
 *
 * SECURITY: No auth required on purpose — the point is to capture even
 * malformed/unauthenticated requests. Do NOT leave registered in production
 * for longer than needed for debugging.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ── Collect everything ────────────────────────────────────────────────────────

$timestamp  = date('Y-m-d H:i:s');
$method     = $_SERVER['REQUEST_METHOD'] ?? 'UNKNOWN';
$remoteIp   = $_SERVER['HTTP_X_FORWARDED_FOR']
           ?? $_SERVER['HTTP_X_REAL_IP']
           ?? $_SERVER['REMOTE_ADDR']
           ?? 'unknown';
$requestUri = $_SERVER['REQUEST_URI'] ?? '';

// All HTTP headers
$allHeaders = [];
foreach ($_SERVER as $k => $v) {
    if (str_starts_with($k, 'HTTP_')) {
        $name = ucwords(strtolower(str_replace('_', '-', substr($k, 5))), '-');
        $allHeaders[$name] = $v;
    }
}
if (!empty($_SERVER['CONTENT_TYPE'])) {
    $allHeaders['Content-Type'] = $_SERVER['CONTENT_TYPE'];
}

// Raw body
$rawBody = file_get_contents('php://input');

// Try to decode as JSON
$jsonBody = json_decode($rawBody, true);
$jsonErr  = json_last_error() !== JSON_ERROR_NONE ? json_last_error_msg() : null;

// ── Write to log file ─────────────────────────────────────────────────────────

$logFile = sys_get_temp_dir() . '/urubutopay_callback_debug.log';

$separator = str_repeat('=', 80);
$entry = <<<LOG
{$separator}
URUBUTOPAY CALLBACK RECEIVED — {$timestamp}
{$separator}
METHOD    : {$method}
REMOTE IP : {$remoteIp}
URI       : {$requestUri}

--- HEADERS ---
LOG;

foreach ($allHeaders as $name => $value) {
    $entry .= sprintf("%-30s: %s\n", $name, $value);
}

$entry .= "\n--- RAW BODY ---\n";
$entry .= ($rawBody !== '' ? $rawBody : '(empty)') . "\n";

if ($jsonBody !== null) {
    $entry .= "\n--- PARSED JSON ---\n";
    $entry .= json_encode($jsonBody, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE) . "\n";
    $entry .= "\n--- KEY CALLBACK FIELDS ---\n";
    $fields = [
        'callback_type'      => $jsonBody['callback_type']      ?? '(missing)',
        'transaction_code'   => $jsonBody['transaction_code']   ?? $jsonBody['transaction_id'] ?? '(missing)',
        'payer_code'         => $jsonBody['payer_code']         ?? '(missing)',
        'amount'             => $jsonBody['amount']             ?? '(missing)',
        'currency'           => $jsonBody['currency']           ?? '(missing)',
        'status'             => $jsonBody['status']             ?? '(missing)',
        'transaction_status' => $jsonBody['transaction_status'] ?? '(missing — check status field above)',
        'service_code'       => $jsonBody['service_code']       ?? $jsonBody['payment_purpose_code'] ?? '(missing)',
        'payment_date'       => $jsonBody['payment_date']       ?? $jsonBody['payment_date_time'] ?? '(missing)',
    ];
    foreach ($fields as $key => $val) {
        $entry .= sprintf("  %-22s = %s\n", $key, is_string($val) ? $val : json_encode($val));
    }
} elseif ($rawBody !== '') {
    $entry .= "\n--- JSON PARSE ERROR ---\n";
    $entry .= "Could not parse body as JSON: {$jsonErr}\n";
    $entry .= "Try checking Content-Type and encoding.\n";
}

$entry .= "\n";

file_put_contents($logFile, $entry, FILE_APPEND | LOCK_EX);

// ── Log location also into PHP error log ─────────────────────────────────────
error_log('[UrubutoPay Debug] Callback captured at ' . $timestamp . ' from ' . $remoteIp . ' — see ' . $logFile);

// ── Respond 200 so UrubutoPay does not retry ─────────────────────────────────
http_response_code(200);
echo json_encode([
    'timestamp' => $timestamp,
    'status'    => 200,
    'message'   => 'Callback logged for inspection',
    'logged_to' => $logFile,
]);

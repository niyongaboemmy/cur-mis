<?php
/**
 * callback_test.php — UrubutoPay callback flow tester
 *
 * Runs a simulated UrubutoPay PAYMENT callback through every validation
 * step and returns a structured trace showing exactly where it passes or fails.
 * No auth required so you can run it from Postman, curl, or a browser.
 *
 * It does NOT require a Bearer token and does NOT write to the database
 * unless you pass ?dry_run=0.
 *
 * HOW TO USE:
 *
 *   Dry-run (safe, read-only, no DB writes):
 *     POST http://localhost:8888/cur-mis/payment_api/callback_test.php
 *     Body: same JSON UrubutoPay would send
 *
 *   Actually insert (writes payment row + reconciles):
 *     POST .../callback_test.php?dry_run=0
 *     Body: { ... }
 *
 * EXAMPLE BODY (copy/paste into Postman):
 *   {
 *     "callback_type":    "PAYMENT",
 *     "transaction_code": "TEST-DEBUG-001",
 *     "payer_code":       "CUR/BBA/001/2022",
 *     "amount":           100000,
 *     "currency":         "RWF",
 *     "payment_date":     "2026-06-16T10:00:00Z",
 *     "service_code":     "tuition-fees-1258",
 *     "status":           "SUCCESSFUL"
 *   }
 */

ini_set('display_errors', 0);
ini_set('log_errors',     1);
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS, GET');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$timestamp = date('Y-m-d H:i:s');
$dryRun    = ($_GET['dry_run'] ?? '1') !== '0';  // default: dry run
$trace     = [];  // step-by-step trace collector

// ── Helper ────────────────────────────────────────────────────────────────────
function step(string $name, bool $pass, string $detail, array &$trace): void {
    $trace[] = [
        'step'   => $name,
        'result' => $pass ? 'PASS' : 'FAIL',
        'detail' => $detail,
    ];
}

// ── Parse input ───────────────────────────────────────────────────────────────
$rawBody = file_get_contents('php://input');
$body    = json_decode($rawBody ?: '{}', true);

if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode([
        'timestamp' => $timestamp,
        'status'    => 400,
        'error'     => 'Could not parse request body as JSON: ' . json_last_error_msg(),
        'raw_body'  => $rawBody,
    ]);
    exit;
}

// ── Echo back what was received ───────────────────────────────────────────────
$received = [
    'callback_type'    => $body['callback_type']    ?? null,
    'transaction_code' => $body['transaction_code'] ?? $body['transaction_id'] ?? null,
    'payer_code'       => $body['payer_code']        ?? null,
    'amount'           => isset($body['amount']) ? (float)$body['amount'] : null,
    'currency'         => $body['currency']          ?? null,
    'status'           => $body['status']            ?? null,
    'transaction_status' => $body['transaction_status'] ?? '(not present — UrubutoPay uses "status")',
    'service_code'     => $body['service_code']      ?? $body['payment_purpose_code'] ?? null,
    'payment_date'     => $body['payment_date']      ?? $body['payment_date_time']    ?? null,
];

// ── DB connection (read-only checks) ─────────────────────────────────────────
function getDbCreds(): array {
    $path = __DIR__ . '/../backend/.env';
    $env  = ['host' => 'localhost', 'port' => 3306, 'user' => 'curac_save', 'pass' => 'curac_save', 'db' => 'curac_save'];
    if (file_exists($path)) {
        foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $line = trim($line);
            if (str_starts_with($line, '#')) continue;
            $parts = explode('=', $line, 2);
            if (count($parts) === 2) {
                [$k, $v] = $parts;
                $v = trim($v, '"\'');
                match(trim($k)) {
                    'DB_HOST'     => $env['host'] = $v,
                    'DB_PORT'     => $env['port'] = (int)$v,
                    'DB_USERNAME' => $env['user'] = $v,
                    'DB_PASSWORD' => $env['pass'] = $v,
                    'DB_DATABASE' => $env['db']   = $v,
                    default       => null,
                };
            }
        }
    }
    return $env;
}

$db   = null;
$dbOk = false;
try {
    $creds = getDbCreds();
    $db    = new mysqli($creds['host'], $creds['user'], $creds['pass'], $creds['db'], $creds['port']);
    if ($db->connect_error) {
        step('DB_CONNECT', false, 'Connection failed: ' . $db->connect_error, $trace);
    } else {
        $db->set_charset('utf8mb4');
        $dbOk = true;
        step('DB_CONNECT', true, 'Connected to ' . $creds['db'] . '@' . $creds['host'], $trace);
    }
} catch (\Throwable $e) {
    step('DB_CONNECT', false, $e->getMessage(), $trace);
}

// ── Step 1: callback_type ─────────────────────────────────────────────────────
$callbackType = strtoupper(trim((string)($body['callback_type'] ?? '')));
step(
    'CALLBACK_TYPE',
    $callbackType === 'PAYMENT',
    $callbackType === 'PAYMENT'
        ? 'callback_type = "PAYMENT" — will trigger ledger write'
        : 'callback_type = "' . $callbackType . '" — NOT "PAYMENT"; ledger write skipped',
    $trace
);

// ── Step 2: status field ──────────────────────────────────────────────────────
$statusFromStatus = strtoupper(trim((string)($body['status'] ?? '')));
$statusFromTxStat = strtoupper(trim((string)($body['transaction_status'] ?? '')));
$effectiveStatus  = $statusFromStatus ?: $statusFromTxStat;
$validStatuses    = ['SUCCESSFUL', 'VALID', 'PENDING_SETTLEMENT'];
$statusOk         = in_array($effectiveStatus, $validStatuses, true);
step(
    'STATUS_CHECK',
    $statusOk,
    sprintf(
        '"status" field = "%s", "transaction_status" field = "%s"; effective = "%s"; accepted values = [%s] → %s',
        $statusFromStatus ?: '(missing)',
        $statusFromTxStat ?: '(missing)',
        $effectiveStatus  ?: '(empty)',
        implode(', ', $validStatuses),
        $statusOk ? 'PASS' : 'FAIL — this was previously hardcoded to only accept VALID/PENDING_SETTLEMENT (now fixed)'
    ),
    $trace
);

// ── Step 3: required fields ───────────────────────────────────────────────────
$txCode    = trim((string)($body['transaction_code'] ?? $body['transaction_id'] ?? ''));
$payerCode = trim((string)($body['payer_code'] ?? ''));
$amount    = (float)($body['amount'] ?? 0);
$fieldsOk  = $txCode !== '' && $payerCode !== '' && $amount > 0;
step(
    'REQUIRED_FIELDS',
    $fieldsOk,
    sprintf(
        'transaction_code="%s" payer_code="%s" amount=%s → %s',
        $txCode    ?: '(missing)',
        $payerCode ?: '(missing)',
        $amount > 0 ? $amount : '0 or missing',
        $fieldsOk ? 'all present' : 'MISSING required fields'
    ),
    $trace
);

// ── Step 4: Bearer token in api_authorization ─────────────────────────────────
$authHeader    = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
$tokenProvided = '';
if (str_starts_with(strtolower($authHeader), 'bearer ')) {
    $tokenProvided = substr($authHeader, 7);
}
$tokenRow = null;
if ($dbOk && $tokenProvided !== '') {
    $st = $db->prepare('SELECT id, username, token_expires_at FROM api_authorization WHERE token = ? LIMIT 1');
    $st->bind_param('s', $tokenProvided);
    $st->execute();
    $tokenRow = $st->get_result()->fetch_assoc();
    $st->close();
}
if ($tokenProvided === '') {
    step('BEARER_TOKEN', false, 'No Authorization header sent (in production callback.php would return 401)', $trace);
} elseif (!$tokenRow) {
    step('BEARER_TOKEN', false, 'Token not found in api_authorization (or expired) → 401 in production', $trace);
} else {
    $exp = $tokenRow['token_expires_at'] ?? 'NULL';
    $expired = $exp && $exp !== 'NULL' && strtotime($exp) < time();
    step(
        'BEARER_TOKEN',
        !$expired,
        sprintf('Token matched row id=%s user=%s expires_at=%s → %s',
            $tokenRow['id'], $tokenRow['username'], $exp,
            $expired ? 'EXPIRED — would return 401' : 'valid'
        ),
        $trace
    );
}

// ── Step 5: Student lookup ────────────────────────────────────────────────────
$studentRow = null;
if ($dbOk && $payerCode !== '') {
    $clean = ltrim($payerCode, '0');
    foreach (array_unique([$clean, $payerCode]) as $code) {
        $st = $db->prepare(
            "SELECT regnumber, fname, lname, acc_year, current_level,
                    COALESCE(phone, telephone, '') AS phone, student_state
             FROM student WHERE regnumber = ? LIMIT 1"
        );
        $st->bind_param('s', $code);
        $st->execute();
        $studentRow = $st->get_result()->fetch_assoc();
        $st->close();
        if ($studentRow) break;
    }
}
if (!$dbOk) {
    step('STUDENT_LOOKUP', false, 'Skipped — no DB connection', $trace);
} elseif (!$studentRow) {
    step('STUDENT_LOOKUP', false, 'No student found for payer_code="' . $payerCode . '" → 404 in production', $trace);
} else {
    $name  = strtoupper(trim(($studentRow['fname'] ?? '') . ' ' . ($studentRow['lname'] ?? '')));
    $state = $studentRow['student_state'] ?? '?';
    step('STUDENT_LOOKUP', true, sprintf('Found: %s (reg=%s, state=%s, year=%s, level=%s)',
        $name, $studentRow['regnumber'], $state,
        $studentRow['acc_year'] ?? '?', $studentRow['current_level'] ?? '?'
    ), $trace);
}

// ── Step 6: Idempotency check ─────────────────────────────────────────────────
$alreadyRecorded = false;
$idempotencyNote = '(skipped — no DB or empty tx_code)';
if ($dbOk && $txCode !== '') {
    $st = $db->prepare('SELECT trans_code FROM payment WHERE external_transaction_id = ? LIMIT 1');
    $st->bind_param('s', $txCode);
    $st->execute();
    $dup = $st->get_result()->fetch_assoc();
    $st->close();
    if ($dup) {
        $alreadyRecorded = true;
        $idempotencyNote = 'DUPLICATE — already recorded with internal trans_code=' . $dup['trans_code'];
    } else {
        $idempotencyNote = 'OK — transaction_code "' . $txCode . '" not yet in payment table';
    }
}
step('IDEMPOTENCY', !$alreadyRecorded, $idempotencyNote, $trace);

// ── Step 7: Outstanding invoices ──────────────────────────────────────────────
$invoiceInfo = '(skipped)';
if ($dbOk && $studentRow) {
    $regNum = $studentRow['regnumber'];
    $st = $db->prepare(
        "SELECT COUNT(*) AS cnt,
                COALESCE(SUM(amount_due - amount_paid - IFNULL(bursary_applied,0)), 0) AS total_outstanding
         FROM fee_invoices
         WHERE student_id = ? AND status NOT IN ('paid','waived','cancelled')"
    );
    $st->bind_param('s', $regNum);
    $st->execute();
    $inv = $st->get_result()->fetch_assoc();
    $st->close();
    $cnt = (int)($inv['cnt'] ?? 0);
    $outstanding = (float)($inv['total_outstanding'] ?? 0);
    $invoiceInfo = $cnt === 0
        ? 'No open invoices — an AUTO-TUITION invoice will be created on real callback'
        : sprintf('%d open invoice(s), total outstanding = %s RWF (payment amount = %s RWF)',
            $cnt, number_format($outstanding), number_format($amount));
    step('INVOICES', true, $invoiceInfo, $trace);
} else {
    step('INVOICES', false, $invoiceInfo, $trace);
}

// ── Step 8: Dry-run summary / actual insert ───────────────────────────────────
$overallPass = !in_array('FAIL', array_column($trace, 'result'))
    || ($callbackType === 'PAYMENT' && $statusOk && $fieldsOk && $studentRow && !$alreadyRecorded);

$insertResult = null;
if (!$dryRun && $overallPass && $dbOk && $callbackType === 'PAYMENT' && $statusOk && $fieldsOk && $studentRow && !$alreadyRecorded) {
    // Forward to the real handler
    define('SKIP_TOKEN_CHECK', true);
    require_once __DIR__ . '/Rest.php';
    ob_start();
    (new Rest())->claimCallback($body);
    $rawOut = ob_get_clean();
    $insertResult = json_decode($rawOut, true) ?? ['raw' => $rawOut];
    step('DB_INSERT', ($insertResult['status'] ?? 0) === 200, 'Real callback executed — see insert_result below', $trace);
} elseif (!$dryRun) {
    step('DB_INSERT', false, 'Insert skipped — one or more earlier steps failed', $trace);
} else {
    step('DB_INSERT', true, 'DRY RUN — no database writes. Add ?dry_run=0 to execute for real.', $trace);
}

// ── Final verdict ─────────────────────────────────────────────────────────────
$failures     = array_filter($trace, fn($s) => $s['result'] === 'FAIL');
$finalVerdict = empty($failures) ? 'ALL_PASS' : 'HAS_FAILURES';

http_response_code(200);
echo json_encode([
    'timestamp'    => $timestamp,
    'mode'         => $dryRun ? 'DRY_RUN' : 'LIVE_INSERT',
    'verdict'      => $finalVerdict,
    'received'     => $received,
    'trace'        => $trace,
    'insert_result' => $insertResult,
    'hints'        => [
        'To run for real'        => 'Add ?dry_run=0 to the URL',
        'Debug log file'         => 'Register callback_debug.php with UrubutoPay to capture the raw request',
        'Read the debug log'     => 'cat /tmp/urubutopay_callback_debug.log',
        'Check PHP error log'    => '/Applications/MAMP/logs/php_error.log (or /tmp/php_errors.log)',
    ],
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

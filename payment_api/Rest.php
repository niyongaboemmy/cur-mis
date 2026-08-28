<?php
/**
 * CUR Payment API – Refactored Rest Class
 * Database : curac_save
 * Tables   : student, payment, api_authorization
 *
 * Endpoints (each has its own thin entry-point file that includes this):
 *   POST /api/token.php            → Rest::claimtoken()
 *   POST /api/getstudent.php       → Rest::getStudent()
 *   POST /api/payment.php          → Rest::insertPayment()
 *   POST /api/cancel_transaction.php → Rest::delete_transaction()
 *   POST /api/update.php           → Rest::update_new()
 */

// ── Suppress output; errors go to server log only ────────────────────────────
ini_set('display_errors', 0);
ini_set('log_errors',     1);
error_reporting(E_ALL);
ob_start();
ob_end_clean();

// ── CORS – allow requests from any origin (browser test clients, Postman, etc.)
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Preflight OPTIONS request – return immediately
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header('Content-Type: application/json; charset=utf-8');

// ─────────────────────────────────────────────────────────────────────────────
// Gateway wire log
//
// Nothing recorded what UrubutoPay actually sent us, which is why the question
// "did the gateway reverse this on its own, or did we ask it to?" could not be
// answered from our side. Every request that reaches this API — and the exact
// response we gave it, with how long we took — is now appended to one file.
//
// Enabled by URUBUTOPAY_DEBUG_LOG=true in backend/.env (the flag already
// existed there but was never read by anything). The Authorization header is
// redacted; nothing else is, because the whole point is to see the raw payload.
// ─────────────────────────────────────────────────────────────────────────────
if (!function_exists('urubutoWireLogPath')) {
    function urubutoWireLogPath(): ?string
    {
        static $path = false;
        if ($path !== false) {
            return $path;
        }

        // Only real gateway traffic is worth recording — a CLI include (tests,
        // scripts) has no request to log.
        if (PHP_SAPI === 'cli') {
            return $path = null;
        }

        $enabled = false;
        $envFile = __DIR__ . '/../backend/.env';
        if (is_file($envFile)) {
            foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                $line = trim($line);
                if ($line === '' || $line[0] === '#') continue;
                $parts = explode('=', $line, 2);
                if (count($parts) === 2 && trim($parts[0]) === 'URUBUTOPAY_DEBUG_LOG') {
                    $enabled = in_array(strtolower(trim($parts[1], "\"' ")), ['1', 'true', 'yes', 'on'], true);
                }
            }
        }
        if (!$enabled) {
            return $path = null;
        }

        // `backend/logs` first: it sits outside this API's directory, so the
        // file is not reachable over HTTP even if a rule is missed. Falls back
        // to a local `logs/` dir, which is created WITH a deny rule — the
        // payloads hold payer names and phone numbers and must never be
        // fetchable at /payment_api/logs/urubuto_gateway.log. (The repo's
        // .gitignore excludes `logs`, so the rule cannot be shipped as a
        // committed file; it is written here instead.)
        $dir = __DIR__ . '/../backend/logs';
        if (!is_dir($dir) || !is_writable($dir)) {
            $dir = __DIR__ . '/logs';
            if (!is_dir($dir)) {
                @mkdir($dir, 0775, true);
            }
            $deny = $dir . '/.htaccess';
            if (is_dir($dir) && !is_file($deny)) {
                @file_put_contents(
                    $deny,
                    "<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n"
                    . "<IfModule !mod_authz_core.c>\n    Order allow,deny\n    Deny from all\n</IfModule>\n"
                );
            }
        }
        if (!is_dir($dir) || !is_writable($dir)) {
            $dir = sys_get_temp_dir();
        }

        return $path = $dir . '/urubuto_gateway.log';
    }
}

if (!function_exists('urubutoWireLog')) {
    /** Append one entry, rotating at 5 MB so the file cannot fill the account. */
    function urubutoWireLog(string $entry): void
    {
        $file = urubutoWireLogPath();
        if ($file === null) {
            return;
        }
        if (is_file($file) && filesize($file) > 5 * 1024 * 1024) {
            @rename($file, $file . '.1');
        }
        @file_put_contents($file, $entry, FILE_APPEND | LOCK_EX);
    }
}

if (urubutoWireLogPath() !== null) {
    $GLOBALS['__urubuto_started'] = microtime(true);
    $GLOBALS['__urubuto_request'] = file_get_contents('php://input');

    $__headers = [];
    foreach ($_SERVER as $__k => $__v) {
        if (str_starts_with($__k, 'HTTP_')) {
            $__name = ucwords(strtolower(str_replace('_', '-', substr($__k, 5))), '-');
            $__headers[$__name] = (stripos($__name, 'authorization') !== false) ? '«redacted»' : $__v;
        }
    }
    $GLOBALS['__urubuto_headers'] = $__headers;

    // Capture whatever the endpoint echoes so the log holds the exact bytes the
    // gateway received. ackAndFinish() below stashes its own copy first, since
    // it flushes the buffer before this shutdown handler runs.
    ob_start();
    register_shutdown_function(static function (): void {
        $body = $GLOBALS['__urubuto_response'] ?? null;
        if ($body === null) {
            $body = ob_get_contents();
            if ($body === false) {
                $body = '';
            }
        }
        $ms = (int)round((microtime(true) - ($GLOBALS['__urubuto_started'] ?? microtime(true))) * 1000);

        urubutoWireLog(sprintf(
            "%s\n[%s] %s %s from %s — HTTP %d in %d ms\nheaders: %s\nrequest : %s\nresponse: %s\n",
            str_repeat('=', 78),
            date('Y-m-d H:i:s'),
            $_SERVER['REQUEST_METHOD'] ?? '?',
            $_SERVER['REQUEST_URI']    ?? '?',
            $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '?',
            http_response_code() ?: 0,
            $ms,
            json_encode($GLOBALS['__urubuto_headers'] ?? []),
            $GLOBALS['__urubuto_request'] ?: '(empty)',
            $body !== '' ? $body : '(empty)'
        ));
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Bearer-token guard (skip for the token-claim endpoint itself)
// ─────────────────────────────────────────────────────────────────────────────
if (!function_exists('getDbCredentials')) {
    function getDbCredentials() {
        $path = __DIR__ . '/../backend/.env';
        $env = ['host' => 'localhost', 'port' => 3306, 'user' => 'curac_save', 'pass' => 'curac_save', 'db' => 'curac_save'];
        if (file_exists($path)) {
            $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            foreach ($lines as $line) {
                $line = trim($line);
                if (str_starts_with($line, '#')) continue;
                $parts = explode('=', $line, 2);
                if (count($parts) === 2) {
                    $k = trim($parts[0]);
                    $v = trim($parts[1], '"\'');
                    if ($k === 'DB_HOST') $env['host'] = $v;
                    if ($k === 'DB_PORT') $env['port'] = (int)$v;
                    if ($k === 'DB_USERNAME') $env['user'] = $v;
                    if ($k === 'DB_PASSWORD') $env['pass'] = $v;
                    if ($k === 'DB_DATABASE') $env['db'] = $v;
                }
            }
        }
        return $env;
    }
}

if (!defined('SKIP_TOKEN_CHECK')) {

    /**
     * Pull the Authorization header regardless of SAPI / server config.
     */
    function getAuthorizationHeader(): ?string
    {
        // REDIRECT_HTTP_AUTHORIZATION is where Apache/mod_rewrite delivers the
        // header on this server config — check it alongside the direct keys.
        foreach (['Authorization', 'HTTP_AUTHORIZATION', 'REDIRECT_HTTP_AUTHORIZATION'] as $key) {
            if (!empty($_SERVER[$key])) {
                return trim($_SERVER[$key]);
            }
        }
        if (function_exists('apache_request_headers')) {
            $headers = array_change_key_case(apache_request_headers(), CASE_LOWER);
            if (!empty($headers['authorization'])) {
                return trim($headers['authorization']);
            }
        }
        return null;
    }

    $__header = getAuthorizationHeader();
    $__parts  = $__header ? explode(' ', $__header, 2) : [];
    $__token  = $__parts[1] ?? '';

    $__tokRows = 0;
    try {
        $__creds = getDbCredentials();
        $__authDb = new mysqli($__creds['host'], $__creds['user'], $__creds['pass'], $__creds['db'], $__creds['port']);
        if ($__authDb->connect_error) {
            http_response_code(500);
            echo json_encode(['timestamp' => date('Y-m-d H:i:s'), 'message' => 'Database connection failed', 'status' => 500]);
            exit;
        }
        $__authDb->set_charset('utf8mb4');

        $__stmtTok = $__authDb->prepare(
            'SELECT id FROM api_authorization
              WHERE token = ?
                AND (token_expires_at IS NULL OR token_expires_at > NOW())
              LIMIT 1'
        );
        $__stmtTok->bind_param('s', $__token);
        $__stmtTok->execute();
        $__tokRows = $__stmtTok->get_result()->num_rows;
        $__stmtTok->close();
        $__authDb->close();
    } catch (\Throwable $e) {
        http_response_code(500);
        echo json_encode(['timestamp' => date('Y-m-d H:i:s'), 'message' => 'Database connection failed: ' . $e->getMessage(), 'status' => 500]);
        exit;
    }

    if ($__tokRows === 0) {
        http_response_code(401);
        echo json_encode(['timestamp' => date('Y-m-d H:i:s'), 'message' => 'Wrong Authentication', 'status' => 401]);
        exit;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rest class
// ─────────────────────────────────────────────────────────────────────────────
class Rest
{
    private mysqli $db;

    /** @var list<array<string,mixed>>|null Memoised `urubuto_services` rows. */
    private ?array $urubutoServicesCache = null;

    private string $host;
    private string $user;
    private string $password;
    private string $database;
    private int $port;

    public function __construct()
    {
        $creds = getDbCredentials();
        $this->host     = $creds['host'];
        $this->user     = $creds['user'];
        $this->password = $creds['pass'];
        $this->database = $creds['db'];
        $this->port     = $creds['port'];
        try {
            $conn = new mysqli($this->host, $this->user, $this->password, $this->database, $this->port);
            if ($conn->connect_error) {
                http_response_code(500);
                echo json_encode(['timestamp' => date('Y-m-d H:i:s'), 'message' => 'Database connection failed', 'status' => 500]);
                exit;
            }
            $conn->set_charset('utf8mb4');
            mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
            $this->db = $conn;
        } catch (\Throwable $e) {
            http_response_code(500);
            echo json_encode(['timestamp' => date('Y-m-d H:i:s'), 'message' => 'Database connection failed: ' . $e->getMessage(), 'status' => 500]);
            exit;
        }
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Generate a unique internal transaction code, e.g. "DG-A1B2C3D4".
     */
    private function makeCode(string $prefix = 'DG'): string
    {
        $chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        $code  = '';
        for ($i = 0; $i < 8; $i++) {
            $code .= $chars[random_int(0, strlen($chars) - 1)];
        }
        return $prefix . '-' . $code;
    }

    /**
     * Check that a merchant_code exists in api_authorization.
     */
    private function merchantExists(string $code): bool
    {
        $stmt = $this->db->prepare(
            'SELECT id FROM api_authorization WHERE merchant_code = ? LIMIT 1'
        );
        $stmt->bind_param('s', $code);
        $stmt->execute();
        $exists = $stmt->get_result()->num_rows > 0;
        $stmt->close();
        return $exists;
    }

    /**
     * Fetch a single ACTIVE student row from the `student` table by regnumber.
     *
     * The student table stores regnumber in `regnumber` (varchar 250).
     * Some bank systems prepend leading zeros, so we try the clean version first.
     *
     * Columns returned match the actual `student` table schema from the SQL dump.
     */
    private function findStudent(string $regNumber): ?array
    {
        $sql = "SELECT
                    regnumber,
                    fname,
                    lname,
                    phone,
                    email,
                    faculty,
                    department,
                    std_option,
                    current_level,
                    acc_year,
                    program,
                    campus,
                    student_state
                FROM student
                WHERE LOWER(student_state) = 'active'
                  AND regnumber = ?
                LIMIT 1";

        $stmt = $this->db->prepare($sql);
        $stmt->bind_param('s', $regNumber);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    /**
     * Wrapper: try stripped version first, then the original.
     */
    private function lookupStudent(string $payerCode): ?array
    {
        $clean = ltrim($payerCode, '0');
        return ($clean !== $payerCode ? $this->findStudent($clean) : null)
            ?? $this->findStudent($payerCode);
    }

    /**
     * Look up an applicant by application number. Applicants pay a one-off
     * application processing fee through the same UrubutoPay channel as
     * students; their payer_code is the student_applications.application_number.
     */
    private function findApplication(string $appNumber): ?array
    {
        $sql = "SELECT id, application_number, first_name, last_name, email,
                       COALESCE(phone, '') AS phone,
                       payment_amount, payment_currency, transaction_id, paid_at, status
                FROM student_applications
                WHERE application_number = ?
                LIMIT 1";
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param('s', $appNumber);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    /**
     * Application-fee configuration.
     *
     * This endpoint is the one UrubutoPay actually calls, so the amount it
     * returns IS the amount the hosted checkout shows the applicant. It must
     * therefore resolve the fee from the same source as the public apply page
     * (SystemBasicsController::getPublicApplicationFee) — otherwise finance
     * raises the fee in the admin UI and the gateway keeps charging the old
     * hardcoded 5,000.
     *
     * Amount precedence (identical to the apply page and to
     * FeeService::resolveApplicationFeeAmount):
     *   1. fee_structures row named by settings.application_fee_mapped_fee_structure_id
     *   2. settings.application_fee_amount
     *   3. URUBUTOPAY_APPLICATION_FEE in backend/.env
     *   4. Hard default: 5,000 RWF
     *
     * Returns ['fee' => int, 'service_code' => string, 'service_name' => string].
     */
    private function appFeeConfig(): array
    {
        $cfg = ['fee' => 0, 'service_code' => 'application-fees-6590', 'service_name' => 'Application fees'];

        // Service identity: catalogue wins over the hardcoded default.
        foreach ($this->urubutoServices() as $svc) {
            if (strtoupper((string)$svc['payer_target']) === 'APPLICANT' && empty($svc['alias_of'])) {
                $cfg['service_code'] = (string)$svc['service_code'];
                $cfg['service_name'] = (string)$svc['service_name'];
                break;
            }
        }

        // 1 + 2. Database — what finance configured in the admin UI.
        $cfg['fee'] = $this->applicationFeeFromDatabase();

        // 3. backend/.env — service identity always overrides; the amount only
        //    when the database had nothing configured.
        $path = __DIR__ . '/../backend/.env';
        if (is_file($path)) {
            foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                $line = trim($line);
                if ($line === '' || $line[0] === '#') continue;
                $parts = explode('=', $line, 2);
                if (count($parts) !== 2) continue;
                $k = trim($parts[0]);
                $v = trim($parts[1], "\"' ");
                if ($k === 'URUBUTOPAY_APPLICATION_FEE' && $cfg['fee'] <= 0) $cfg['fee'] = (int)$v;
                if ($k === 'URUBUTOPAY_APPLICATION_SERVICE_CODE') $cfg['service_code'] = $v;
                if ($k === 'URUBUTOPAY_APPLICATION_SERVICE_NAME') $cfg['service_name'] = $v;
            }
        }

        // 4. Last resort.
        if ($cfg['fee'] <= 0) {
            $cfg['fee'] = 5000;
        }

        return $cfg;
    }

    /**
     * Application fee as configured in the database, or 0 when unset/unreadable.
     * Mirrors FeeService::resolveApplicationFeeAmount() so the gateway, the
     * apply page and the finance ledger never quote three different numbers.
     */
    private function applicationFeeFromDatabase(): int
    {
        try {
            $structureId = (int)$this->settingValue('application_fee_mapped_fee_structure_id');
            if ($structureId > 0) {
                $stmt = $this->db->prepare(
                    'SELECT amount FROM `fee_structures` WHERE id = ? AND is_active = 1 LIMIT 1'
                );
                if ($stmt) {
                    $stmt->bind_param('i', $structureId);
                    $stmt->execute();
                    $row = $stmt->get_result()->fetch_assoc();
                    $stmt->close();
                    $amount = (int)round((float)($row['amount'] ?? 0));
                    if ($amount > 0) {
                        return $amount;
                    }
                }
            }

            $amount = (int)round((float)$this->settingValue('application_fee_amount'));
            if ($amount > 0) {
                return $amount;
            }
        } catch (\Throwable $e) {
            error_log('[payment_api] application fee lookup failed: ' . $e->getMessage());
        }

        return 0;
    }

    /** Single `settings` row value by key_name, '' when missing. */
    private function settingValue(string $key): string
    {
        $stmt = $this->db->prepare('SELECT value FROM `settings` WHERE key_name = ? LIMIT 1');
        if (!$stmt) {
            return '';
        }
        $stmt->bind_param('s', $key);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return (string)($row['value'] ?? '');
    }

    /**
     * Look up a public service request by its request_code (used as the
     * UrubutoPay payer_code for the pay-first service-request platform —
     * see backend/app/Services/ServiceRequestService.php). Mirrors
     * findApplication() above. This is the branch that was MISSING here,
     * which is why the hosted checkout page showed "no data found for the
     * given payer code" for every SR-* payer code — this legacy endpoint,
     * not the modern backend, is the one actually registered with UrubutoPay.
     */
    private function findServiceRequest(string $requestCode): ?array
    {
        $sql = "SELECT sr.id, sr.request_code, sr.invoice_id, sr.status, sr.full_name,
                       sr.phone, sr.email, sc.name AS service_name, sc.fee_amount, sc.fee_currency
                  FROM service_requests sr
                  JOIN service_catalog sc ON sc.id = sr.service_id
                 WHERE sr.request_code = ?
                 LIMIT 1";
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param('s', $requestCode);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    /** Service code registered for service-request fees — same fallback as the modern backend. */
    private function serviceRequestServiceCode(?string $serviceName = null): string
    {
        $path = __DIR__ . '/../backend/.env';
        if (is_file($path)) {
            foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                $line = trim($line);
                if ($line === '' || $line[0] === '#') continue;
                $parts = explode('=', $line, 2);
                if (count($parts) === 2 && trim($parts[0]) === 'URUBUTOPAY_SERVICE_REQUEST_SERVICE_CODE') {
                    return trim($parts[1], "\"' ");
                }
            }
        }
        // UrubutoPay now registers one code per document type, so match the
        // requested catalogue service to its own code rather than billing every
        // service request to one generic bucket.
        if ($serviceName !== null && trim($serviceName) !== '') {
            $needle = preg_replace('/[^a-z0-9]+/', '', strtolower($serviceName)) ?? '';
            if ($needle !== '') {
                foreach ($this->urubutoServices() as $svc) {
                    if (strtoupper((string)$svc['payer_target']) !== 'SERVICE_REQUEST' || !empty($svc['alias_of'])) {
                        continue;
                    }
                    $candidate = preg_replace('/[^a-z0-9]+/', '', strtolower((string)$svc['service_name'])) ?? '';
                    if ($candidate !== ''
                        && ($candidate === $needle || str_contains($needle, $candidate) || str_contains($candidate, $needle))) {
                        return (string)$svc['service_code'];
                    }
                }
            }
        }

        return 'other-fees-8272';
    }

    /**
     * The UrubutoPay service catalogue (`urubuto_services`, migration 134):
     * every gateway service_code mapped to the internal fee_type it settles.
     * Memoised per request; an empty array when the table is absent, which
     * leaves every caller on its hardcoded default.
     *
     * @return list<array<string,mixed>>
     */
    private function urubutoServices(): array
    {
        if ($this->urubutoServicesCache !== null) {
            return $this->urubutoServicesCache;
        }

        $rows = [];
        try {
            $res = $this->db->query(
                'SELECT * FROM `urubuto_services` WHERE `is_active` = 1 ORDER BY `sort_order` ASC, `id` ASC'
            );
            if ($res) {
                while ($row = $res->fetch_assoc()) {
                    $rows[] = $row;
                }
                $res->free();
            }
        } catch (\Throwable $e) {
            error_log('[payment_api] urubuto_services unavailable: ' . $e->getMessage());
            $rows = [];
        }

        return $this->urubutoServicesCache = $rows;
    }

    /**
     * Internal fee_invoices.fee_type a gateway service settles, following
     * `alias_of` one hop so codes from the retired merchant registration still
     * resolve. NULL when the code is unknown or maps to no specific type.
     */
    private function feeTypeForServiceCode(string $serviceCode): ?string
    {
        $code = trim($serviceCode);
        if ($code === '') {
            return null;
        }

        $byCode = [];
        foreach ($this->urubutoServices() as $svc) {
            $byCode[(string)$svc['service_code']] = $svc;
        }

        $row = $byCode[$code] ?? null;
        if (!$row) {
            return null;
        }

        $alias = trim((string)($row['alias_of'] ?? ''));
        if ($alias !== '' && isset($byCode[$alias])) {
            $row = $byCode[$alias];
        }

        // Returned verbatim: live fee_invoices rows use both 'TUITION' and
        // lowercase 'service_request', and callers compare case-insensitively.
        $type = trim((string)($row['fee_type'] ?? ''));
        return $type !== '' ? $type : null;
    }

    /**
     * Does this value look like a gateway service_code ('fines-1062') rather
     * than a display name or a stray number? Used to decide whether an
     * unrecognised value is safe to record verbatim.
     */
    private function looksLikeServiceCode(string $value): bool
    {
        return (bool)preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)+$/i', trim($value));
    }

    /**
     * Canonicalise one candidate value against the `urubuto_services` catalogue.
     *
     * The gateway is not consistent about WHAT identifies the chosen service:
     * it may be the service_code ('fines-1062'), the gateway-side numeric
     * service_id ('10264'), or the display name ('Fines'). All three resolve
     * here to the live service_code, with `alias_of` followed one hop so codes
     * from the retired merchant registration still land on the live service.
     *
     * Returns '' when the value matches nothing, so an unrecognised value is
     * never silently promoted to some real service.
     */
    private function canonicalServiceCode(string $candidate): string
    {
        $needle = trim($candidate);
        if ($needle === '') {
            return '';
        }

        $rows = $this->urubutoServices();
        if (!$rows) {
            // Catalogue unreachable (migration 134 not applied). Keep an
            // obviously code-shaped value rather than losing it; ignore the rest.
            return $this->looksLikeServiceCode($needle) ? $needle : '';
        }

        $byCode = [];
        foreach ($rows as $row) {
            $byCode[strtolower((string)$row['service_code'])] = $row;
        }

        $match = $byCode[strtolower($needle)] ?? null;

        if (!$match && ctype_digit($needle)) {
            foreach ($rows as $row) {
                if ((string)($row['urubuto_service_id'] ?? '') === $needle) {
                    $match = $row;
                    break;
                }
            }
        }

        if (!$match) {
            $slug = preg_replace('/[^a-z0-9]+/', '', strtolower($needle)) ?? '';
            if ($slug !== '') {
                foreach ($rows as $row) {
                    $name = preg_replace('/[^a-z0-9]+/', '', strtolower((string)$row['service_name'])) ?? '';
                    if ($name !== '' && $name === $slug) {
                        $match = $row;
                        break;
                    }
                }
            }
        }

        if (!$match) {
            return '';
        }

        $alias = trim((string)($match['alias_of'] ?? ''));
        if ($alias !== '' && isset($byCode[strtolower($alias)])) {
            $match = $byCode[strtolower($alias)];
        }

        return (string)$match['service_code'];
    }

    /**
     * Which service did the payer actually select on the gateway?
     *
     * This used to be a two-key read with a hardcoded default:
     *
     *     trim($data['payment_purpose_code'] ?? $data['service_code'] ?? 'tuition-fees-4679')
     *
     * so ANY callback not using one of those two exact key names was recorded
     * as TUITION — which is why every payment, whatever the payer picked from
     * the 22-service menu, landed on `tuition-fees-4679` in `payment` and
     * `bank_payment` and was then reconciled against tuition invoices. The
     * default is gone: a service is either recognised or the field is left
     * blank, and the row falls back to the generic bank category '147', which
     * is honest and still reconciles FIFO.
     *
     * Every key name and payload shape the gateway is known to use is tried,
     * most specific first: an explicit code, then the numeric service_id, then
     * the display name.
     */
    private function resolveCallbackServiceCode(array $data): string
    {
        $codeKeys = ['service_code', 'serviceCode', 'payment_purpose_code', 'paymentPurposeCode',
                     'purpose_code', 'purposeCode', 'payment_purpose', 'paymentPurpose'];
        $idKeys   = ['service_id', 'serviceId', 'urubuto_service_id'];
        $nameKeys = ['service_name', 'serviceName', 'service', 'paid_service', 'payment_purpose_name'];

        // The identifying field is not always at the top level: some channels
        // wrap the payload in `data` / `payment` / `transaction`, and others
        // send the chosen service as an entry in a `services[]` list.
        $scopes = [$data];
        foreach (['data', 'payment', 'transaction', 'details', 'payment_details', 'service', 'selected_service'] as $key) {
            if (isset($data[$key]) && is_array($data[$key])) {
                $scopes[] = $data[$key];
            }
        }
        foreach (['services', 'service_list', 'items'] as $key) {
            if (!empty($data[$key]) && is_array($data[$key])) {
                foreach ($data[$key] as $entry) {
                    if (is_array($entry)) {
                        $scopes[] = $entry;
                    }
                }
            }
        }

        $rawCode = '';
        foreach ([$codeKeys, $idKeys, $nameKeys] as $keys) {
            foreach ($scopes as $scope) {
                foreach ($keys as $key) {
                    if (!isset($scope[$key]) || is_array($scope[$key])) {
                        continue;
                    }
                    $value = trim((string)$scope[$key]);
                    if ($value === '') {
                        continue;
                    }
                    $code = $this->canonicalServiceCode($value);
                    if ($code !== '') {
                        return $code;
                    }
                    // Code-shaped but unknown — a service added in the merchant
                    // portal that the catalogue has not been told about yet.
                    // Hold on to it, but keep looking for a known service first.
                    if ($rawCode === '' && $this->looksLikeServiceCode($value)) {
                        $rawCode = $value;
                    }
                }
            }
        }

        return $rawCode;
    }

    /**
     * Answer the gateway NOW, then keep working.
     *
     * The payment callback used to run the whole ledger reconciliation before
     * writing a byte of response, so however long invoice matching took was
     * time UrubutoPay spent waiting on an unanswered notification. A gateway
     * that does not get a clean, prompt acknowledgement retries, and a
     * notification it never manages to deliver is exactly the sort of thing
     * that gets auto-reversed. The money is already recorded by the time this
     * is called; the reconciliation that follows is our own bookkeeping and the
     * gateway has no stake in how long it takes.
     */
    private function ackAndFinish(array $payload, int $code = 200): void
    {
        $body = json_encode($payload);
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');

        // Keep a copy for the wire log — the buffer is gone after the flush.
        $GLOBALS['__urubuto_response'] = $body;

        if (function_exists('fastcgi_finish_request')) {
            echo $body;
            while (ob_get_level() > 0) {
                ob_end_flush();
            }
            fastcgi_finish_request();
            return;
        }

        // mod_php / CGI: close the connection by declaring the length.
        ignore_user_abort(true);
        header('Connection: close');
        header('Content-Length: ' . strlen($body));
        echo $body;
        while (ob_get_level() > 0) {
            ob_end_flush();
        }
        flush();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 0. CLAIM TOKEN  –  POST /api/token.php
    //    No bearer token required for this endpoint (define SKIP_TOKEN_CHECK).
    //
    //    Request : { "user_name": "bk_csgd", "password": "..." }
    //    Success : { timestamp, message, status:200,
    //                data:{ token, merchant_code } }
    // ─────────────────────────────────────────────────────────────────────────
    public function claimtoken(array $row): void
    {
        $date     = date('Y-m-d H:i:s');
        $username = trim($row['user_name'] ?? '');
        $password = trim($row['password']  ?? '');

        if ($username === '' || $password === '') {
            http_response_code(400);
            echo json_encode(['timestamp' => $date, 'message' => 'user_name and password are required', 'status' => 400]);
            return;
        }

        // Fetch by username, then verify password flexibly
        // (supports plain-text, MD5, SHA1, SHA256, bcrypt)
        $stmt = $this->db->prepare(
            'SELECT token, merchant_code, password AS stored_pw
             FROM api_authorization
             WHERE username = ?
             LIMIT 1'
        );
        $stmt->bind_param('s', $username);
        $stmt->execute();
        $result = $stmt->get_result();
        $stmt->close();

        if ($result->num_rows === 0) {
            http_response_code(401);
            echo json_encode(['timestamp' => $date, 'message' => 'Invalid credentials', 'status' => 401]);
            return;
        }

        $rec      = $result->fetch_assoc();
        $storedPw = $rec['stored_pw'];

        $valid = $password === $storedPw
            || md5($password)          === $storedPw
            || sha1($password)         === $storedPw
            || hash('sha256', $password) === $storedPw
            || (function_exists('password_verify') && password_verify($password, $storedPw));

        if (!$valid) {
            http_response_code(401);
            echo json_encode(['timestamp' => $date, 'message' => 'Invalid credentials', 'status' => 401]);
            return;
        }

        // Compute expiry on the DB clock so the token stays valid regardless of
        // any PHP/MySQL timezone difference (the guard checks token_expires_at > NOW()).
        $newToken  = bin2hex(random_bytes(32));
        $updStmt   = $this->db->prepare(
            'UPDATE api_authorization SET token = ?, token_expires_at = DATE_ADD(NOW(), INTERVAL 2 HOUR) WHERE username = ?'
        );
        $updStmt->bind_param('ss', $newToken, $username);
        $updStmt->execute();
        $updStmt->close();

        http_response_code(200);
        echo json_encode([
            'timestamp' => $date,
            'status'    => 200,
            'data'      => [
                'token' => 'Bearer ' . $newToken,
            ],
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. GET STUDENT  –  POST /api/getstudent.php
    //    Bank calls this to verify a payer before accepting payment.
    //
    //    Request : { "payer_code": "1CUR18AK05399", "merchant_code": "TH979..." }
    //    Success : { timestamp, message, status:200,
    //                data:{ merchant_code, payer_code, payer_names,
    //                       department_code, department_name, amount,
    //                       currency, class_name,
    //                       payer_must_pay_total_amount, comment } }
    // ─────────────────────────────────────────────────────────────────────────
    public function getStudent(array $input): void
    {
        $date         = date('Y-m-d H:i:s');
        $payerCode    = trim($input['payer_code']    ?? '');
        $merchantCode = trim($input['merchant_code'] ?? '');

        if ($payerCode === '' || $merchantCode === '') {
            http_response_code(400);
            echo json_encode(['timestamp' => $date, 'message' => 'payer_code and merchant_code are required', 'status' => 400]);
            return;
        }

        if (!$this->merchantExists($merchantCode)) {
            http_response_code(404);
            echo json_encode(['timestamp' => $date, 'message' => 'Invalid merchant code: ' . $merchantCode, 'status' => 404]);
            return;
        }

        $student = $this->lookupStudent($payerCode);

        if (!$student) {
            // Fall back to an applicant paying the one-off application fee.
            $application = $this->findApplication($payerCode);
            if ($application) {
                $cfg        = $this->appFeeConfig();
                $payerNames = strtoupper(trim(($application['first_name'] ?? '') . ' ' . ($application['last_name'] ?? '')));
                http_response_code(200);
                echo json_encode([
                    'timestamp' => $date,
                    'message'   => 'validated successfully',
                    'status'    => 200,
                    'data'      => [
                        'merchant_code'               => $merchantCode,
                        'payer_code'                  => $application['application_number'],
                        'payer_names'                 => $payerNames !== '' ? $payerNames : 'APPLICANT',
                        'currency'                    => 'RWF',
                        'payer_must_pay_total_amount' => 'YES',
                        'amount'                      => $cfg['fee'],
                        'comment'                     => 'application processing fee',
                        'service_code'                => $cfg['service_code'],
                        'commission_rate'             => 0,
                        'services'                    => [[
                            'service_code' => $cfg['service_code'],
                            'service_name' => $cfg['service_name'],
                            'amount'       => $cfg['fee'],
                            'currency'     => 'RWF',
                        ]],
                    ],
                ]);
                return;
            }

            $serviceRequest = $this->findServiceRequest($payerCode);
            if ($serviceRequest) {
                $fee         = (float)($serviceRequest['fee_amount'] ?? 0);
                $currency    = (string)($serviceRequest['fee_currency'] ?? 'RWF');
                $serviceCode = $this->serviceRequestServiceCode((string)($serviceRequest['service_name'] ?? ''));
                $payerNames  = strtoupper(trim((string)($serviceRequest['full_name'] ?? '')));

                http_response_code(200);
                echo json_encode([
                    'timestamp' => $date,
                    'message'   => 'validated successfully',
                    'status'    => 200,
                    'data'      => [
                        'merchant_code'               => $merchantCode,
                        'payer_code'                  => $serviceRequest['request_code'],
                        'payer_names'                 => $payerNames !== '' ? $payerNames : 'APPLICANT',
                        'currency'                    => $currency,
                        'payer_must_pay_total_amount' => 'YES',
                        'amount'                      => $fee,
                        'comment'                     => 'service request fee',
                        'service_code'                => $serviceCode,
                        'commission_rate'             => 0,
                        'services'                    => [[
                            'service_code' => $serviceCode,
                            'service_name' => $serviceRequest['service_name'] ?? 'SERVICE REQUEST FEE',
                            'amount'       => $fee,
                            'currency'     => $currency,
                        ]],
                    ],
                ]);
                return;
            }

            http_response_code(404);
            echo json_encode(['timestamp' => $date, 'status' => 404, 'message' => 'no data found for the given payer code']);
            return;
        }

        http_response_code(200);
        echo json_encode([
            'timestamp' => $date,
            'message'   => 'validated successfully',
            'status'    => 200,
            'data'      => [
                'merchant_code'               => $merchantCode,
                'payer_code'                  => $student['regnumber'],
                'payer_names'                 => strtoupper(trim($student['fname'] . ' ' . $student['lname'])),
                'currency'                    => 'RWF',
                'payer_must_pay_total_amount' => 'NO',
                'amount'                      => 0,
                'comment'                     => 'school fees',
                'commission_rate'             => 0,
                // Without this list the payer can only send a lump sum and the
                // callback arrives with a blank service_code — i.e. we never
                // learn what they were paying for. Mirrors
                // UrubutoPayService::buildServices().
                'services'                    => $this->buildStudentServices($student),
            ],
        ]);
    }

    /**
     * The service menu a student sees, one entry per student-facing service in
     * the `urubuto_services` catalogue (migration 134).
     *
     * Amount precedence, per service:
     *   1. outstanding balance on open invoices of the service's billing fee_type
     *   2. the published `fee_structures` amount for its pricing fee_structure_type
     *   3. 0 — the payer names their own amount
     *
     * Each fee_type's balance is claimed by the first service mapped to it, so a
     * single debt is never shown against three services at once.
     *
     * @param  array<string,mixed> $student
     * @return list<array<string,mixed>>
     */
    private function buildStudentServices(array $student): array
    {
        $menu = [];
        foreach ($this->urubutoServices() as $svc) {
            if (strtoupper((string)$svc['payer_target']) === 'STUDENT'
                && empty($svc['alias_of'])
                && (int)($svc['show_in_menu'] ?? 0) === 1) {
                $menu[] = $svc;
            }
        }
        if (empty($menu)) {
            return [];
        }

        $regnumber = (string)$student['regnumber'];

        // Outstanding per billing fee_type
        $outstanding = [];
        $stmt = $this->db->prepare(
            "SELECT fee_type,
                    GREATEST(0, ROUND(SUM(amount_due - amount_paid - IFNULL(bursary_applied, 0)), 2)) AS outstanding
               FROM fee_invoices
              WHERE student_id = ?
                AND status NOT IN ('paid', 'waived', 'cancelled')
              GROUP BY fee_type
             HAVING outstanding > 0"
        );
        $stmt->bind_param('s', $regnumber);
        $stmt->execute();
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) {
            $outstanding[strtoupper((string)$row['fee_type'])] = (float)$row['outstanding'];
        }
        $stmt->close();

        $academicYearId = $this->resolveAcademicYearId($student);
        $departmentId   = ctype_digit(trim((string)($student['department'] ?? ''))) ? (int)$student['department'] : null;
        $levelId        = ctype_digit(trim((string)($student['current_level'] ?? ''))) ? (int)$student['current_level'] : null;

        $claimed  = [];
        $services = [];
        foreach ($menu as $svc) {
            $feeType = strtoupper(trim((string)($svc['fee_type'] ?? '')));
            $amount  = 0.0;

            if ($feeType !== '' && !isset($claimed[$feeType]) && isset($outstanding[$feeType])) {
                $amount          = $outstanding[$feeType];
                $claimed[$feeType] = true;
            }

            if ($amount <= 0.0) {
                $amount = (float)$this->publishedFeeAmount(
                    (string)($svc['fee_structure_type'] ?? ''), $academicYearId, $departmentId, $levelId
                );
            }

            $services[] = [
                'service_code' => (string)$svc['service_code'],
                'service_name' => (string)$svc['service_name'],
                'amount'       => (int)round($amount),
                'currency'     => 'RWF',
            ];
        }

        return $services;
    }

    /**
     * Published amount for a fee_structures.fee_type, narrowed to the student's
     * department/level. Ranks an exact department match above a universal
     * (NULL) row, mirroring FeeStructureModel::findBestMatch(). Returns 0 when
     * the service is not centrally priced or no row covers this student.
     */
    private function publishedFeeAmount(string $structureType, ?int $academicYearId, ?int $departmentId, ?int $levelId): float
    {
        if (trim($structureType) === '' || $academicYearId === null) {
            return 0.0;
        }

        $stmt = $this->db->prepare(
            "SELECT amount
               FROM fee_structures
              WHERE academic_year_id = ?
                AND fee_type = ?
                AND is_active = 1
                AND (department_id = ? OR department_id IS NULL)
                AND (level_id = ? OR level_id IS NULL)
              ORDER BY (department_id = ?) DESC, (level_id = ?) DESC
              LIMIT 1"
        );
        $stmt->bind_param('isiiii', $academicYearId, $structureType, $departmentId, $levelId, $departmentId, $levelId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        return $row ? (float)$row['amount'] : 0.0;
    }

    /** Academic year id for a student row: their own acc_year, else the current year. */
    private function resolveAcademicYearId(array $student): ?int
    {
        $accYear = trim((string)($student['acc_year'] ?? ''));
        if ($accYear !== '') {
            $stmt = $this->db->prepare(
                "SELECT id FROM academic_years
                  WHERE label = ? OR label = REPLACE(?, '-', '/') OR label = REPLACE(?, '/', '-')
                  LIMIT 1"
            );
            $stmt->bind_param('sss', $accYear, $accYear, $accYear);
            $stmt->execute();
            $row = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            if ($row) {
                return (int)$row['id'];
            }
        }

        $res = $this->db->query('SELECT id FROM academic_years WHERE is_current = 1 LIMIT 1');
        $row = $res ? $res->fetch_assoc() : null;
        if ($res) {
            $res->free();
        }
        return $row ? (int)$row['id'] : null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. INSERT PAYMENT  –  POST /api/payment.php
    //    Records a bank payment into the `payment` table.
    //
    //    Request : { "payer_code", "transaction_id", "payment_channel",
    //               "bank_account", "initial_slip_number", "slip_number",
    //               "amount", "term", "academic_year", "payment_date_time",
    //               "payment_purpose_code", "merchant_code" }
    //    Success : { timestamp, message, status:200,
    //                data:{ external_transaction_id,
    //                       internal_transaction_id,
    //                       payer_phone_number, payer_email } }
    //
    //    `payment` table columns used:
    //      trans_code, student (regnumber), level_id, SESSION, bank_id,
    //      slip_no, invoi_ref, user, acad_cycle_id, date, fee_category,
    //      amount, description, Remark, action,
    //      external_transaction_id, payment_chanel, payment_notifi, status
    // ─────────────────────────────────────────────────────────────────────────
    public function insertPayment(array $data): void
    {
        $date = date('Y-m-d H:i:s');
        try {
            $this->doInsertPayment($data, $date);
        } catch (\Throwable $e) {
            http_response_code(500);
            echo json_encode(['timestamp' => $date, 'message' => 'Server error: ' . $e->getMessage(), 'status' => 500]);
        }
    }

    private function doInsertPayment(array $data, string $date): void
    {
        $regNumber      = trim($data['payer_code']           ?? '');
        $transactionId  = trim($data['transaction_id']       ?? '');
        $paymentChannel = trim($data['payment_channel']      ?? '');
        $bankAccount    = trim($data['bank_account']         ?? '');
        $slipNumber     = trim($data['slip_number']          ?? '');
        $amount         = (float)($data['amount']            ?? 0);
        $term           = trim($data['term']                 ?? '');
        $academicYear   = trim($data['academic_year']        ?? '');
        $paymentDate    = trim($data['payment_date_time']    ?? $date);
        // Resolved against the service catalogue so a service_id or a service
        // name identifies the service just as well as its code; the raw value
        // still stands in when the bank sends a purpose code of its own.
        $purposeCode    = $this->resolveCallbackServiceCode($data) ?: trim($data['payment_purpose_code'] ?? '');
        $merchantCode   = trim($data['merchant_code']        ?? '');

        // ── Validate required fields ──────────────────────────────────────────
        if ($regNumber === '' || $transactionId === '') {
            http_response_code(400);
            echo json_encode(['timestamp' => $date, 'message' => 'payer_code and transaction_id are required', 'status' => 400]);
            return;
        }

        // ── Validate merchant ─────────────────────────────────────────────────
        if ($merchantCode !== '' && !$this->merchantExists($merchantCode)) {
            http_response_code(404);
            echo json_encode(['timestamp' => $date, 'message' => 'Invalid merchant code: ' . $merchantCode, 'status' => 404]);
            return;
        }

        // ── Resolve active student by regnumber ───────────────────────────────
        $student = $this->lookupStudent($regNumber);
        if (!$student) {
            http_response_code(404);
            echo json_encode(['timestamp' => $date, 'message' => 'No active student found for code: ' . $regNumber, 'status' => 404]);
            return;
        }

        $phone   = $student['phone']        ?? '';
        $email   = $student['email']        ?? '';
        $accYear = $student['acc_year']     ?: $academicYear;
        $levelId = $student['current_level'] ?: $term;

        // ── Validate bank account ─────────────────────────────────────────────
        $bankId = null;
        if ($bankAccount !== '') {
            $stmtBk = $this->db->prepare('SELECT bank_id FROM tbl_bank WHERE account_no = ? LIMIT 1');
            $stmtBk->bind_param('s', $bankAccount);
            $stmtBk->execute();
            $resBk = $stmtBk->get_result();
            $stmtBk->close();

            if ($resBk->num_rows === 0) {
                http_response_code(404);
                echo json_encode(['timestamp' => $date, 'message' => 'Bank account not found: ' . $bankAccount, 'status' => 404]);
                return;
            }
            $bankId = (int)$resBk->fetch_assoc()['bank_id'];
        }

        // ── Duplicate-transaction check ───────────────────────────────────────
        $stmtChk = $this->db->prepare(
            'SELECT trans_code, amount FROM payment WHERE external_transaction_id = ? LIMIT 1'
        );
        $stmtChk->bind_param('s', $transactionId);
        $stmtChk->execute();
        $resChk = $stmtChk->get_result();
        $stmtChk->close();

        if ($resChk->num_rows > 0) {
            $existing = $resChk->fetch_assoc();

            if ((float)$existing['amount'] === $amount) {
                // Idempotent: same amount → update slip, return success
                $stmtUp = $this->db->prepare(
                    'UPDATE payment SET slip_no = ? WHERE external_transaction_id = ?'
                );
                $stmtUp->bind_param('ss', $slipNumber, $transactionId);
                $stmtUp->execute();
                $stmtUp->close();

                http_response_code(200);
                echo json_encode([
                    'timestamp' => $date,
                    'message'   => 'Successful',
                    'status'    => 200,
                    'data'      => [
                        'external_transaction_id' => $transactionId,
                        'internal_transaction_id' => $existing['trans_code'],
                        'payer_phone_number'      => $phone,
                        'payer_email'             => $email,
                    ],
                ]);
                return;
            }

            // Different amount → reject
            http_response_code(409);
            echo json_encode([
                'timestamp' => $date,
                'message'   => 'Transaction already exists with a different amount: ' . $transactionId,
                'status'    => 409,
            ]);
            return;
        }

        // ── Insert new payment row ────────────────────────────────────────────
        $transCode   = $this->makeCode('DG');
        $user        = 'UrubutoPay';
        $invoiRef    = 1;
        $feeCategory = $purposeCode !== '' ? $purposeCode : '147';
        $description = 'Bank payment via ' . $paymentChannel;
        $remarkVal   = 0;
        $action      = 'Debit';
        $statusVal   = 0;
        $regnumber   = $student['regnumber'];

        // Build query dynamically so bank_id column is only included when present
        if ($bankId !== null) {
            $sql = 'INSERT INTO payment
                        (trans_code, student, level_id, SESSION, bank_id, slip_no,
                         invoi_ref, user, acad_cycle_id, date, fee_category, amount,
                         description, recorded_date, Remark, action,
                         external_transaction_id, payment_chanel, payment_notifi, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?)';
            $stmtIns = $this->db->prepare($sql);
            $stmtIns->bind_param(
                'ssssissssssdsissssi',
                $transCode, $regnumber, $levelId, $term,
                $bankId, $slipNumber, $invoiRef, $user,
                $accYear, $paymentDate, $feeCategory, $amount,
                $description, $remarkVal, $action,
                $transactionId, $paymentChannel, $action, $statusVal
            );
        } else {
            $sql = 'INSERT INTO payment
                        (trans_code, student, level_id, SESSION, slip_no,
                         invoi_ref, user, acad_cycle_id, date, fee_category, amount,
                         description, recorded_date, Remark, action,
                         external_transaction_id, payment_chanel, payment_notifi, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?)';
            $stmtIns = $this->db->prepare($sql);
            $stmtIns->bind_param(
                'ssssssssssdssssssi',
                $transCode, $regnumber, $levelId, $term,
                $slipNumber, $invoiRef, $user,
                $accYear, $paymentDate, $feeCategory, $amount,
                $description, $remarkVal, $action,
                $transactionId, $paymentChannel, $action, $statusVal
            );
        }

        if (!$stmtIns->execute()) {
            $err = $stmtIns->error;
            $stmtIns->close();
            http_response_code(500);
            echo json_encode(['timestamp' => $date, 'message' => 'Payment insertion failed: ' . $err, 'status' => 500]);
            return;
        }
        $stmtIns->close();

        // ── Insert into bank_payment ────────────────────────────────────────────
        try {
            if ($bankId !== null) {
                $sqlBank = 'INSERT INTO bank_payment
                             (trans_code, reg_no, level_id, bank_id, slip_no, invoi_ref,
                              user, acad_cycle_id, date, fee_category, amount, description,
                              Remark, action, external_transaction_id, payment_chanel, payment_notifi)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
                $stmtBank = $this->db->prepare($sqlBank);
                $stmtBank->bind_param(
                    'sssssssssssssssss',
                    $transCode, $regnumber, $levelId, $bankId, $slipNumber, $invoiRef,
                    $user, $accYear, $paymentDate, $feeCategory, $amount, $description,
                    $remarkVal, $action, $transactionId, $paymentChannel, $action
                );
                $stmtBank->execute();
                $stmtBank->close();
            } else {
                $sqlBank = 'INSERT INTO bank_payment
                             (trans_code, reg_no, level_id, slip_no, invoi_ref,
                              user, acad_cycle_id, date, fee_category, amount, description,
                              Remark, action, external_transaction_id, payment_chanel, payment_notifi)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
                $stmtBank = $this->db->prepare($sqlBank);
                $stmtBank->bind_param(
                    'ssssssssssssssss',
                    $transCode, $regnumber, $levelId, $slipNumber, $invoiRef,
                    $user, $accYear, $paymentDate, $feeCategory, $amount, $description,
                    $remarkVal, $action, $transactionId, $paymentChannel, $action
                );
                $stmtBank->execute();
                $stmtBank->close();
            }
        } catch (\Throwable $e) {
            error_log('[LegacySync:bank_payment ERROR] ' . $e->getMessage());
        }

        http_response_code(200);
        echo json_encode([
            'timestamp' => $date,
            'message'   => 'Successful',
            'status'    => 200,
            'data'      => [
                'external_transaction_id' => $transactionId,
                'internal_transaction_id' => $transCode,
                'payer_phone_number'      => $phone,
                'payer_email'             => $email,
            ],
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. CANCEL / REVERSE PAYMENT  –  POST /api/cancel_transaction.php
    //    Creates a Credit (reversal) row in the `payment` table.
    //
    //    Request : { "transaction_id": "<bank_ext_id>",
    //               "external_transaction_id": "<internal_trans_code>",
    //               "amount": 50000,
    //               "merchant_code": "TH97990720_1" }
    //    Success : { timestamp, message, status:200,
    //                data:{ external_transaction_id,
    //                       internal_transaction_id,
    //                       payer_phone_number, payer_email } }
    // ─────────────────────────────────────────────────────────────────────────
    public function delete_transaction(array $rows): void
    {
        $date           = date('Y-m-d H:i:s');
        $transactionId  = trim($rows['transaction_id']          ?? '');
        $amount         = (float)($rows['amount']               ?? 0);

        // A reversal takes money back out of a student's ledger, and nothing in
        // this system ever asks for one — every reversal is an inbound,
        // authenticated request from the gateway. Trace it unconditionally,
        // regardless of the debug-log flag, so there is always a record of who
        // asked and what they sent.
        error_log(sprintf(
            '[UrubutoPay] REVERSAL requested from %s — tx=%s amount=%s payload=%s',
            $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? 'unknown',
            $transactionId !== '' ? $transactionId : '(none)',
            $amount > 0 ? (string)$amount : '(unspecified)',
            json_encode($rows)
        ));

        if ($transactionId === '') {
            http_response_code(400);
            echo json_encode(['timestamp' => $date, 'message' => 'transaction_id is required', 'status' => 400]);
            return;
        }

        // Find original Debit entry in `payment`
        $stmt = $this->db->prepare(
            "SELECT trans_code, student, bank_id, slip_no, Remark,
                    payment_chanel, amount, SESSION, level_id, acad_cycle_id
             FROM payment
             WHERE external_transaction_id = ?
               AND payment_notifi = 'Debit'
             ORDER BY recorded_date DESC LIMIT 1"
        );
        $stmt->bind_param('s', $transactionId);
        $stmt->execute();
        $res = $stmt->get_result();
        $stmt->close();

        if ($res->num_rows === 0) {
            http_response_code(404);
            echo json_encode(['timestamp' => $date, 'message' => 'Original payment not found for: ' . $transactionId, 'status' => 404]);
            return;
        }

        // ── Idempotency: UrubutoPay (and most gateways) retry webhooks that
        // don't get a fast/clean 200 back. Without this check, every retry of
        // the same reversal event inserted another Credit row and re-ran the
        // invoice rollback, over-reversing a single payment multiple times.
        $stmtDup = $this->db->prepare(
            "SELECT id FROM payment WHERE external_transaction_id = ? AND payment_notifi = 'Credit' LIMIT 1"
        );
        $stmtDup->bind_param('s', $transactionId);
        $stmtDup->execute();
        $dup = $stmtDup->get_result()->fetch_assoc();
        $stmtDup->close();

        if ($dup) {
            http_response_code(200);
            echo json_encode([
                'timestamp'  => $date,
                'message'    => 'Payment already reversed',
                'status'     => 200,
                'duplicate'  => true,
                'data'       => ['external_transaction_id' => $transactionId],
            ]);
            return;
        }

        $orig           = $res->fetch_assoc();
        $reversalAmount = $amount > 0 ? $amount : (float)$orig['amount'];

        // Fetch student contact info using the stored regnumber
        $phone = '';
        $email = '';
        $stmtSt = $this->db->prepare(
            'SELECT phone, email FROM student WHERE regnumber = ? LIMIT 1'
        );
        $stmtSt->bind_param('s', $orig['student']);
        $stmtSt->execute();
        $resSt = $stmtSt->get_result()->fetch_assoc();
        $stmtSt->close();
        if ($resSt) {
            $phone = $resSt['phone'] ?? '';
            $email = $resSt['email'] ?? '';
        }

        $reversalCode = $this->makeCode('GD');
        $user         = 'UrubutoPay';
        $feeCategory  = '146'; // reversal/credit category
        $description  = 'Reversal of ' . $orig['trans_code'];
        $notif        = 'Credit';
        $remarkV      = (int)$orig['Remark'];
        $statusVal    = 1; // reversals are considered final

        $stmtRev = $this->db->prepare(
            'INSERT INTO payment
                (trans_code, student, bank_id, slip_no, SESSION, level_id,
                 acad_cycle_id, user, date, fee_category, amount, description,
                 recorded_date, Remark, external_transaction_id,
                 payment_chanel, payment_notifi, status)
             VALUES
                (?, ?, ?, ?, ?, ?,
                 ?, ?, ?, ?, ?, ?,
                 CURRENT_TIMESTAMP, ?, ?,
                 ?, ?, ?)'
        );

        $stmtRev->bind_param(
            'ssisssssssdsisssi',
            $reversalCode,
            $orig['student'],
            $orig['bank_id'],
            $orig['slip_no'],
            $orig['SESSION'],
            $orig['level_id'],
            $orig['acad_cycle_id'],
            $user,
            $date,
            $feeCategory,
            $reversalAmount,
            $description,
            $remarkV,
            $transactionId,
            $orig['payment_chanel'],
            $notif,
            $statusVal
        );

        if (!$stmtRev->execute()) {
            $err = $stmtRev->error;
            $stmtRev->close();
            http_response_code(500);
            echo json_encode(['timestamp' => $date, 'message' => 'Reversal failed: ' . $err, 'status' => 500]);
            return;
        }
        $stmtRev->close();

        // ── Insert into bank_payment ────────────────────────────────────────────
        try {
            $stmtBank = $this->db->prepare(
                'INSERT INTO bank_payment
                    (trans_code, reg_no, level_id, bank_id, slip_no, invoi_ref,
                     user, acad_cycle_id, date, fee_category, amount, description,
                     Remark, action, external_transaction_id, payment_chanel, payment_notifi)
                 VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $regnumber = $orig['student'];
            $bankId = $orig['bank_id'];
            $slipNo = $orig['slip_no'];
            $accYear = $orig['acad_cycle_id'];
            $channel = $orig['payment_chanel'];
            $levelId = $orig['level_id'];
            $stmtBank->bind_param(
                'ssssssssssssssss',
                $reversalCode, $regnumber, $levelId, $bankId, $slipNo,
                $user, $accYear, $date, $feeCategory, $reversalAmount, $description,
                $remarkV, $notif, $transactionId, $channel, $notif
            );
            $stmtBank->execute();
            $stmtBank->close();
        } catch (\Throwable $e) {
            error_log('[LegacySync:bank_payment ERROR] ' . $e->getMessage());
        }

        http_response_code(200);
        echo json_encode([
            'timestamp' => $date,
            'message'   => 'Successful',
            'status'    => 200,
            'data'      => [
                'external_transaction_id' => $transactionId,
                'internal_transaction_id' => $reversalCode,
                'payer_phone_number'      => $phone,
                'payer_email'             => $email,
            ],
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. UPDATE PAYMENT  –  POST /api/update.php
    //    Updates slip_no and/or status on an existing payment row.
    //
    //    Request : { "transaction_id": "<bank_ext_id>",
    //               "slip_number": "...",
    //               "status": 1 }   (1=confirmed, 0=pending)
    //    Success : { timestamp, message, status:200 }
    // ─────────────────────────────────────────────────────────────────────────
    public function update_new(array $data): void
    {
        $date          = date('Y-m-d H:i:s');
        $transactionId = trim($data['transaction_id'] ?? '');
        $slipNumber    = trim($data['slip_number']    ?? '');
        $status        = isset($data['status']) ? (int)$data['status'] : null;

        if ($transactionId === '') {
            http_response_code(400);
            echo json_encode(['timestamp' => $date, 'message' => 'transaction_id is required', 'status' => 400]);
            return;
        }

        $setParts = [];
        $types    = '';
        $binds    = [];

        if ($slipNumber !== '') {
            $setParts[] = 'slip_no = ?';
            $types     .= 's';
            $binds[]    = $slipNumber;
        }
        if ($status !== null) {
            // `status` column: 0=pending, 1=confirmed
            $setParts[] = 'status = ?';
            $types     .= 'i';
            $binds[]    = $status;

            // Also update the `action` column to mirror the status text
            $setParts[] = 'action = ?';
            $types     .= 's';
            $binds[]    = ($status === 1) ? 'Confirmed' : 'Pending';
        }

        if (empty($setParts)) {
            http_response_code(400);
            echo json_encode(['timestamp' => $date, 'message' => 'Nothing to update', 'status' => 400]);
            return;
        }

        $types   .= 's';
        $binds[]  = $transactionId;

        $sql  = 'UPDATE payment SET ' . implode(', ', $setParts)
              . ' WHERE external_transaction_id = ?';
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param($types, ...$binds);
        $stmt->execute();
        $affected = $stmt->affected_rows;
        $stmt->close();

        if ($affected === 0) {
            http_response_code(404);
            echo json_encode(['timestamp' => $date, 'message' => 'No payment found for transaction: ' . $transactionId, 'status' => 404]);
            return;
        }

        http_response_code(200);
        echo json_encode(['timestamp' => $date, 'message' => 'Successful', 'status' => 200]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. PAYMENT CALLBACK  –  POST /api/callback.php
    //    UrubutoPay calls this after a USSD or hosted-checkout payment completes.
    //    UrubutoPay authenticates using the JWT issued by POST /api/token.php.
    //
    //    Request (callback_type=PAYMENT):
    //      { "callback_type":"PAYMENT", "transaction_code":"TXN123",
    //        "payer_code":"CUR/BBA/001/2022", "amount":450000,
    //        "currency":"RWF", "payment_date":"2024-01-01T10:00:00Z",
    //        "service_code":"tuition-fees-4679", "status":"SUCCESSFUL" }
    // ─────────────────────────────────────────────────────────────────────────
    public function claimCallback(array $data): void
    {
        $date         = date('Y-m-d H:i:s');
        $callbackType = trim($data['callback_type']                                          ?? '');
        $txCode       = trim($data['transaction_id']       ?? $data['transaction_code']      ?? '');
        $payerCode    = trim($data['payer_code']                                             ?? '');
        $amount       = (float)($data['amount']                                              ?? 0);
        $paymentDate  = trim($data['payment_date_time']    ?? $data['payment_date']          ?? $date);
        $serviceCode  = $this->resolveCallbackServiceCode($data);
        $cbStatus     = strtoupper(trim($data['transaction_status'] ?? $data['status']       ?? ''));

        // Only PAYMENT callbacks touch the ledger; acknowledge others silently.
        //
        // Every 200 this method returns carries the same `data` block, whatever
        // the outcome. A gateway that parses the acknowledgement looks for
        // those fields; a bare 200 without them can read as a failed
        // notification, and a notification the gateway believes it never
        // delivered is a candidate for auto-reversal. A retry must therefore
        // look exactly like the first success.
        if ($callbackType !== 'PAYMENT') {
            http_response_code(200);
            echo json_encode([
                'timestamp' => $date,
                'status'    => 200,
                'message'   => 'Callback acknowledged',
                'data'      => [
                    'internal_transaction_id' => '',
                    'external_transaction_id' => $txCode,
                    'payer_phone_number'      => '',
                ],
            ]);
            return;
        }

        if ($txCode === '' || $payerCode === '' || $amount <= 0) {
            http_response_code(400);
            echo json_encode(['timestamp' => $date, 'status' => 400, 'message' => 'Missing required callback fields']);
            return;
        }

        // No service is invented any more. When the gateway names none, say so
        // with the full payload — that log is the only way to learn a key name
        // this resolver does not handle yet.
        if ($serviceCode === '') {
            error_log('[UrubutoPay] PAYMENT callback named no known service — tx ' . $txCode
                . ', payload: ' . json_encode($data));
        }

        if (!in_array($cbStatus, ['SUCCESSFUL', 'VALID', 'PENDING_SETTLEMENT'], true)) {
            http_response_code(200);
            echo json_encode([
                'timestamp' => $date,
                'status'    => 200,
                'message'   => 'Non-successful payment acknowledged',
                'data'      => [
                    'internal_transaction_id' => '',
                    'external_transaction_id' => $txCode,
                    'payer_phone_number'      => '',
                ],
            ]);
            return;
        }

        $student = $this->lookupStudent($payerCode);
        if (!$student) {
            // Applicant paying the one-off application fee — record onto the
            // student_applications row and stop (no student ledger involved).
            $application = $this->findApplication($payerCode);
            if ($application) {
                // Idempotency — same transaction already recorded for this application.
                if (!empty($application['paid_at'])
                    && (string)($application['transaction_id'] ?? '') === $txCode) {
                    http_response_code(200);
                    echo json_encode([
                        'timestamp' => $date,
                        'status'    => 200,
                        'message'   => 'Payment recorded',
                        'duplicate' => true,
                        'data'      => [
                            'internal_transaction_id' => (string)$application['application_number'],
                            'external_transaction_id' => $txCode,
                            'payer_phone_number'      => (string)($application['phone'] ?? ''),
                        ],
                    ]);
                    return;
                }

                $appId    = (int)$application['id'];
                $currency = strtoupper(trim($data['currency'] ?? 'RWF')) ?: 'RWF';
                // Normalise ISO-8601 (e.g. 2026-06-28T11:00:00Z) to a MySQL DATETIME;
                // the paid_at column rejects the raw gateway format under strict mode.
                $paidAt   = date('Y-m-d H:i:s', strtotime($paymentDate) ?: time());
                $stmtApp  = $this->db->prepare(
                    'UPDATE student_applications
                        SET transaction_id = ?, payment_amount = ?, payment_currency = ?, paid_at = ?
                      WHERE id = ?'
                );
                $stmtApp->bind_param('sdssi', $txCode, $amount, $currency, $paidAt, $appId);
                $ok = $stmtApp->execute();
                $err = $stmtApp->error;
                $stmtApp->close();

                if (!$ok) {
                    http_response_code(500);
                    echo json_encode(['timestamp' => $date, 'status' => 500, 'message' => 'Application payment update failed: ' . $err]);
                    return;
                }

                http_response_code(200);
                echo json_encode([
                    'timestamp' => $date,
                    'status'    => 200,
                    'message'   => 'Payment recorded',
                    'data'      => [
                        'internal_transaction_id' => $application['application_number'],
                        'external_transaction_id' => $txCode,
                        'payer_phone_number'      => $application['phone'] ?? '',
                    ],
                ]);
                return;
            }

            $serviceRequest = $this->findServiceRequest($payerCode);
            if ($serviceRequest) {
                // Idempotency — already paid/finalized, or not currently
                // awaiting payment (e.g. a retried/duplicate webhook delivery).
                if (in_array($serviceRequest['status'], ['paid', 'completed'], true)) {
                    http_response_code(200);
                    echo json_encode([
                        'timestamp' => $date,
                        'status'    => 200,
                        'message'   => 'Payment recorded',
                        'duplicate' => true,
                        'data'      => [
                            'internal_transaction_id' => (string)$serviceRequest['request_code'],
                            'external_transaction_id' => $txCode,
                            'payer_phone_number'      => (string)($serviceRequest['phone'] ?? ''),
                        ],
                    ]);
                    return;
                }
                if ($serviceRequest['status'] !== 'awaiting_payment') {
                    http_response_code(200);
                    echo json_encode([
                        'timestamp' => $date,
                        'status'    => 200,
                        'message'   => 'Service request is not awaiting payment',
                        'data'      => [
                            'internal_transaction_id' => (string)$serviceRequest['request_code'],
                            'external_transaction_id' => $txCode,
                            'payer_phone_number'      => (string)($serviceRequest['phone'] ?? ''),
                        ],
                    ]);
                    return;
                }

                $currency = strtoupper(trim($data['currency'] ?? 'RWF')) ?: 'RWF';

                if (!empty($serviceRequest['invoice_id'])) {
                    $stmtInv = $this->db->prepare("UPDATE fee_invoices SET amount_paid = ?, status = 'paid' WHERE id = ?");
                    $stmtInv->bind_param('di', $amount, $serviceRequest['invoice_id']);
                    $stmtInv->execute();
                    $stmtInv->close();
                }

                // Hand off to the modern service layer for the actual status
                // transition (awaiting_payment → paid → submitted → in_review),
                // document-generation hooks, and applicant notification email —
                // single source of truth instead of re-implementing the state
                // machine here. See ServiceRequestService::markPaid().
                try {
                    require_once __DIR__ . '/../backend/vendor/autoload.php';
                    if (is_file(__DIR__ . '/../backend/.env')) {
                        \Dotenv\Dotenv::createImmutable(__DIR__ . '/../backend')->safeLoad();
                    }
                    (new \App\Services\ServiceRequestService())->markPaid((int)$serviceRequest['id'], [
                        'transaction_id' => $txCode,
                        'amount'         => $amount,
                        'currency'       => $currency,
                    ]);
                } catch (\Throwable $e) {
                    http_response_code(500);
                    echo json_encode(['timestamp' => $date, 'status' => 500, 'message' => 'Service request payment update failed: ' . $e->getMessage()]);
                    return;
                }

                http_response_code(200);
                echo json_encode([
                    'timestamp' => $date,
                    'status'    => 200,
                    'message'   => 'Payment recorded',
                    'data'      => [
                        'internal_transaction_id' => $serviceRequest['request_code'],
                        'external_transaction_id' => $txCode,
                        'payer_phone_number'      => $serviceRequest['phone'] ?? '',
                    ],
                ]);
                return;
            }

            http_response_code(404);
            echo json_encode(['timestamp' => $date, 'status' => 404, 'message' => 'Payer not found']);
            return;
        }

        // Idempotency: skip if already recorded
        $stmtChk = $this->db->prepare(
            'SELECT trans_code FROM payment WHERE external_transaction_id = ? LIMIT 1'
        );
        $stmtChk->bind_param('s', $txCode);
        $stmtChk->execute();
        $existing = $stmtChk->get_result()->fetch_assoc();
        $stmtChk->close();

        if ($existing) {
            // Same body as the original success, including the internal
            // transaction code we issued the first time — a retry must be
            // indistinguishable from the first delivery.
            http_response_code(200);
            echo json_encode([
                'timestamp' => $date,
                'status'    => 200,
                'message'   => 'Payment recorded',
                'duplicate' => true,
                'data'      => [
                    'internal_transaction_id' => (string)($existing['trans_code'] ?? ''),
                    'external_transaction_id' => $txCode,
                    'payer_phone_number'      => (string)($student['phone'] ?? ''),
                ],
            ]);
            return;
        }

        $transCode   = $this->makeCode('UP');
        $channel     = 'USSD';
        $feeCategory = $serviceCode ?: '147';
        $levelId     = $student['current_level'] ?? '';
        $accYear     = $student['acc_year'] ?? '';
        $regnumber   = $student['regnumber'];
        $user        = 'UrubutoPay';
        $invoiRef    = 1;
        $remarkVal   = 0;
        $statusVal   = 1;
        $action      = 'Debit';
        $slipNo      = $txCode;
        $desc        = 'UrubutoPay mobile/USSD — ' . ($serviceCode ?: 'unspecified service');

        $stmtIns = $this->db->prepare(
            'INSERT INTO payment
                (trans_code, student, level_id, SESSION, slip_no,
                 invoi_ref, user, acad_cycle_id, date, fee_category, amount,
                 description, recorded_date, Remark, action,
                 external_transaction_id, payment_chanel, payment_notifi, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?)'
        );
        $stmtIns->bind_param(
            'sssssissssdsissssi',
            $transCode, $regnumber, $levelId, $accYear, $slipNo,
            $invoiRef, $user, $accYear, $paymentDate, $feeCategory, $amount,
            $desc, $remarkVal, $action, $txCode, $channel, $action, $statusVal
        );

        if (!$stmtIns->execute()) {
            $err = $stmtIns->error;
            $stmtIns->close();
            http_response_code(500);
            echo json_encode(['timestamp' => $date, 'status' => 500, 'message' => 'Payment insertion failed: ' . $err]);
            return;
        }
        $stmtIns->close();

        // ── Insert into bank_payment ────────────────────────────────────────────
        try {
            $bankId = 1; // UrubutoPay / BK
            $stmtBank = $this->db->prepare(
                'INSERT INTO bank_payment
                    (trans_code, reg_no, level_id, bank_id, slip_no, invoi_ref,
                     user, acad_cycle_id, date, fee_category, amount, description,
                     Remark, action, external_transaction_id, payment_chanel, payment_notifi)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $stmtBank->bind_param(
                'sssssssssssssssss',
                $transCode, $regnumber, $levelId, $bankId, $slipNo, $invoiRef,
                $user, $accYear, $paymentDate, $feeCategory, $amount, $desc,
                $remarkVal, $action, $txCode, $channel, $action
            );
            $stmtBank->execute();
            $stmtBank->close();
        } catch (\Throwable $e) {
            error_log('[LegacySync:bank_payment ERROR] ' . $e->getMessage());
        }

        // Acknowledge FIRST — the money is in the ledger at this point and the
        // gateway has no stake in how long reconciliation takes. Reconciling
        // before answering meant a slow invoice pass was time UrubutoPay spent
        // waiting on an unanswered notification, which is how a successful
        // payment ends up retried and then reversed.
        $this->ackAndFinish([
            'timestamp' => $date,
            'status'    => 200,
            'message'   => 'Payment recorded',
            'data'      => [
                'internal_transaction_id' => $transCode,
                'external_transaction_id' => $txCode,
                'payer_phone_number'      => (string)($student['phone'] ?? ''),
            ],
        ]);

        try {
            require_once __DIR__ . '/payment_reconciler.php';
            (new PaymentReconciler($this->db))->reconcile($transCode);
        } catch (\Throwable $e) {
            error_log('[Callback Reconciler ERROR] ' . $e->getMessage());
        }
    }
}
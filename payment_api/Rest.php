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
        foreach (['Authorization', 'HTTP_AUTHORIZATION'] as $key) {
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

        $newToken  = bin2hex(random_bytes(32));
        $expiresAt = date('Y-m-d H:i:s', time() + 7200); // 2 hours
        $updStmt   = $this->db->prepare(
            'UPDATE api_authorization SET token = ?, token_expires_at = ? WHERE username = ?'
        );
        $updStmt->bind_param('sss', $newToken, $expiresAt, $username);
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
            ],
        ]);
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
        $purposeCode    = trim($data['payment_purpose_code'] ?? '');
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
    //        "service_code":"tuition-fees-1258", "status":"SUCCESSFUL" }
    // ─────────────────────────────────────────────────────────────────────────
    public function claimCallback(array $data): void
    {
        $date         = date('Y-m-d H:i:s');
        $callbackType = trim($data['callback_type']                                          ?? '');
        $txCode       = trim($data['transaction_id']       ?? $data['transaction_code']      ?? '');
        $payerCode    = trim($data['payer_code']                                             ?? '');
        $amount       = (float)($data['amount']                                              ?? 0);
        $paymentDate  = trim($data['payment_date_time']    ?? $data['payment_date']          ?? $date);
        $serviceCode  = trim($data['payment_purpose_code'] ?? $data['service_code']          ?? 'tuition-fees-1258');
        $cbStatus     = strtoupper(trim($data['transaction_status'] ?? $data['status']       ?? ''));

        // Only PAYMENT callbacks touch the ledger; acknowledge others silently
        if ($callbackType !== 'PAYMENT') {
            http_response_code(200);
            echo json_encode(['timestamp' => $date, 'status' => 200, 'message' => 'Callback acknowledged']);
            return;
        }

        if ($txCode === '' || $payerCode === '' || $amount <= 0) {
            http_response_code(400);
            echo json_encode(['timestamp' => $date, 'status' => 400, 'message' => 'Missing required callback fields']);
            return;
        }

        if (!in_array($cbStatus, ['SUCCESSFUL', 'VALID', 'PENDING_SETTLEMENT'], true)) {
            http_response_code(200);
            echo json_encode(['timestamp' => $date, 'status' => 200, 'message' => 'Non-successful payment acknowledged']);
            return;
        }

        $student = $this->lookupStudent($payerCode);
        if (!$student) {
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
            http_response_code(200);
            echo json_encode(['timestamp' => $date, 'status' => 200, 'message' => 'Payment already recorded']);
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
        $desc        = 'UrubutoPay mobile/USSD — ' . $serviceCode;

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

        // Reconcile immediately — callback is async so no client waiting
        try {
            require_once __DIR__ . '/payment_reconciler.php';
            (new PaymentReconciler($this->db))->reconcile($transCode);
        } catch (\Throwable $e) {
            error_log('[Callback Reconciler ERROR] ' . $e->getMessage());
        }

        http_response_code(200);
        echo json_encode([
            'timestamp' => $date,
            'status'    => 200,
            'message'   => 'Payment recorded',
            'data'      => [
                'internal_transaction_id' => $transCode,
                'external_transaction_id' => $txCode,
                'payer_phone_number'      => (string)($student['phone'] ?? ''),
            ],
        ]);
    }
}
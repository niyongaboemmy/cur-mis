<?php
/**
 * CUR Payment API - Main REST Class
 * Database: curac_save
 * Tables used: student, bank_payment, api_authorization
 */

// ── Silence error display; write to server log only ───────────────────────────
ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

// ── Catch any stray output from includes before we send JSON ──────────────────
ob_start();
ob_end_clean();

header('Content-Type: application/json; charset=utf-8');

// ─────────────────────────────────────────────────────────────────────────────
// Token validation (runs on every request that includes this file)
// ─────────────────────────────────────────────────────────────────────────────
function getAuthorizationHeader(): ?string
{
    if (isset($_SERVER['Authorization'])) {
        return trim($_SERVER['Authorization']);
    }
    if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
        return trim($_SERVER['HTTP_AUTHORIZATION']);
    }
    if (function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        $headers = array_combine(
            array_map('ucwords', array_keys($headers)),
            array_values($headers)
        );
        if (isset($headers['Authorization'])) {
            return trim($headers['Authorization']);
        }
    }
    return null;
}

$_tokenHeader = getAuthorizationHeader();
$_tokenParts  = $_tokenHeader ? explode(' ', $_tokenHeader) : [];
$_bearerToken = $_tokenParts[1] ?? '';

$_authConn = new mysqli('localhost', 'curac_save', 'curac_save', 'curac_save');
if ($_authConn->connect_error) {
    http_response_code(500);
    echo json_encode(['timestamp' => date('Y-m-d H:i:s'), 'message' => 'Database connection failed', 'status' => 500]);
    exit;
}
$_authConn->set_charset('utf8mb4');

$_stmtTok = $_authConn->prepare('SELECT id, merchant_code FROM api_authorization WHERE token = ? LIMIT 1');
$_stmtTok->bind_param('s', $_bearerToken);
$_stmtTok->execute();
$_tokResult = $_stmtTok->get_result();
$_stmtTok->close();
$_authConn->close();

if ($_tokResult->num_rows === 0) {
    http_response_code(401);
    echo json_encode(['timestamp' => date('Y-m-d H:i:s'), 'message' => 'Wrong Authentications', 'status' => 401]);
    exit;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rest class
// ─────────────────────────────────────────────────────────────────────────────
class Rest
{
    private mysqli $db;

    // DB credentials
    private string $host     = 'localhost';
    private string $user     = 'curac_save';
    private string $password = 'curac_save';
    private string $database = 'curac_save';

    public function __construct()
    {
        $conn = new mysqli($this->host, $this->user, $this->password, $this->database);
        if ($conn->connect_error) {
            http_response_code(500);
            echo json_encode(['timestamp' => date('Y-m-d H:i:s'), 'message' => 'Database connection failed', 'status' => 500]);
            exit;
        }
        $conn->set_charset('utf8mb4');
        $this->db = $conn;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Generate a unique 8-char alphanumeric code */
    private function makeCode(string $prefix = 'DG'): string
    {
        $chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        $code  = '';
        for ($i = 0; $i < 8; $i++) {
            $code .= $chars[random_int(0, strlen($chars) - 1)];
        }
        return $prefix . '-' . $code;
    }

    /** Validate a merchant code against api_authorization */
    private function merchantExists(string $code): bool
    {
        $stmt = $this->db->prepare('SELECT id FROM api_authorization WHERE merchant_code = ? LIMIT 1');
        $stmt->bind_param('s', $code);
        $stmt->execute();
        $exists = $stmt->get_result()->num_rows > 0;
        $stmt->close();
        return $exists;
    }

    /** Fetch a single active student by registration number */
    private function findStudent(string $regNumber): ?array
    {
        $stmt = $this->db->prepare(
            "SELECT regnumber, fname, lname, faculty, department, std_option,
                    phone, email, acc_year, current_level
             FROM student
             WHERE student_state = 'active' AND regnumber = ?
             LIMIT 1"
        );
        $stmt->bind_param('s', $regNumber);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 1. GET STUDENT  –  POST /api/getstudent.php
    //    Bank calls this to verify a payer before accepting payment.
    //
    //    Request body:
    //      { "payer_code": "1CUR18AK05399", "merchant_code": "TH97990720_1" }
    //
    //    Success (200):
    //      { timestamp, message, status, data:{ merchant_code, payer_code,
    //        payer_names, department_code, department_name, amount, currency,
    //        class_name, payer_must_pay_total_amount, comment } }
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

        // Strip leading zeros that some bank systems add
        $cleanCode = ltrim($payerCode, '0');
        $student   = $this->findStudent($cleanCode) ?? $this->findStudent($payerCode);

        if (!$student) {
            http_response_code(404);
            echo json_encode(['timestamp' => $date, 'message' => 'No active student found for code: ' . $payerCode, 'status' => 404]);
            return;
        }

        http_response_code(200);
        echo json_encode([
            'timestamp' => $date,
            'message'   => 'Successful',
            'status'    => 200,
            'data'      => [
                'merchant_code'               => $merchantCode,
                'payer_code'                  => $student['regnumber'],
                'payer_names'                 => trim($student['fname'] . ' ' . $student['lname']),
                'department_code'             => $student['faculty'],
                'department_name'             => $student['department'],
                'amount'                      => 0,
                'currency'                    => 'RWF',
                'class_name'                  => $student['department'],
                'payer_must_pay_total_amount' => 'NO',
                'comment'                     => '',
            ],
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. INSERT PAYMENT  –  POST /api/payment.php
    //    Records a bank payment into bank_payment table.
    //
    //    Request body:
    //      { "payer_code", "transaction_id", "payment_channel",
    //        "bank_account", "initial_slip_number", "slip_number",
    //        "amount", "term", "academic_year", "payment_date_time",
    //        "payment_purpose_code", "merchant_code" }
    //
    //    Success (200):
    //      { timestamp, message, status, data:{ external_transaction_id,
    //        internal_transaction_id, payer_phone_number, payer_email } }
    // ─────────────────────────────────────────────────────────────────────────
    public function insertPayment(array $data): void
    {
        $date            = date('Y-m-d H:i:s');
        $regNumber       = trim($data['payer_code']           ?? '');
        $transactionId   = trim($data['transaction_id']       ?? '');
        $paymentChannel  = trim($data['payment_channel']      ?? '');
        $bankAccount     = trim($data['bank_account']         ?? '');
        $initialSlip     = trim($data['initial_slip_number']  ?? '');
        $slipNumber      = trim($data['slip_number']          ?? '');
        $amount          = (float)($data['amount']            ?? 0);
        $term            = trim($data['term']                 ?? '');
        $academicYear    = trim($data['academic_year']        ?? '');
        $paymentDate     = trim($data['payment_date_time']    ?? $date);
        $purposeCode     = trim($data['payment_purpose_code'] ?? '');
        $merchantCode    = trim($data['merchant_code']        ?? '');

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

        // ── Find active student ───────────────────────────────────────────────
        $cleanCode = ltrim($regNumber, '0');
        $student   = $this->findStudent($cleanCode) ?? $this->findStudent($regNumber);

        if (!$student) {
            http_response_code(404);
            echo json_encode(['timestamp' => $date, 'message' => 'No active student found for code: ' . $regNumber, 'status' => 404]);
            return;
        }

        $phone = $student['phone']   ?? '';
        $email = $student['email']   ?? '';
        $accYr = $student['acc_year'] ?? $academicYear;

        // ── Validate bank account ─────────────────────────────────────────────
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
        $bankId = $resBk->fetch_assoc()['bank_id'];

        // ── Check for duplicate transaction ───────────────────────────────────
        $stmtChk = $this->db->prepare(
            'SELECT trans_code, amount FROM bank_payment WHERE external_transaction_id = ? LIMIT 1'
        );
        $stmtChk->bind_param('s', $transactionId);
        $stmtChk->execute();
        $resChk = $stmtChk->get_result();
        $stmtChk->close();

        if ($resChk->num_rows > 0) {
            $existing = $resChk->fetch_assoc();

            // Idempotent: same amount → update slip and return success
            if ((float)$existing['amount'] === $amount) {
                $stmtUp = $this->db->prepare(
                    'UPDATE bank_payment SET slip_no = ? WHERE external_transaction_id = ?'
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

            // Different amount → reject as duplicate with wrong amount
            http_response_code(409);
            echo json_encode([
                'timestamp' => $date,
                'message'   => 'Transaction already exists with a different amount: ' . $transactionId,
                'status'    => 409,
            ]);
            return;
        }

        // ── Insert new bank payment ───────────────────────────────────────────
        $transCode   = $this->makeCode('DG');
        $user        = 'UrubutoPay';
        $invoiRef    = 1;
        $feeCategory = $purposeCode !== '' ? $purposeCode : '147';
        $action      = 'Debit';

        $stmtIns = $this->db->prepare(
            'INSERT INTO bank_payment
                (trans_code, reg_no, level_id, bank_id, slip_no, invoi_ref, user,
                 acad_cycle_id, date, fee_category, amount, description, Remark,
                 recorded_date, action, external_transaction_id, payment_chanel, payment_notifi)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?)'
        );

        $levelId     = $student['current_level'] ?? $term;
        $description = 'Bank payment via ' . $paymentChannel;
        $remarkVal   = 0; // int column, default to 0

        $stmtIns->bind_param(
            'ssiisississsiisss',
            $transCode,
            $student['regnumber'],
            $levelId,
            $bankId,
            $slipNumber,
            $invoiRef,
            $user,
            $accYr,
            $paymentDate,
            $feeCategory,
            $amount,
            $description,
            $remarkVal,
            $action,
            $transactionId,
            $paymentChannel,
            $action           // payment_notifi defaults to 'Debit'
        );

        if (!$stmtIns->execute()) {
            $err = $stmtIns->error;
            $stmtIns->close();
            http_response_code(500);
            echo json_encode(['timestamp' => $date, 'message' => 'Payment insertion failed: ' . $err, 'status' => 500]);
            return;
        }
        $stmtIns->close();

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
    //    Creates a credit (reversal) entry in bank_payment.
    //
    //    Request body:
    //      { "transaction_id": "<bank_ext_id>",
    //        "external_transaction_id": "<internal_trans_code>",
    //        "amount": 50000,
    //        "merchant_code": "TH97990720_1" }
    // ─────────────────────────────────────────────────────────────────────────
    public function delete_transaction(array $rows): void
    {
        $date            = date('Y-m-d H:i:s');
        $transactionId   = trim($rows['transaction_id']          ?? '');
        $externalTransId = trim($rows['external_transaction_id'] ?? '');
        $amount          = (float)($rows['amount']               ?? 0);

        if ($transactionId === '') {
            http_response_code(400);
            echo json_encode(['timestamp' => $date, 'message' => 'transaction_id is required', 'status' => 400]);
            return;
        }

        // Find original payment
        $stmt = $this->db->prepare(
            'SELECT trans_code, reg_no, bank_id, slip_no, Remark, payment_chanel, amount
             FROM bank_payment
             WHERE external_transaction_id = ?
               AND payment_notifi = \'Debit\'
             ORDER BY recorded_date DESC LIMIT 1'
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
        $reversalCode   = $this->makeCode('GD');
        $reversalAmount = $amount > 0 ? $amount : (float)$orig['amount'];
        $user           = 'UrubutoPay';
        $feeCategory    = '146'; // credit/reversal category
        $description    = 'Reversal of ' . $orig['trans_code'];

        // Get student contact info
        $phone = '';
        $email = '';
        $stmtSt = $this->db->prepare('SELECT phone, email FROM student WHERE regnumber = ? LIMIT 1');
        $stmtSt->bind_param('s', $orig['reg_no']);
        $stmtSt->execute();
        $resSt = $stmtSt->get_result()->fetch_assoc();
        $stmtSt->close();
        if ($resSt) {
            $phone = $resSt['phone'] ?? '';
            $email = $resSt['email'] ?? '';
        }

        $stmtRev = $this->db->prepare(
            'INSERT INTO bank_payment
                (trans_code, reg_no, bank_id, slip_no, user, date, fee_category,
                 amount, description, recorded_date, Remark,
                 external_transaction_id, payment_chanel, payment_notifi)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?)'
        );

        $notif   = 'Credit';
        $remarkV = (int)$orig['Remark'];

        $stmtRev->bind_param(
            'ssissssdsisss',
            $reversalCode,
            $orig['reg_no'],
            $orig['bank_id'],
            $orig['slip_no'],
            $user,
            $date,
            $feeCategory,
            $reversalAmount,
            $description,
            $remarkV,
            $transactionId,
            $orig['payment_chanel'],
            $notif
        );

        if (!$stmtRev->execute()) {
            $err = $stmtRev->error;
            $stmtRev->close();
            http_response_code(500);
            echo json_encode(['timestamp' => $date, 'message' => 'Reversal failed: ' . $err, 'status' => 500]);
            return;
        }
        $stmtRev->close();

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
    //    Updates slip number or status on an existing bank payment.
    //
    //    Request body:
    //      { "transaction_id": "<bank_ext_id>", "slip_number": "...",
    //        "status": 1 }   (status: 1=confirmed, 0=pending)
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

        // Build dynamic update
        $setParts = [];
        $types    = '';
        $binds    = [];

        if ($slipNumber !== '') {
            $setParts[] = 'slip_no = ?';
            $types     .= 's';
            $binds[]    = $slipNumber;
        }
        if ($status !== null) {
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

        $sql  = 'UPDATE bank_payment SET ' . implode(', ', $setParts) . ' WHERE external_transaction_id = ?';
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
}

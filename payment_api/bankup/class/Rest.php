<?php
/**
 * CUR Payment API - Main REST Class
 * Organisation: Catholic University of Rwanda (CUR)
 * Merchant Code: TH90989816
 * Services: the 22 services registered on the merchant account — see
 * CUR_SERVICES below, and the `urubuto_services` catalogue (migration 134)
 * which is the authoritative mapping used by the main backend.
 *
 * Database: curac_save  |  Table: payment
 */

ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

ob_start(); ob_end_clean();
header('Content-Type: application/json; charset=utf-8');

// ── Token validation ───────────────────────────────────────────────────────
function getAuthorizationHeader(): ?string {
    if (isset($_SERVER['Authorization']))      return trim($_SERVER['Authorization']);
    if (isset($_SERVER['HTTP_AUTHORIZATION'])) return trim($_SERVER['HTTP_AUTHORIZATION']);
    if (function_exists('apache_request_headers')) {
        $h = apache_request_headers();
        $h = array_combine(array_map('ucwords', array_keys($h)), array_values($h));
        if (isset($h['Authorization'])) return trim($h['Authorization']);
    }
    return null;
}

$_tokenParts  = explode(' ', getAuthorizationHeader() ?? '');
$_bearerToken = $_tokenParts[1] ?? '';

$_authConn = new mysqli('localhost', 'curac_save', 'curac_save', 'curac_save');
if ($_authConn->connect_error) {
    http_response_code(500);
    echo json_encode(['timestamp'=>date('Y-m-d H:i:s'),'message'=>'Database connection failed','status'=>500]);
    exit;
}
$_authConn->set_charset('utf8mb4');
$_st = $_authConn->prepare('SELECT id FROM api_authorization WHERE token = ? LIMIT 1');
$_st->bind_param('s', $_bearerToken);
$_st->execute();
$_tokResult = $_st->get_result();
$_st->close(); $_authConn->close();

if ($_tokResult->num_rows === 0) {
    http_response_code(401);
    echo json_encode(['timestamp'=>date('Y-m-d H:i:s'),'message'=>'Wrong Authentications','status'=>401]);
    exit;
}

// ── CUR Constants ──────────────────────────────────────────────────────────
define('CUR_MERCHANT_CODE', 'TH90989816');
// UrubutoPay-registered services, mirrored from the `urubuto_services`
// catalogue (migration 134). This endpoint runs standalone against curac_save,
// so the list is duplicated here rather than queried — keep the two in step
// when UrubutoPay registers or retires a service.
define('CUR_SERVICES', [
    'tuition-fees-4679'          => 'TUITION FEES',
    'registration-fees-9493'     => 'Registration fees',
    'cursu-fees-5227'            => 'CURSU fees',
    'technology-fees-9754'       => 'Technology fees',
    'fines-1062'                 => 'Fines',
    'retake-5953'                => 'Retake',
    'reintegration-fees-2417'    => 'Re-integration fees',
    '1st-internship-fees-7088'   => '1st Internship fees',
    '2nd-internship-fees-3365'   => '2nd Internship fees',
    'final-project-fees-9014'    => 'Final project fees',
    'cpa-foundation1-6821'       => 'CPA foundation1',
    'cpa-foundation2-7872'       => 'CPA foundation2',
    'cpa-advanced-8607'          => 'CPA Advanced',
    'cpa-registration-fee-2199'  => 'CPA registration fee',
    'graduation-fees-8196'       => 'Graduation fees',
    'other-fees-8272'            => 'Other fees',
    'transcript-1712'            => 'Transcript',
    'to-whom-1604'               => 'To whom',
    'english-certificate-4298'   => 'English certificate',
    'covered-module-report-8800' => 'Covered module report',
    'recommendation-letter-6660' => 'Recommendation letter',
    'application-fees-6590'      => 'Application fees',
    // Retired codes from the previous merchant registration — still accepted so
    // in-flight payments do not bounce with a 400.
    'tuition-fees-1258'          => 'TUITION FEES',
    'cursu-fees-8249'            => 'CURSU FEES',
]);

// ── REST Class ─────────────────────────────────────────────────────────────
class Rest {
    private mysqli $db;

    public function __construct() {
        $conn = new mysqli('localhost', 'curac_save', 'curac_save', 'curac_save');
        if ($conn->connect_error) {
            http_response_code(500);
            echo json_encode(['timestamp'=>date('Y-m-d H:i:s'),'message'=>'Database connection failed','status'=>500]);
            exit;
        }
        $conn->set_charset('utf8mb4');
        $this->db = $conn;
    }

    private function makeCode(string $prefix = 'DG'): string {
        $chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        $code = '';
        for ($i = 0; $i < 8; $i++) $code .= $chars[random_int(0, 35)];
        return $prefix . '-' . $code;
    }

    private function merchantExists(string $code): bool {
        $s = $this->db->prepare('SELECT id FROM api_authorization WHERE merchant_code = ? LIMIT 1');
        $s->bind_param('s', $code); $s->execute();
        $ok = $s->get_result()->num_rows > 0; $s->close();
        return $ok;
    }

    private function serviceExists(string $code): bool {
        return array_key_exists($code, CUR_SERVICES);
    }

    private function findStudent(string $reg): ?array {
        $s = $this->db->prepare(
            "SELECT regnumber,fname,lname,faculty,department,phone,email,acc_year,current_level
             FROM student WHERE student_state='active' AND regnumber=? LIMIT 1"
        );
        $s->bind_param('s', $reg); $s->execute();
        $row = $s->get_result()->fetch_assoc(); $s->close();
        return $row ?: null;
    }

    // ── 1. GET STUDENT ─────────────────────────────────────────────────────
    public function getStudent(array $input): void {
        $d = date('Y-m-d H:i:s');
        $payer = trim($input['payer_code'] ?? '');
        $merchant = trim($input['merchant_code'] ?? '');

        if ($payer === '' || $merchant === '') {
            http_response_code(400);
            echo json_encode(['timestamp'=>$d,'message'=>'payer_code and merchant_code are required','status'=>400]);
            return;
        }
        if (!$this->merchantExists($merchant)) {
            http_response_code(404);
            echo json_encode(['timestamp'=>$d,'message'=>'Invalid merchant code: '.$merchant,'status'=>404]);
            return;
        }
        $student = $this->findStudent(ltrim($payer,'0')) ?? $this->findStudent($payer);
        if (!$student) {
            http_response_code(404);
            echo json_encode(['timestamp'=>$d,'status'=>404,'message'=>'no data found for the given payer code']);
            return;
        }
        http_response_code(200);
        echo json_encode(['timestamp'=>$d,'status'=>200,'message'=>'validated successfully','data'=>[
            'merchant_code'               => $merchant,
            'payer_code'                  => $student['regnumber'],
            'payer_names'                 => strtoupper(trim($student['fname'].' '.$student['lname'])),
            'currency'                    => 'RWF',
            'payer_must_pay_total_amount' => 'NO',
            'amount'                      => 0,
            'comment'                     => 'school fees',
        ]]);
    }

    // ── 2. INSERT PAYMENT (writes to `payment` table) ──────────────────────
    public function insertPayment(array $data): void {
        $d            = date('Y-m-d H:i:s');
        $regNumber    = trim($data['payer_code']           ?? '');
        $merchantCode = trim($data['merchant_code']        ?? '');
        $serviceCode  = trim($data['service_code']         ?? '');
        $txId         = trim($data['transaction_id']       ?? '');
        $channel      = trim($data['payment_channel']      ?? '');
        $bankAccount  = trim($data['bank_account']         ?? '');
        $slipNo       = trim($data['slip_number']          ?? '');
        $amount       = (float)($data['amount']            ?? 0);
        $term         = trim($data['term']                 ?? '');
        $acadYear     = trim($data['academic_year']        ?? '');
        $payDate      = trim($data['payment_date_time']    ?? $d);
        $purposeCode  = trim($data['payment_purpose_code'] ?? '');

        if ($regNumber === '' || $txId === '') {
            http_response_code(400);
            echo json_encode(['timestamp'=>$d,'message'=>'payer_code and transaction_id are required','status'=>400]);
            return;
        }
        if ($merchantCode !== '' && !$this->merchantExists($merchantCode)) {
            http_response_code(404);
            echo json_encode(['timestamp'=>$d,'message'=>'Invalid merchant code: '.$merchantCode,'status'=>404]);
            return;
        }
        if ($serviceCode !== '' && !$this->serviceExists($serviceCode)) {
            http_response_code(400);
            echo json_encode(['timestamp'=>$d,'message'=>'Invalid service_code: '.$serviceCode.'. Valid: '.implode(', ', array_keys(CUR_SERVICES)),'status'=>400]);
            return;
        }

        $student = $this->findStudent(ltrim($regNumber,'0')) ?? $this->findStudent($regNumber);
        if (!$student) {
            http_response_code(404);
            echo json_encode(['timestamp'=>$d,'message'=>'No active student found for: '.$regNumber,'status'=>404]);
            return;
        }

        $phone = $student['phone']    ?? '';
        $email = $student['email']    ?? '';
        $accYr = $student['acc_year'] ?? $acadYear;

        // Validate bank account
        $sb = $this->db->prepare('SELECT bank_id FROM tbl_bank WHERE account_no=? LIMIT 1');
        $sb->bind_param('s', $bankAccount); $sb->execute();
        $rb = $sb->get_result(); $sb->close();
        if ($rb->num_rows === 0) {
            http_response_code(404);
            echo json_encode(['timestamp'=>$d,'message'=>'Bank account not found: '.$bankAccount,'status'=>404]);
            return;
        }
        $bankId = $rb->fetch_assoc()['bank_id'];

        // Duplicate check
        $sc = $this->db->prepare('SELECT trans_code, amount FROM payment WHERE external_transaction_id=? LIMIT 1');
        $sc->bind_param('s', $txId); $sc->execute();
        $rc = $sc->get_result(); $sc->close();
        if ($rc->num_rows > 0) {
            $ex = $rc->fetch_assoc();
            if ((float)$ex['amount'] === $amount) {
                $su = $this->db->prepare('UPDATE payment SET slip_no=? WHERE external_transaction_id=?');
                $su->bind_param('ss', $slipNo, $txId); $su->execute(); $su->close();
                http_response_code(200);
                echo json_encode(['timestamp'=>$d,'message'=>'Successful','status'=>200,'data'=>[
                    'external_transaction_id'=>$txId,'internal_transaction_id'=>$ex['trans_code'],
                    'payer_phone_number'=>$phone,'payer_email'=>$email,
                ]]);
                return;
            }
            http_response_code(409);
            echo json_encode(['timestamp'=>$d,'message'=>'Duplicate transaction with different amount: '.$txId,'status'=>409]);
            return;
        }

        // Build fee_category: prefer service_code, fallback to purpose_code, then default
        $transCode   = $this->makeCode('DG');
        $feeCategory = $serviceCode ?: ($purposeCode ?: '147');
        $levelId     = $student['current_level'] ?? $term;
        $desc        = 'Bank payment via '.$channel.' | '.(CUR_SERVICES[$serviceCode] ?? 'General');
        $action      = 'Debit';
        $notifi      = 'Debit';
        $invoiRef    = 1;
        $remarkVal   = 0;
        $statusVal   = 0; // 0=Pending; update via /api/update.php after bank confirms

        $si = $this->db->prepare(
            'INSERT INTO payment
               (trans_code, student, level_id, SESSION, bank_id, slip_no, invoi_ref,
                user, acad_cycle_id, date, fee_category, amount, description,
                recorded_date, Remark, action, external_transaction_id,
                payment_chanel, payment_notifi, status)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?,?,?,?,?,?)'
        );
        $user = 'BankAPI';
        $si->bind_param('ssssissssssdsissssi',
            $transCode, $student['regnumber'], $levelId, $accYr, $bankId,
            $slipNo, $invoiRef, $user, $accYr, $payDate, $feeCategory,
            $amount, $desc, $remarkVal, $action, $txId, $channel, $notifi, $statusVal
        );

        if (!$si->execute()) {
            $err = $si->error; $si->close();
            http_response_code(500);
            echo json_encode(['timestamp'=>$d,'message'=>'Payment insertion failed: '.$err,'status'=>500]);
            return;
        }
        $si->close();

        http_response_code(200);
        echo json_encode(['timestamp'=>$d,'message'=>'Successful','status'=>200,'data'=>[
            'external_transaction_id' => $txId,
            'internal_transaction_id' => $transCode,
            'payer_phone_number'      => $phone,
            'payer_email'             => $email,
        ]]);
    }

    // ── 3. CANCEL / REVERSE PAYMENT ────────────────────────────────────────
    public function delete_transaction(array $rows): void {
        $d    = date('Y-m-d H:i:s');
        $txId = trim($rows['transaction_id'] ?? '');
        $amt  = (float)($rows['amount'] ?? 0);

        if ($txId === '') {
            http_response_code(400);
            echo json_encode(['timestamp'=>$d,'message'=>'transaction_id is required','status'=>400]);
            return;
        }
        $s = $this->db->prepare(
            "SELECT trans_code,student,bank_id,slip_no,Remark,payment_chanel,amount,SESSION
             FROM payment WHERE external_transaction_id=? AND payment_notifi='Debit'
             ORDER BY recorded_date DESC LIMIT 1"
        );
        $s->bind_param('s', $txId); $s->execute();
        $res = $s->get_result(); $s->close();
        if ($res->num_rows === 0) {
            http_response_code(404);
            echo json_encode(['timestamp'=>$d,'message'=>'Original payment not found: '.$txId,'status'=>404]);
            return;
        }

        $orig   = $res->fetch_assoc();
        $revCode = $this->makeCode('GD');
        $revAmt  = $amt > 0 ? $amt : (float)$orig['amount'];
        $desc    = 'Reversal of '.$orig['trans_code'];
        $user    = 'BankAPI';
        $fee     = '146';
        $action  = 'Credit';
        $notif   = 'Credit';
        $rmk     = (int)$orig['Remark'];
        $status  = 0;

        $phone = ''; $email = '';
        $ss = $this->db->prepare('SELECT phone,email FROM student WHERE regnumber=? LIMIT 1');
        $ss->bind_param('s', $orig['student']); $ss->execute();
        $rs = $ss->get_result()->fetch_assoc(); $ss->close();
        if ($rs) { $phone = $rs['phone']??''; $email = $rs['email']??''; }

        $sr = $this->db->prepare(
            'INSERT INTO payment
               (trans_code,student,bank_id,slip_no,user,SESSION,date,fee_category,
                amount,description,recorded_date,Remark,action,
                external_transaction_id,payment_chanel,payment_notifi,status)
             VALUES (?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?,?,?,?,?,?)'
        );
        $sr->bind_param('ssisssssdsisssssi',
            $revCode,$orig['student'],$orig['bank_id'],$orig['slip_no'],
            $user,$orig['SESSION'],$d,$fee,$revAmt,$desc,
            $rmk,$action,$txId,$orig['payment_chanel'],$notif,$status
        );

        if (!$sr->execute()) {
            $err = $sr->error; $sr->close();
            http_response_code(500);
            echo json_encode(['timestamp'=>$d,'message'=>'Reversal failed: '.$err,'status'=>500]);
            return;
        }
        $sr->close();

        http_response_code(200);
        echo json_encode(['timestamp'=>$d,'message'=>'Successful','status'=>200,'data'=>[
            'external_transaction_id' => $txId,
            'internal_transaction_id' => $revCode,
            'payer_phone_number'      => $phone,
            'payer_email'             => $email,
        ]]);
    }

    // ── 4. UPDATE PAYMENT ──────────────────────────────────────────────────
    public function update_new(array $data): void {
        $d    = date('Y-m-d H:i:s');
        $txId = trim($data['transaction_id'] ?? '');
        $slip = trim($data['slip_number']    ?? '');
        $status = isset($data['status']) ? (int)$data['status'] : null;

        if ($txId === '') {
            http_response_code(400);
            echo json_encode(['timestamp'=>$d,'message'=>'transaction_id is required','status'=>400]);
            return;
        }

        $sets = []; $types = ''; $binds = [];
        if ($slip !== '') { $sets[] = 'slip_no = ?';  $types .= 's'; $binds[] = $slip; }
        if ($status !== null) {
            $sets[]  = 'action = ?';  $types .= 's'; $binds[] = ($status===1)?'Confirmed':'Pending';
            $sets[]  = 'status = ?';  $types .= 'i'; $binds[] = $status;
        }
        if (empty($sets)) {
            http_response_code(400);
            echo json_encode(['timestamp'=>$d,'message'=>'Nothing to update','status'=>400]);
            return;
        }
        $types .= 's'; $binds[] = $txId;
        $sql = 'UPDATE payment SET '.implode(', ', $sets).' WHERE external_transaction_id = ?';
        $st  = $this->db->prepare($sql);
        $st->bind_param($types, ...$binds); $st->execute();
        $affected = $st->affected_rows; $st->close();

        if ($affected === 0) {
            http_response_code(404);
            echo json_encode(['timestamp'=>$d,'message'=>'No payment found for: '.$txId,'status'=>404]);
            return;
        }
        http_response_code(200);
        echo json_encode(['timestamp'=>$d,'message'=>'Successful','status'=>200]);
    }

    // ── 5. PAYMENT CALLBACK (UrubutoPay → institution) ─────────────────────
    public function claimCallback(array $data): void {
        $d            = date('Y-m-d H:i:s');
        $type         = trim($data['callback_type']   ?? '');
        $txCode       = trim($data['transaction_code'] ?? '');
        $payerCode    = trim($data['payer_code']       ?? '');
        $amount       = (float)($data['amount']        ?? 0);
        $payDate      = trim($data['payment_date']     ?? $d);
        // No default: defaulting to tuition here recorded every payment, of
        // whatever service, as TUITION. Unknown/absent leaves fee_category on
        // the generic '147' below. Mirrors Rest::resolveCallbackServiceCode().
        $serviceCode  = trim($data['service_code'] ?? $data['payment_purpose_code'] ?? $data['serviceCode'] ?? '');
        if ($serviceCode !== '' && !isset(CUR_SERVICES[$serviceCode])) {
            // Not a code — accept the display name UrubutoPay shows on the menu.
            $slug  = preg_replace('/[^a-z0-9]+/', '', strtolower($serviceCode)) ?? '';
            $named = '';
            foreach (CUR_SERVICES as $code => $name) {
                if ($slug !== '' && $slug === (preg_replace('/[^a-z0-9]+/', '', strtolower((string)$name)) ?? '')) {
                    $named = (string)$code;
                    break;
                }
            }
            // A code-shaped value this copy has not been told about (the list
            // above is a manual mirror) is kept rather than discarded.
            if ($named === '' && !preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)+$/i', $serviceCode)) {
                $named = '';
                $serviceCode = '';
            }
            if ($named !== '') {
                $serviceCode = $named;
            }
        }
        $cbStatus     = trim($data['status']           ?? '');

        if ($type !== 'PAYMENT') {
            http_response_code(200);
            echo json_encode(['timestamp'=>$d,'status'=>200,'message'=>'Callback acknowledged']);
            return;
        }
        if ($txCode === '' || $payerCode === '' || $amount <= 0) {
            http_response_code(400);
            echo json_encode(['timestamp'=>$d,'status'=>400,'message'=>'Missing required callback fields']);
            return;
        }
        if ($cbStatus !== 'SUCCESSFUL') {
            http_response_code(200);
            echo json_encode(['timestamp'=>$d,'status'=>200,'message'=>'Non-successful payment acknowledged']);
            return;
        }

        $student = $this->findStudent(ltrim($payerCode,'0')) ?? $this->findStudent($payerCode);
        if (!$student) {
            http_response_code(404);
            echo json_encode(['timestamp'=>$d,'status'=>404,'message'=>'Payer not found']);
            return;
        }

        $sc = $this->db->prepare('SELECT trans_code FROM payment WHERE external_transaction_id=? LIMIT 1');
        $sc->bind_param('s',$txCode); $sc->execute();
        if ($sc->get_result()->num_rows > 0) {
            $sc->close();
            http_response_code(200);
            echo json_encode(['timestamp'=>$d,'status'=>200,'message'=>'Payment already recorded']);
            return;
        }
        $sc->close();

        $transCode   = $this->makeCode('UP');
        $regnumber   = $student['regnumber'];
        $levelId     = $student['current_level'] ?? '';
        $accYr       = $student['acc_year'] ?? '';
        $feeCategory = $serviceCode ?: '147';
        $channel     = 'USSD';
        $user        = 'UrubutoPay';
        $invoiRef    = 1; $remarkVal = 0; $statusVal = 1;
        $action      = 'Debit';
        $desc        = 'UrubutoPay mobile/USSD — '.$serviceCode;

        $si = $this->db->prepare(
            'INSERT INTO payment
               (trans_code,student,level_id,SESSION,slip_no,invoi_ref,user,acad_cycle_id,
                date,fee_category,amount,description,recorded_date,Remark,action,
                external_transaction_id,payment_chanel,payment_notifi,status)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?,?,?,?,?,?)'
        );
        $si->bind_param('sssssissssdsissssi',
            $transCode,$regnumber,$levelId,$accYr,$txCode,$invoiRef,$user,$accYr,
            $payDate,$feeCategory,$amount,$desc,$remarkVal,$action,
            $txCode,$channel,$action,$statusVal
        );

        if (!$si->execute()) {
            $err = $si->error; $si->close();
            http_response_code(500);
            echo json_encode(['timestamp'=>$d,'status'=>500,'message'=>'Payment insertion failed: '.$err]);
            return;
        }
        $si->close();

        try {
            require_once dirname(__DIR__,2).'/payment_reconciler.php';
            (new PaymentReconciler($this->db))->reconcile($transCode);
        } catch (\Throwable $e) {
            error_log('[Callback Reconciler ERROR] '.$e->getMessage());
        }

        http_response_code(200);
        echo json_encode(['timestamp'=>$d,'status'=>200,'message'=>'Payment recorded']);
    }
}
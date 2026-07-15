<?php

declare(strict_types=1);

/**
 * RBAC regression suite — Phase 0 (see MIS_REVISION_REQUEST_IMPLEMENTATION_PLAN.md
 * §3 Phase 0 and §6 RBAC Audit).
 *
 * Logs in as one dedicated test account per role (finance_officer, registrar,
 * hr_manager, admin) through the real HTTP API — login -> OTP verify -> bearer
 * token — then hits real endpoints with that token and asserts the status
 * code the client's Can-View / Cannot-Access matrix requires.
 *
 * This is a reusable regression check: re-run it after every later phase's
 * backend work lands (`php backend/scripts/rbac_regression_test.php`).
 * Exit code is 0 if every assertion passed, 1 otherwise, so it's CI-usable.
 *
 * Requires: the app reachable over HTTP at APP_URL (.env) and DB reachable
 * with the same credentials the app uses. Test accounts are provisioned
 * idempotently (upsert by email) — safe to re-run.
 */

require_once __DIR__ . '/../vendor/autoload.php';
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
$dotenv->load();

$baseUrl = rtrim($argv[1] ?? getenv('RBAC_TEST_BASE_URL') ?: ($_ENV['APP_URL'] ?? 'http://localhost:8888/cur-mis/backend/public'), '/');

$pdo = new PDO(
    sprintf(
        'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
        $_ENV['DB_HOST'] ?? '127.0.0.1',
        $_ENV['DB_PORT'] ?? '8889',
        $_ENV['DB_DATABASE'] ?? 'curac_save'
    ),
    $_ENV['DB_USERNAME'] ?? 'root',
    $_ENV['DB_PASSWORD'] ?? 'root'
);
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

const TEST_PASSWORD = 'RbacTest#2026!';

$testAccounts = [
    'finance_officer' => 'qa_rbac_finance@test.local',
    'registrar'       => 'qa_rbac_registrar@test.local',
    'hr_manager'      => 'qa_rbac_hr@test.local',
    'admin'           => 'qa_rbac_admin@test.local',
];

// ── Test matrix — grounded in the client's Cannot-Access column as summarized
// in the plan's §2.6/§4/Phase 6 ("Finance ⛔ HR salaries & registrar academic
// non-financial data; Registrar ⛔ budget & payroll"; "Confirm HR data
// returns 403 for Finance/Registrar accounts"). If the actual attached
// MIS_Fix_Request.pdf matrix differs, update this matrix to match it. ────────
$matrix = [
    // role              method  path                        expect  reason
    ['finance_officer', 'GET', '/api/finance/structures',   200, 'Can-View: Finance own module'],
    ['registrar',       'GET', '/api/students',             200, 'Can-View: Registrar own module'],
    ['hr_manager',      'GET', '/api/employees',            200, 'Can-View: HR own module'],
    ['hr_manager',      'GET', '/api/hr/payroll',           200, 'Can-View: HR own module'],
    ['admin',           'GET', '/api/finance/structures',   200, 'Can-View: Admin bypass'],
    ['admin',           'GET', '/api/employees',            200, 'Can-View: Admin bypass'],
    ['admin',           'GET', '/api/hr/payroll',           200, 'Can-View: Admin bypass'],
    ['admin',           'GET', '/api/students',             200, 'Can-View: Admin bypass'],

    ['finance_officer', 'GET', '/api/hr/payroll',           403, 'Cannot-Access: Finance <> HR salaries'],
    ['finance_officer', 'GET', '/api/employees',            403, 'Cannot-Access: Finance <> HR data (Phase 6)'],
    ['finance_officer', 'GET', '/api/students',             403, 'Cannot-Access: Finance <> registrar academic data'],
    ['registrar',       'GET', '/api/finance/structures',   403, 'Cannot-Access: Registrar <> budget/finance'],
    ['registrar',       'GET', '/api/finance/budgets',      403, 'Cannot-Access: Registrar <> budget'],
    ['registrar',       'GET', '/api/hr/payroll',           403, 'Cannot-Access: Registrar <> payroll'],
    ['registrar',       'GET', '/api/employees',            403, 'Cannot-Access: Registrar <> HR data (Phase 6)'],
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function httpRequest(string $baseUrl, string $method, string $path, array $body = [], ?string $token = null): array
{
    $ch = curl_init($baseUrl . $path);
    $headers = ['Content-Type: application/json'];
    if ($token !== null) {
        $headers[] = 'Authorization: Bearer ' . $token;
    }
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => $headers,
        CURLOPT_TIMEOUT        => 30,
    ]);
    if (!empty($body)) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }
    $raw    = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err    = curl_error($ch);
    curl_close($ch);

    if ($raw === false) {
        throw new RuntimeException("HTTP request to $path failed: $err");
    }

    $decoded = json_decode($raw, true);
    return ['status' => $status, 'body' => $decoded ?? []];
}

function ensureTestUser(PDO $pdo, string $roleName, string $email): void
{
    $role = $pdo->prepare('SELECT id FROM roles WHERE name = ?');
    $role->execute([$roleName]);
    $roleId = $role->fetchColumn();
    if (!$roleId) {
        throw new RuntimeException("Role '$roleName' not found — cannot provision test account.");
    }

    $existing = $pdo->prepare('SELECT id FROM users WHERE email = ?');
    $existing->execute([$email]);
    $userId = $existing->fetchColumn();

    $hash = password_hash(TEST_PASSWORD, PASSWORD_BCRYPT);

    if ($userId) {
        $pdo->prepare('UPDATE users SET password = ?, role_id = ?, is_active = 1 WHERE id = ?')
            ->execute([$hash, $roleId, $userId]);
        return;
    }

    $username = 'qa_rbac_' . strtolower($roleName);
    $pdo->prepare('INSERT INTO users (username, password, full_name, email, role_id, is_active, is_applicant) VALUES (?, ?, ?, ?, ?, 1, 0)')
        ->execute([$username, $hash, "QA RBAC Test ($roleName)", $email, $roleId]);
}

function loginAndGetToken(PDO $pdo, string $baseUrl, string $email): string
{
    $login = httpRequest($baseUrl, 'POST', '/api/auth/login', [
        'email'    => $email,
        'password' => TEST_PASSWORD,
    ]);

    if ($login['status'] !== 200 || !($login['body']['success'] ?? false)) {
        throw new RuntimeException("Login failed for $email: " . json_encode($login));
    }

    $otp = $login['body']['data']['dev_otp'] ?? null;

    if ($otp === null) {
        // APP_DEBUG is off — read the OTP directly since we share the DB connection.
        $stmt = $pdo->prepare('SELECT otp_code FROM users WHERE email = ?');
        $stmt->execute([$email]);
        $otp = $stmt->fetchColumn();
    }

    if (!$otp) {
        throw new RuntimeException("Could not obtain OTP for $email.");
    }

    $verify = httpRequest($baseUrl, 'POST', '/api/auth/verify-otp', [
        'email' => $email,
        'otp'   => $otp,
    ]);

    if ($verify['status'] !== 200 || !($verify['body']['success'] ?? false)) {
        throw new RuntimeException("OTP verification failed for $email: " . json_encode($verify));
    }

    return $verify['body']['data']['token'] ?? throw new RuntimeException("No token returned for $email.");
}

// ── Run ──────────────────────────────────────────────────────────────────────

echo "Provisioning test accounts...\n";
foreach ($testAccounts as $roleName => $email) {
    ensureTestUser($pdo, $roleName, $email);
}

echo "Logging in as each role...\n";
$tokens = [];
foreach ($testAccounts as $roleName => $email) {
    $tokens[$roleName] = loginAndGetToken($pdo, $baseUrl, $email);
    echo "  - $roleName logged in.\n";
}

echo "\nRunning assertions...\n\n";

$results  = [];
$failures = 0;

foreach ($matrix as [$role, $method, $path, $expect, $reason]) {
    $resp   = httpRequest($baseUrl, $method, $path, [], $tokens[$role]);
    $actual = $resp['status'];
    $pass   = $actual === $expect;
    if (!$pass) {
        $failures++;
    }
    $results[] = [$role, $method . ' ' . $path, $expect, $actual, $pass ? 'PASS' : 'FAIL', $reason];
}

// ── Report ───────────────────────────────────────────────────────────────────

printf("%-16s %-32s %-8s %-8s %-6s %s\n", 'Role', 'Endpoint', 'Expect', 'Actual', 'Result', 'Requirement');
printf("%s\n", str_repeat('-', 110));
foreach ($results as [$role, $endpoint, $expect, $actual, $result, $reason]) {
    printf("%-16s %-32s %-8s %-8s %-6s %s\n", $role, $endpoint, $expect, $actual, $result, $reason);
}

echo "\n" . count($results) . " assertions, " . ($count = count($results) - $failures) . " passed, $failures failed.\n";

exit($failures > 0 ? 1 : 0);

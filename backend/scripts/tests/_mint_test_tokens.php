<?php
/**
 * Mint JWTs for synthetic actors so the HTTP test can exercise the real
 * middleware chain. Every actor gets its OWN ZZTEST role holding exactly the
 * permissions it should — the JWT drives the request-time permission checks,
 * while the role's `role_permissions` rows drive NotificationService's
 * permission fan-out, so both paths have to be set up for the notification
 * assertions to mean anything.
 *
 * Prints one line of JSON: { actor: { id, token } }.
 */
define('BASE_PATH', dirname(__DIR__, 2));
require BASE_PATH . '/vendor/autoload.php';
(Dotenv\Dotenv::createImmutable(BASE_PATH))->load();

use Core\Database;
use App\Services\AuthService;
use App\Constants\Permissions;

$db   = Database::getInstance();
$auth = new AuthService();

// Start from a clean slate: a previous run's requests would trip the
// overlapping-dates guard on the very first submission.
require __DIR__ . '/_zztest_sweep.php';
sweepZzTest($db);

/**
 * actor => the permissions it holds. One office per actor, matching the
 * institution's signature sequence, so a stage decided by the wrong actor is a
 * genuine permission failure rather than an artefact of shared grants.
 *
 * @var array<string,string[]>
 */
$actors = [
    'requester' => [Permissions::REQUEST_LEAVE],
    'vc'        => [Permissions::APPROVE_LEAVE_VC, Permissions::VIEW_LEAVE_REQUESTS],
    'hrrec'     => [Permissions::APPROVE_LEAVE_HR],
    'daf'       => [Permissions::APPROVE_LEAVE_DAF],
    'hod'       => [Permissions::APPROVE_LEAVE_L1],
    'hr'        => [Permissions::APPROVE_LEAVE_FINAL, Permissions::VIEW_LEAVE_REQUESTS],
    // Configures approval chains but decides nothing.
    'chainadmin' => [Permissions::MANAGE_LEAVE_TYPES, Permissions::VIEW_LEAVE_REQUESTS],
    'nobody'    => ['VIEW_STUDENTS'],
];

$out = [];
foreach ($actors as $name => $perms) {
    $suffix = $name . '_' . bin2hex(random_bytes(3));

    // Dedicated role, so a fan-out for one actor's permission cannot reach the
    // others — and never reaches a real account.
    $db->execute(
        "INSERT INTO roles (name, description) VALUES (?, 'leave_approval_http_test.sh fixture')",
        ['ZZTEST_role_' . $suffix]
    );
    $roleId = (int) $db->lastInsertId();

    foreach ($perms as $slug) {
        $db->execute(
            "INSERT IGNORE INTO role_permissions (role_id, permission_id)
             SELECT ?, id FROM permissions WHERE slug = ?",
            [$roleId, $slug]
        );
    }

    $handle = 'ZZTEST_http_' . $suffix;
    $email  = $handle . '@zztest.invalid';
    $db->execute(
        "INSERT INTO users (username, password, full_name, email, role_id, is_active)
         VALUES (?, '-', ?, ?, ?, 1)",
        [$handle, 'ZZTEST ' . $name, $email, $roleId]
    );
    $id = (int) $db->lastInsertId();

    $out[$name] = [
        'id'    => $id,
        'token' => $auth->generateToken([
            'id'          => $id,
            'email'       => $email,
            'username'    => $handle,
            'full_name'   => 'ZZTEST ' . $name,
            'role_name'   => 'ZZTEST_' . $name, // deliberately NOT superadmin
            'role_id'     => $roleId,
            'permissions' => $perms,
        ]),
    ];
}

echo json_encode($out), "\n";

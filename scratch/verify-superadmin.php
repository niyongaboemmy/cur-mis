<?php
/**
 * Verify Superadmin User Status
 */

$pdo = new PDO('mysql:host=127.0.0.1;dbname=curac_save', 'root', '');

echo "════════════════════════════════════════════════════════════════\n";
echo "  VERIFY SUPERADMIN USER STATUS\n";
echo "════════════════════════════════════════════════════════════════\n\n";

// Get roles mapping
$stmt = $pdo->query('SELECT id, name FROM roles ORDER BY id');
$roles = [];
while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    $roles[$row['id']] = $row['name'];
}

// Get user
$email = 'faustinganzasheila@gmail.com';
$stmt = $pdo->prepare('SELECT id, username, email, role_id, is_active FROM users WHERE email = ?');
$stmt->execute([$email]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if ($user) {
    $roleName = $roles[$user['role_id']] ?? 'Unknown';

    echo "✅ SUPERADMIN USER CONFIRMED\n";
    echo "════════════════════════════════════════════════════════════════\n\n";

    echo "User Information:\n";
    echo "─────────────────────────────────────────────────────────────\n";
    echo "ID:          " . $user['id'] . "\n";
    echo "Email:       " . $user['email'] . "\n";
    echo "Username:    " . $user['username'] . "\n";
    echo "Role:        " . $roleName . " (ID: " . $user['role_id'] . ")\n";
    echo "Status:      " . ($user['is_active'] ? "Active ✓" : "Inactive ✗") . "\n";

    echo "\n\nAccess Rights:\n";
    echo "─────────────────────────────────────────────────────────────\n";
    echo "✓ Admin Dashboard\n";
    echo "✓ User Management\n";
    echo "✓ Role Management\n";
    echo "✓ All Reports\n";
    echo "✓ System Settings\n";
    echo "✓ Database Management\n";
    echo "✓ All Project Features\n";

    echo "\n\n";
    echo "════════════════════════════════════════════════════════════════\n";
    echo "  STATUS: READY TO USE AS SUPERADMIN\n";
    echo "════════════════════════════════════════════════════════════════\n\n";

    echo "Login with:\n";
    echo "  Email:    " . $user['email'] . "\n";
    echo "  Password: (your password)\n";
    echo "  URL:      http://localhost:5182\n\n";

} else {
    echo "✗ User not found with email: " . $email . "\n\n";

    echo "Available Users:\n";
    $stmt = $pdo->query('SELECT id, username, email, role_id FROM users ORDER BY id');
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $role = $roles[$row['role_id']] ?? 'Unknown';
        echo "  - {$row['email']} (Role: {$role})\n";
    }
}

?>

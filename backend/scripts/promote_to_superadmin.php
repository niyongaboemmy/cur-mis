<?php
/**
 * Promote user to superadmin
 * Run from backend directory: php scripts/promote_to_superadmin.php
 */

// Database credentials (from .env)
$dbHost = '127.0.0.1';
$dbUsername = 'root';
$dbPassword = '';
$dbDatabase = 'curac_save';

$email = 'faustin.niitegeka@gmail.com';

echo "🔄 Promoting $email to superadmin...\n";
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";

try {
    // Connect
    $mysqli = new mysqli($dbHost, $dbUsername, $dbPassword, $dbDatabase);

    if ($mysqli->connect_error) {
        die("❌ Connection failed: " . $mysqli->connect_error);
    }

    echo "✓ Connected to database\n";

    // 1. Find superadmin role
    $result = $mysqli->query("SELECT id FROM roles WHERE name = 'superadmin'");
    if (!$result) {
        die("❌ Query failed: " . $mysqli->error);
    }

    $role = $result->fetch_assoc();
    if (!$role) {
        die("❌ Superadmin role not found. Please check roles table.");
    }

    $superadminRoleId = (int)$role['id'];
    echo "✓ Found superadmin role (ID: $superadminRoleId)\n";

    // 2. Find user
    $query = "SELECT id, email, full_name, role_id FROM users WHERE LOWER(email) = LOWER('$email')";
    $result = $mysqli->query($query);

    if (!$result) {
        die("❌ Query failed: " . $mysqli->error);
    }

    $user = $result->fetch_assoc();
    if (!$user) {
        die("❌ User with email '$email' not found");
    }

    $userId = (int)$user['id'];
    $oldRoleId = (int)$user['role_id'];

    echo "✓ Found user: {$user['full_name']} (ID: $userId)\n";
    echo "  Current role ID: $oldRoleId\n";

    // 3. Update user role
    $updateQuery = "UPDATE users SET role_id = $superadminRoleId, is_active = 1 WHERE id = $userId";

    if (!$mysqli->query($updateQuery)) {
        die("❌ Update failed: " . $mysqli->error);
    }

    echo "✓ Updated role to superadmin\n";

    // 4. Log the change (optional)
    $logQuery = "INSERT INTO system_logs (action, entity_type, description, user_id, details, created_at)
                 VALUES ('UPDATE', 'user_role_assignment',
                         'Promoted $email to superadmin via CLI script',
                         NULL,
                         JSON_OBJECT('user_id', $userId, 'email', '$email', 'old_role_id', $oldRoleId, 'new_role_id', $superadminRoleId),
                         NOW())";

    if (!$mysqli->query($logQuery)) {
        echo "⚠️  Could not log change (system_logs table may not exist)\n";
    } else {
        echo "✓ Logged the change to system_logs\n";
    }

    // 5. Verify
    $verify = $mysqli->query("SELECT u.id, u.email, u.full_name, r.name as role_name FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $userId");
    $verified = $verify->fetch_assoc();

    echo "\n";
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
    echo "✅ SUCCESS! User is now SUPERADMIN\n";
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
    echo "\nUser Details:\n";
    echo "  ID:        " . $verified['id'] . "\n";
    echo "  Email:     " . $verified['email'] . "\n";
    echo "  Name:      " . $verified['full_name'] . "\n";
    echo "  Role:      " . $verified['role_name'] . "\n";
    echo "\n";
    echo "✓ Can access all features\n";
    echo "✓ Can manage all users\n";
    echo "✓ Can view all departments and faculties\n";
    echo "✓ No access restrictions\n";
    echo "\n";

    $mysqli->close();

} catch (Exception $e) {
    echo "❌ Error: " . $e->getMessage() . "\n";
    exit(1);
}
?>

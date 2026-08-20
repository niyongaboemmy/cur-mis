<?php
/**
 * Make a user superadmin
 * Usage: php make_superadmin.php faustin.niitegeka@gmail.com
 */

// Load environment
require_once __DIR__ . '/../.env.php';

// Check if email provided
if (empty($argv[1])) {
    echo "Usage: php make_superadmin.php <email>\n";
    exit(1);
}

$email = strtolower(trim($argv[1]));

try {
    // Connect to database
    $db = new mysqli(
        $_ENV['DB_HOST'] ?? '127.0.0.1',
        $_ENV['DB_USERNAME'] ?? 'root',
        $_ENV['DB_PASSWORD'] ?? '',
        $_ENV['DB_DATABASE'] ?? 'curac_save'
    );

    if ($db->connect_error) {
        throw new Exception("Connection failed: " . $db->connect_error);
    }

    // Get superadmin role
    $result = $db->query("SELECT id FROM roles WHERE name = 'superadmin' LIMIT 1");
    if (!$result) {
        throw new Exception("Failed to query roles: " . $db->error);
    }

    $role = $result->fetch_assoc();
    if (!$role) {
        throw new Exception("Superadmin role not found in database");
    }

    $superadminRoleId = (int)$role['id'];

    // Find user
    $stmt = $db->prepare("SELECT id, email, full_name FROM users WHERE LOWER(email) = LOWER(?)");
    if (!$stmt) {
        throw new Exception("Prepare failed: " . $db->error);
    }

    $stmt->bind_param('s', $email);
    $stmt->execute();
    $result = $stmt->get_result();
    $user = $result->fetch_assoc();

    if (!$user) {
        throw new Exception("User with email '$email' not found");
    }

    // Update user role to superadmin
    $stmt = $db->prepare("UPDATE users SET role_id = ?, is_active = 1 WHERE id = ?");
    if (!$stmt) {
        throw new Exception("Prepare failed: " . $db->error);
    }

    $stmt->bind_param('ii', $superadminRoleId, $user['id']);
    if (!$stmt->execute()) {
        throw new Exception("Update failed: " . $db->error);
    }

    // Log the change
    $db->query("INSERT INTO system_logs (action, entity_type, description, user_id, details, created_at)
               VALUES ('UPDATE', 'user_role_assignment',
                       'Promoted {$user['email']} to superadmin via CLI script',
                       NULL,
                       JSON_OBJECT('user_id', {$user['id']}, 'email', '{$user['email']}', 'new_role_id', $superadminRoleId),
                       NOW())");

    echo "✅ SUCCESS!\n";
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
    echo "User: {$user['full_name']}\n";
    echo "Email: {$user['email']}\n";
    echo "Role: superadmin\n";
    echo "Status: Active\n";
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
    echo "\nThe user can now:\n";
    echo "  ✓ See all features and modules\n";
    echo "  ✓ Manage all users, roles, and permissions\n";
    echo "  ✓ Access all departments and faculties\n";
    echo "  ✓ View and modify all system data\n";
    echo "\nNext: Log in and verify access to all features.\n";

} catch (Exception $e) {
    echo "❌ ERROR: " . $e->getMessage() . "\n";
    exit(1);
}
?>

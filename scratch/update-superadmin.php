<?php
/**
 * Update User to Superadmin Role
 * Makes faustiganzasheila@gmail.com a superadmin with all project rights
 */

$pdo = new PDO('mysql:host=127.0.0.1;dbname=curac_save', 'root', '');
$email = 'faustiganzasheila@gmail.com';

echo "════════════════════════════════════════════════════════════════\n";
echo "  UPDATE USER TO SUPERADMIN\n";
echo "════════════════════════════════════════════════════════════════\n\n";

// Step 1: Check available roles
echo "Step 1: Available Roles\n";
echo "─────────────────────────────────────────────────────────────\n";

$stmt = $pdo->query('SELECT id, name, description FROM roles ORDER BY id');
$roles = $stmt->fetchAll(PDO::FETCH_ASSOC);

if (empty($roles)) {
    echo "✗ No roles found in database\n\n";
} else {
    foreach ($roles as $role) {
        echo "ID: {$role['id']} | Name: {$role['name']} | Description: {$role['description']}\n";
    }
}

echo "\n";

// Step 2: Check if user exists
echo "Step 2: Find User\n";
echo "─────────────────────────────────────────────────────────────\n";

$stmt = $pdo->prepare('SELECT id, username, email, role_id FROM users WHERE email = ?');
$stmt->execute([$email]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$user) {
    echo "✗ User not found with email: $email\n";
    echo "\nAvailable Users:\n";

    $stmt = $pdo->query('SELECT id, username, email, role_id FROM users ORDER BY id');
    $allUsers = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($allUsers as $u) {
        echo "  - {$u['email']} (ID: {$u['id']})\n";
    }
    exit(1);
}

echo "✓ User found: {$user['username']}\n";
echo "  Email: {$user['email']}\n";
echo "  Current Role ID: {$user['role_id']}\n";
echo "  User ID: {$user['id']}\n\n";

// Step 3: Get Superadmin role ID
echo "Step 3: Get Superadmin Role ID\n";
echo "─────────────────────────────────────────────────────────────\n";

// Try to find superadmin role (usually ID 1 or by name)
$stmt = $pdo->prepare("SELECT id FROM roles WHERE LOWER(name) IN ('superadmin', 'super admin', 'admin') ORDER BY id LIMIT 1");
$stmt->execute();
$superadminRole = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$superadminRole) {
    // If not found, create superadmin role
    echo "! Superadmin role not found, creating it...\n";
    $stmt = $pdo->prepare("
        INSERT INTO roles (name, description, created_at)
        VALUES (?, ?, NOW())
    ");
    $stmt->execute(['superadmin', 'System Administrator with full access to all features']);
    $superadminRoleId = $pdo->lastInsertId();
    echo "✓ Created superadmin role with ID: $superadminRoleId\n";
} else {
    $superadminRoleId = $superadminRole['id'];
    echo "✓ Found superadmin role with ID: $superadminRoleId\n";
}

echo "\n";

// Step 4: Update user role
echo "Step 4: Update User Role to Superadmin\n";
echo "─────────────────────────────────────────────────────────────\n";

$stmt = $pdo->prepare("UPDATE users SET role_id = ? WHERE id = ?");
$stmt->execute([$superadminRoleId, $user['id']]);

echo "✓ User role updated successfully!\n\n";

// Step 5: Verify update
echo "Step 5: Verify Update\n";
echo "─────────────────────────────────────────────────────────────\n";

$stmt = $pdo->prepare('SELECT id, username, email, role_id FROM users WHERE id = ?');
$stmt->execute([$user['id']]);
$updatedUser = $stmt->fetch(PDO::FETCH_ASSOC);

echo "✓ User: {$updatedUser['email']}\n";
echo "  Role ID: {$updatedUser['role_id']} (Superadmin)\n";

echo "\n";
echo "════════════════════════════════════════════════════════════════\n";
echo "  ✅ USER SUCCESSFULLY UPDATED TO SUPERADMIN\n";
echo "════════════════════════════════════════════════════════════════\n\n";

echo "Summary:\n";
echo "  Email: {$email}\n";
echo "  Username: {$updatedUser['username']}\n";
echo "  Role: Superadmin (ID: {$superadminRoleId})\n";
echo "  Status: Active\n";
echo "\nUser can now access all project features and rights.\n\n";

?>

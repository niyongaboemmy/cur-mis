<?php
/**
 * Comprehensive RBAC System Audit (Fixed)
 * Checks what actually exists in database
 */

require_once __DIR__ . '/../vendor/autoload.php';
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
$dotenv->load();

$host = $_ENV['DB_HOST'] ?? '127.0.0.1';
$port = $_ENV['DB_PORT'] ?? '3306';
$db   = $_ENV['DB_DATABASE'] ?? 'curac_save';
$user = $_ENV['DB_USERNAME'] ?? 'root';
$pass = $_ENV['DB_PASSWORD'] ?? '';

$pdo = new PDO("mysql:host=$host;port=$port;dbname=$db;charset=utf8mb4", $user, $pass);
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$errors = [];
$warnings = [];

echo "\n╔════════════════════════════════════════════════════════════════╗\n";
echo "║           RBAC SYSTEM COMPREHENSIVE AUDIT                     ║\n";
echo "╚════════════════════════════════════════════════════════════════╝\n\n";

// ═══════════════════════════════════════════════════════════════════
// CHECK TABLE STRUCTURE
// ═══════════════════════════════════════════════════════════════════

echo "📊 CHECKING TABLE STRUCTURE\n";
echo "───────────────────────────────────────────────────────────────\n";

$tables = [
    'roles' => ['id', 'name', 'description'],
    'permission_categories' => ['id', 'name'],
    'permissions' => ['id', 'name', 'slug'],
    'role_permissions' => ['role_id', 'permission_id'],
    'users' => ['id', 'email', 'role_id'],
    'user_department_assignments' => [],
    'user_faculty_assignments' => [],
];

foreach ($tables as $table => $cols) {
    $stmt = $pdo->query("SHOW TABLES LIKE '$table'");
    if ($stmt->rowCount() > 0) {
        echo "✓ Table exists: $table\n";
    } else {
        echo "❌ Missing table: $table\n";
        $errors[] = "Missing table: $table";
    }
}

echo "\n";

// ═══════════════════════════════════════════════════════════════════
// 1. CHECK ROLES
// ═══════════════════════════════════════════════════════════════════

echo "📋 1. CHECKING ROLES TABLE\n";
echo "───────────────────────────────────────────────────────────────\n";

$stmt = $pdo->query("SELECT id, name, description FROM roles ORDER BY id");
$roles = $stmt->fetchAll(PDO::FETCH_ASSOC);

if (empty($roles)) {
    $errors[] = "No roles found in database!";
    echo "❌ No roles found\n";
} else {
    echo "✓ Found " . count($roles) . " roles:\n\n";
    foreach ($roles as $role) {
        echo "  ID: " . str_pad($role['id'], 2) . " | Name: " . str_pad($role['name'], 20) . " | " . ($role['description'] ?? '') . "\n";
    }
}

echo "\n";

// ═══════════════════════════════════════════════════════════════════
// 2. CHECK PERMISSION CATEGORIES
// ═══════════════════════════════════════════════════════════════════

echo "📂 2. CHECKING PERMISSION CATEGORIES\n";
echo "───────────────────────────────────────────────────────────────\n";

$stmt = $pdo->query("SELECT id, name FROM permission_categories ORDER BY id");
$categories = $stmt->fetchAll(PDO::FETCH_ASSOC);

if (empty($categories)) {
    $errors[] = "No permission categories found!";
    echo "❌ No permission categories found\n";
} else {
    echo "✓ Found " . count($categories) . " permission categories:\n";
    foreach ($categories as $cat) {
        echo "  ID: " . str_pad($cat['id'], 2) . " | " . $cat['name'] . "\n";
    }
}

echo "\n";

// ═══════════════════════════════════════════════════════════════════
// 3. CHECK PERMISSIONS
// ═══════════════════════════════════════════════════════════════════

echo "🔐 3. CHECKING PERMISSIONS\n";
echo "───────────────────────────────────────────────────────────────\n";

$stmt = $pdo->query("SELECT id, category_id, name, slug FROM permissions ORDER BY id LIMIT 10");
$permissions = $stmt->fetchAll(PDO::FETCH_ASSOC);

$stmt = $pdo->query("SELECT COUNT(*) as count FROM permissions");
$permCount = $stmt->fetch(PDO::FETCH_ASSOC);

if ($permCount['count'] == 0) {
    $errors[] = "No permissions found!";
    echo "❌ No permissions found\n";
} else {
    echo "✓ Found " . $permCount['count'] . " permissions (showing first 10):\n";
    foreach ($permissions as $perm) {
        echo "  ID: " . str_pad($perm['id'], 3) . " | Cat: " . str_pad($perm['category_id'], 2) . " | " . str_pad($perm['slug'], 30) . "\n";
    }
}

echo "\n";

// ═══════════════════════════════════════════════════════════════════
// 4. CHECK ROLE_PERMISSIONS MAPPINGS
// ═══════════════════════════════════════════════════════════════════

echo "🔗 4. CHECKING ROLE_PERMISSIONS MAPPINGS\n";
echo "───────────────────────────────────────────────────────────────\n";

$stmt = $pdo->query("SELECT COUNT(*) as count FROM role_permissions");
$rpCount = $stmt->fetch(PDO::FETCH_ASSOC);

if ($rpCount['count'] == 0) {
    $warnings[] = "No role-permission mappings (roles may have no permissions)";
    echo "⚠️  No role-permission mappings found\n";
} else {
    echo "✓ Found " . $rpCount['count'] . " role-permission mappings\n";

    // Show breakdown by role
    $stmt = $pdo->query("
        SELECT r.id, r.name, COUNT(rp.permission_id) as perm_count
        FROM roles r
        LEFT JOIN role_permissions rp ON rp.role_id = r.id
        GROUP BY r.id, r.name
        ORDER BY r.id
    ");
    $rolePerms = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($rolePerms as $rp) {
        echo "  • Role '" . $rp['name'] . "' has " . $rp['perm_count'] . " permissions\n";
    }
}

echo "\n";

// ═══════════════════════════════════════════════════════════════════
// 5. CHECK USERS
// ═══════════════════════════════════════════════════════════════════

echo "👥 5. CHECKING USERS\n";
echo "───────────────────────────────────────────────────────────────\n";

$stmt = $pdo->query("SELECT id, email, full_name, role_id, is_active FROM users ORDER BY id");
$users = $stmt->fetchAll(PDO::FETCH_ASSOC);

if (empty($users)) {
    $errors[] = "No users found!";
    echo "❌ No users found\n";
} else {
    echo "✓ Found " . count($users) . " users:\n\n";

    $invalidRoles = 0;
    $inactiveUsers = 0;

    foreach ($users as $u) {
        $roleExists = in_array($u['role_id'], array_map(fn($r) => $r['id'], $roles));
        $roleIcon = $roleExists ? "✓" : "❌";
        $activeIcon = $u['is_active'] ? "✓" : "✗";

        echo "  [$activeIcon] ID:" . str_pad($u['id'], 3) . " | " . str_pad($u['email'], 40);
        echo " | Role: " . str_pad($u['role_id'], 2) . " $roleIcon\n";

        if (!$roleExists) {
            $invalidRoles++;
        }
        if (!$u['is_active']) {
            $inactiveUsers++;
        }
    }

    echo "\n";
    if ($invalidRoles > 0) {
        $errors[] = "$invalidRoles users have invalid role_id";
        echo "  ❌ $invalidRoles users have non-existent roles\n";
    }
    if ($inactiveUsers > 0) {
        echo "  ⚠️  $inactiveUsers users are inactive\n";
    }
}

echo "\n";

// ═══════════════════════════════════════════════════════════════════
// 6. SUMMARY
// ═══════════════════════════════════════════════════════════════════

echo "╔════════════════════════════════════════════════════════════════╗\n";
echo "║                        AUDIT SUMMARY                          ║\n";
echo "╚════════════════════════════════════════════════════════════════╝\n\n";

echo "📊 Database Counts:\n";
echo "  • Roles: " . count($roles) . "\n";
echo "  • Permission Categories: " . count($categories) . "\n";
echo "  • Permissions: " . $permCount['count'] . "\n";
echo "  • Role-Permission Mappings: " . $rpCount['count'] . "\n";
echo "  • Users: " . count($users) . "\n";

echo "\n";

if (!empty($errors)) {
    echo "❌ CRITICAL ERRORS (" . count($errors) . "):\n";
    foreach ($errors as $error) {
        echo "  • $error\n";
    }
    echo "\n";
}

if (!empty($warnings)) {
    echo "⚠️  WARNINGS (" . count($warnings) . "):\n";
    foreach ($warnings as $warning) {
        echo "  • $warning\n";
    }
    echo "\n";
}

if (empty($errors)) {
    if (empty($warnings)) {
        echo "✅ ALL CHECKS PASSED - RBAC System is healthy!\n\n";
    } else {
        echo "✓ System is functional with minor warnings\n\n";
    }
} else {
    echo "❌ CRITICAL ERRORS FOUND - See above\n\n";
}

?>

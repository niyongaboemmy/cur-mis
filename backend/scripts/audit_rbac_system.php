<?php
/**
 * Comprehensive RBAC System Audit
 * Checks: users, roles, permissions, permission_categories
 * Identifies and reports inconsistencies
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
// 1. CHECK ROLES
// ═══════════════════════════════════════════════════════════════════

echo "📋 1. CHECKING ROLES TABLE\n";
echo "───────────────────────────────────────────────────────────────\n";

$stmt = $pdo->query("SELECT id, name, description, enforce_campus_scope, enforce_department_scope, enforce_faculty_scope FROM roles ORDER BY id");
$roles = $stmt->fetchAll(PDO::FETCH_ASSOC);

if (empty($roles)) {
    $errors[] = "❌ No roles found in database!";
    echo "❌ No roles found\n";
} else {
    echo "✓ Found " . count($roles) . " roles:\n\n";
    foreach ($roles as $role) {
        $scopeFlags = [];
        if ($role['enforce_campus_scope']) $scopeFlags[] = "CAMPUS";
        if ($role['enforce_department_scope']) $scopeFlags[] = "DEPT";
        if ($role['enforce_faculty_scope']) $scopeFlags[] = "FACULTY";
        $scopes = empty($scopeFlags) ? "NONE" : implode(", ", $scopeFlags);

        echo "  ID: " . str_pad($role['id'], 2) . " | Name: " . str_pad($role['name'], 20) . " | Scopes: $scopes\n";
    }
}

echo "\n";

// ═══════════════════════════════════════════════════════════════════
// 2. CHECK PERMISSION CATEGORIES
// ═══════════════════════════════════════════════════════════════════

echo "📂 2. CHECKING PERMISSION CATEGORIES\n";
echo "───────────────────────────────────────────────────────────────\n";

$stmt = $pdo->query("SELECT id, name, description FROM permission_categories ORDER BY id");
$categories = $stmt->fetchAll(PDO::FETCH_ASSOC);

if (empty($categories)) {
    $errors[] = "❌ No permission categories found!";
    echo "❌ No permission categories found\n";
} else {
    echo "✓ Found " . count($categories) . " permission categories:\n";
    foreach ($categories as $cat) {
        echo "  ID: " . str_pad($cat['id'], 2) . " | " . str_pad($cat['name'], 30) . "\n";
    }
}

echo "\n";

// ═══════════════════════════════════════════════════════════════════
// 3. CHECK PERMISSIONS
// ═══════════════════════════════════════════════════════════════════

echo "🔐 3. CHECKING PERMISSIONS\n";
echo "───────────────────────────────────────────────────────────────\n";

$stmt = $pdo->query("SELECT id, category_id, name, slug FROM permissions ORDER BY id");
$permissions = $stmt->fetchAll(PDO::FETCH_ASSOC);

if (empty($permissions)) {
    $errors[] = "❌ No permissions found!";
    echo "❌ No permissions found\n";
} else {
    echo "✓ Found " . count($permissions) . " permissions\n";

    // Check for orphaned permissions (category doesn't exist)
    $orphanedPerms = 0;
    foreach ($permissions as $perm) {
        $catExists = in_array($perm['category_id'], array_map(fn($c) => $c['id'], $categories));
        if (!$catExists) {
            $orphanedPerms++;
        }
    }

    if ($orphanedPerms > 0) {
        $warnings[] = "⚠️  Found $orphanedPerms permissions with non-existent categories";
        echo "  ⚠️  $orphanedPerms permissions have non-existent categories\n";
    } else {
        echo "  ✓ All permissions have valid categories\n";
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
    $warnings[] = "⚠️  No role-permission mappings found (admin/registrar may have no permissions)";
    echo "⚠️  No role-permission mappings found\n";
} else {
    echo "✓ Found " . $rpCount['count'] . " role-permission mappings\n";

    // Check for orphaned mappings
    $stmt = $pdo->query("
        SELECT COUNT(*) as orphaned
        FROM role_permissions rp
        WHERE rp.role_id NOT IN (SELECT id FROM roles)
           OR rp.permission_id NOT IN (SELECT id FROM permissions)
    ");
    $orphaned = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($orphaned['orphaned'] > 0) {
        $errors[] = "❌ Found " . $orphaned['orphaned'] . " orphaned role-permission mappings";
        echo "  ❌ Found " . $orphaned['orphaned'] . " orphaned mappings (referencing deleted roles/perms)\n";
    } else {
        echo "  ✓ All mappings reference valid roles and permissions\n";
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
    $errors[] = "❌ No users found in database!";
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
        echo " | Role: " . str_pad($u['role_id'], 2) . " $roleIcon | " . substr($u['full_name'], 0, 25) . "\n";

        if (!$roleExists) {
            $invalidRoles++;
        }
        if (!$u['is_active']) {
            $inactiveUsers++;
        }
    }

    echo "\n";
    if ($invalidRoles > 0) {
        $errors[] = "❌ $invalidRoles users have invalid role_id (role doesn't exist)";
        echo "  ❌ $invalidRoles users have non-existent roles\n";
    }
    if ($inactiveUsers > 0) {
        $warnings[] = "⚠️  $inactiveUsers users are inactive";
        echo "  ⚠️  $inactiveUsers users are inactive\n";
    }
}

echo "\n";

// ═══════════════════════════════════════════════════════════════════
// 6. CHECK USER_DEPARTMENT_ASSIGNMENTS
// ═══════════════════════════════════════════════════════════════════

echo "🏢 6. CHECKING DEPARTMENT ASSIGNMENTS\n";
echo "───────────────────────────────────────────────────────────────\n";

$stmt = $pdo->query("SELECT COUNT(*) as count FROM user_department_assignments");
$deptAssignCount = $stmt->fetch(PDO::FETCH_ASSOC);

echo "✓ Found " . $deptAssignCount['count'] . " department assignments\n";

if ($deptAssignCount['count'] > 0) {
    $stmt = $pdo->query("
        SELECT COUNT(*) as orphaned
        FROM user_department_assignments uda
        WHERE uda.user_id NOT IN (SELECT id FROM users)
           OR uda.department_id NOT IN (SELECT dep_id FROM departements)
    ");
    $orphaned = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($orphaned['orphaned'] > 0) {
        $warnings[] = "⚠️  Found " . $orphaned['orphaned'] . " orphaned department assignments";
        echo "  ⚠️  Found " . $orphaned['orphaned'] . " orphaned assignments\n";
    }
}

echo "\n";

// ═══════════════════════════════════════════════════════════════════
// 7. CHECK USER_FACULTY_ASSIGNMENTS
// ═══════════════════════════════════════════════════════════════════

echo "🎓 7. CHECKING FACULTY ASSIGNMENTS\n";
echo "───────────────────────────────────────────────────────────────\n";

$stmt = $pdo->query("SELECT COUNT(*) as count FROM user_faculty_assignments");
$facultyAssignCount = $stmt->fetch(PDO::FETCH_ASSOC);

echo "✓ Found " . $facultyAssignCount['count'] . " faculty assignments\n";

if ($facultyAssignCount['count'] > 0) {
    $stmt = $pdo->query("
        SELECT COUNT(*) as orphaned
        FROM user_faculty_assignments ufa
        WHERE ufa.user_id NOT IN (SELECT id FROM users)
           OR ufa.faculty_id NOT IN (SELECT fac_id FROM faculty)
    ");
    $orphaned = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($orphaned['orphaned'] > 0) {
        $warnings[] = "⚠️  Found " . $orphaned['orphaned'] . " orphaned faculty assignments";
        echo "  ⚠️  Found " . $orphaned['orphaned'] . " orphaned assignments\n";
    }
}

echo "\n";

// ═══════════════════════════════════════════════════════════════════
// 8. SUMMARY
// ═══════════════════════════════════════════════════════════════════

echo "╔════════════════════════════════════════════════════════════════╗\n";
echo "║                        AUDIT SUMMARY                          ║\n";
echo "╚════════════════════════════════════════════════════════════════╝\n\n";

echo "📊 Database Counts:\n";
echo "  • Roles: " . count($roles) . "\n";
echo "  • Permission Categories: " . count($categories) . "\n";
echo "  • Permissions: " . count($permissions) . "\n";
echo "  • Role-Permission Mappings: " . $rpCount['count'] . "\n";
echo "  • Users: " . count($users) . "\n";
echo "  • Department Assignments: " . $deptAssignCount['count'] . "\n";
echo "  • Faculty Assignments: " . $facultyAssignCount['count'] . "\n";

echo "\n";

if (!empty($errors)) {
    echo "❌ ERRORS FOUND (" . count($errors) . "):\n";
    foreach ($errors as $error) {
        echo "  $error\n";
    }
    echo "\n";
}

if (!empty($warnings)) {
    echo "⚠️  WARNINGS (" . count($warnings) . "):\n";
    foreach ($warnings as $warning) {
        echo "  $warning\n";
    }
    echo "\n";
}

if (empty($errors) && empty($warnings)) {
    echo "✅ ALL CHECKS PASSED - RBAC System is healthy!\n\n";
} else if (empty($errors)) {
    echo "⚠️  Minor warnings found but system is functional\n\n";
} else {
    echo "❌ CRITICAL ERRORS - System may not work properly\n\n";
}

?>

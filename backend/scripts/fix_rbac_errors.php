<?php
/**
 * Fix RBAC System Errors
 * 1. Creates missing department/faculty assignment tables
 * 2. Fixes users with invalid role_id
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

echo "\n╔════════════════════════════════════════════════════════════════╗\n";
echo "║            RBAC SYSTEM ERROR FIX SCRIPT                       ║\n";
echo "╚════════════════════════════════════════════════════════════════╝\n\n";

$fixCount = 0;

// ═══════════════════════════════════════════════════════════════════
// FIX 1: CREATE MISSING TABLES
// ═══════════════════════════════════════════════════════════════════

echo "🔧 FIX 1: Creating missing assignment tables...\n";
echo "───────────────────────────────────────────────────────────────\n";

try {
    // Check if table exists first
    $stmt = $pdo->query("SHOW TABLES LIKE 'user_department_assignments'");
    if ($stmt->rowCount() === 0) {
        $pdo->exec("
            CREATE TABLE user_department_assignments (
              id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
              user_id        INT UNSIGNED NOT NULL,
              department_id  INT UNSIGNED NOT NULL,
              assigned_by    INT UNSIGNED DEFAULT NULL,
              assigned_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              UNIQUE KEY uq_user_department (user_id, department_id),
              KEY idx_user_id (user_id),
              KEY idx_department_id (department_id),
              CONSTRAINT fk_user_dept_assignments_user
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
              CONSTRAINT fk_user_dept_assignments_department
                FOREIGN KEY (department_id) REFERENCES departements (dep_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ");
        echo "✓ Created user_department_assignments table\n";
        $fixCount++;
    } else {
        echo "✓ user_department_assignments table already exists\n";
    }

    // Check if table exists first
    $stmt = $pdo->query("SHOW TABLES LIKE 'user_faculty_assignments'");
    if ($stmt->rowCount() === 0) {
        $pdo->exec("
            CREATE TABLE user_faculty_assignments (
              id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
              user_id        INT UNSIGNED NOT NULL,
              faculty_id     INT UNSIGNED NOT NULL,
              assigned_by    INT UNSIGNED DEFAULT NULL,
              assigned_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              UNIQUE KEY uq_user_faculty (user_id, faculty_id),
              KEY idx_user_id (user_id),
              KEY idx_faculty_id (faculty_id),
              CONSTRAINT fk_user_faculty_assignments_user
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
              CONSTRAINT fk_user_faculty_assignments_faculty
                FOREIGN KEY (faculty_id) REFERENCES faculty (fac_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        ");
        echo "✓ Created user_faculty_assignments table\n";
        $fixCount++;
    } else {
        echo "✓ user_faculty_assignments table already exists\n";
    }

} catch (Exception $e) {
    echo "❌ Error creating tables: " . $e->getMessage() . "\n";
}

echo "\n";

// ═══════════════════════════════════════════════════════════════════
// FIX 2: FIX USERS WITH INVALID ROLE_ID
// ═══════════════════════════════════════════════════════════════════

echo "🔧 FIX 2: Fixing users with invalid role_id...\n";
echo "───────────────────────────────────────────────────────────────\n";

try {
    // Get valid roles
    $stmt = $pdo->query("SELECT id FROM roles");
    $validRoles = $stmt->fetchAll(PDO::FETCH_COLUMN);

    // Get users with invalid roles
    $placeholders = implode(',', array_fill(0, count($validRoles), '?'));
    $stmt = $pdo->prepare("SELECT id, email, role_id FROM users WHERE role_id NOT IN ($placeholders)");
    $stmt->execute($validRoles);
    $invalidUsers = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($invalidUsers)) {
        echo "✓ No users with invalid roles found\n";
    } else {
        echo "Found " . count($invalidUsers) . " users with invalid roles. Fixing...\n";

        // Get default role (registrar = ID 2)
        $defaultRoleId = 2;

        // Update all invalid users to registrar role
        $stmt = $pdo->prepare("UPDATE users SET role_id = ? WHERE role_id NOT IN ($placeholders)");
        $params = array_merge([$defaultRoleId], $validRoles);
        $stmt->execute($params);

        echo "✓ Fixed " . count($invalidUsers) . " users to role 'registrar' (ID: $defaultRoleId)\n";
        echo "\n  Fixed users:\n";

        foreach ($invalidUsers as $user) {
            echo "    • " . str_pad($user['email'], 45) . " (was role ID: " . $user['role_id'] . ")\n";
        }

        $fixCount += count($invalidUsers);
    }

} catch (Exception $e) {
    echo "❌ Error fixing users: " . $e->getMessage() . "\n";
}

echo "\n";

// ═══════════════════════════════════════════════════════════════════
// FIX 3: ADD SCOPE COLUMNS TO ROLES TABLE
// ═══════════════════════════════════════════════════════════════════

echo "🔧 FIX 3: Adding scope enforcement columns to roles...\n";
echo "───────────────────────────────────────────────────────────────\n";

try {
    // Check if columns exist
    $stmt = $pdo->query("SHOW COLUMNS FROM roles LIKE 'enforce_campus_scope'");
    if ($stmt->rowCount() === 0) {
        $pdo->exec("ALTER TABLE roles ADD COLUMN enforce_campus_scope TINYINT(1) NOT NULL DEFAULT 0");
        echo "✓ Added enforce_campus_scope column\n";
        $fixCount++;
    } else {
        echo "✓ enforce_campus_scope column already exists\n";
    }

    $stmt = $pdo->query("SHOW COLUMNS FROM roles LIKE 'enforce_department_scope'");
    if ($stmt->rowCount() === 0) {
        $pdo->exec("ALTER TABLE roles ADD COLUMN enforce_department_scope TINYINT(1) NOT NULL DEFAULT 0");
        echo "✓ Added enforce_department_scope column\n";
        $fixCount++;
    } else {
        echo "✓ enforce_department_scope column already exists\n";
    }

    $stmt = $pdo->query("SHOW COLUMNS FROM roles LIKE 'enforce_faculty_scope'");
    if ($stmt->rowCount() === 0) {
        $pdo->exec("ALTER TABLE roles ADD COLUMN enforce_faculty_scope TINYINT(1) NOT NULL DEFAULT 0");
        echo "✓ Added enforce_faculty_scope column\n";
        $fixCount++;
    } else {
        echo "✓ enforce_faculty_scope column already exists\n";
    }

} catch (Exception $e) {
    echo "❌ Error adding scope columns: " . $e->getMessage() . "\n";
}

echo "\n";

// ═══════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════

echo "╔════════════════════════════════════════════════════════════════╗\n";
echo "║                      FIX COMPLETE                             ║\n";
echo "╚════════════════════════════════════════════════════════════════╝\n\n";

echo "✅ Fixed $fixCount issues in RBAC system\n\n";

echo "✓ Summary of changes:\n";
echo "  1. Created user_department_assignments table\n";
echo "  2. Created user_faculty_assignments table\n";
echo "  3. Fixed users with invalid role_id → Set to registrar\n";
echo "  4. Added enforce_campus_scope column to roles\n";
echo "  5. Added enforce_department_scope column to roles\n";
echo "  6. Added enforce_faculty_scope column to roles\n\n";

echo "📝 Next steps:\n";
echo "  1. Log in as admin (faustin.niyitegeka@gmail.com)\n";
echo "  2. Check the Users admin panel\n";
echo "  3. Update user roles as needed\n";
echo "  4. Assign scopes to HODs and Deans\n\n";

?>

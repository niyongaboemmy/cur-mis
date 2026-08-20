<?php
/**
 * Check what data is missing or needs to be updated in the system
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
echo "║              SYSTEM DATA CHECK - WHAT'S MISSING?              ║\n";
echo "╚════════════════════════════════════════════════════════════════╝\n\n";

// Check tables that might be empty
$tables = [
    'students' => 'Student Records',
    'staff' => 'Staff/Employees',
    'academic_years' => 'Academic Years',
    'academic_terms' => 'Academic Terms',
    'modules' => 'Modules/Courses',
    'departements' => 'Departments',
    'faculty' => 'Faculties',
    'leave_types' => 'Leave Types',
    'fee_structures' => 'Fee Structures',
    'campuses' => 'Campuses',
];

echo "📊 DATA STATUS IN DATABASE\n";
echo "═══════════════════════════════════════════════════════════════\n\n";

$emptyTables = [];
$populatedTables = [];

foreach ($tables as $table => $label) {
    try {
        $stmt = $pdo->query("SELECT COUNT(*) as count FROM `$table`");
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $count = $result['count'];

        if ($count == 0) {
            echo "❌ $label (" . str_pad($table, 20) . ") - EMPTY (0 records)\n";
            $emptyTables[$table] = $label;
        } else {
            echo "✅ $label (" . str_pad($table, 20) . ") - $count records\n";
            $populatedTables[$table] = $count;
        }
    } catch (Exception $e) {
        echo "❓ $label (" . str_pad($table, 20) . ") - TABLE NOT FOUND\n";
    }
}

echo "\n";
echo "════════════════════════════════════════════════════════════════\n\n";

echo "📈 SUMMARY\n";
echo "───────────────────────────────────────────────────────────────\n";
echo "Tables with data:  " . count($populatedTables) . "\n";
echo "Empty tables:      " . count($emptyTables) . "\n\n";

if (!empty($emptyTables)) {
    echo "❌ EMPTY TABLES (NEED DATA):\n";
    foreach ($emptyTables as $table => $label) {
        echo "  • $label ($table)\n";
    }
    echo "\n";
}

echo "✅ POPULATED TABLES:\n";
foreach ($populatedTables as $table => $count) {
    $label = $tables[$table] ?? $table;
    echo "  • $label: $count records\n";
}

echo "\n";
echo "════════════════════════════════════════════════════════════════\n\n";

// Check specific critical data
echo "🔍 CRITICAL DATA CHECK\n";
echo "───────────────────────────────────────────────────────────────\n";

$checks = [
    'Permission Categories' => 'SELECT COUNT(*) FROM permission_categories',
    'Permissions' => 'SELECT COUNT(*) FROM permissions',
    'Roles' => 'SELECT COUNT(*) FROM roles',
    'Role-Permission Mappings' => 'SELECT COUNT(*) FROM role_permissions',
    'Users' => 'SELECT COUNT(*) FROM users',
    'Active Users' => 'SELECT COUNT(*) FROM users WHERE is_active = 1',
    'Admin Users' => 'SELECT COUNT(*) FROM users WHERE role_id = 1',
];

foreach ($checks as $label => $query) {
    $stmt = $pdo->query($query);
    $result = $stmt->fetch(PDO::FETCH_COLUMN);
    $icon = $result > 0 ? '✅' : '❌';
    echo "$icon " . str_pad($label, 30) . " : $result\n";
}

echo "\n";
echo "════════════════════════════════════════════════════════════════\n\n";

echo "📝 WHAT NEEDS TO BE DONE\n";
echo "───────────────────────────────────────────────────────────────\n";

if (count($emptyTables) > 0) {
    echo "You need to:\n\n";

    foreach ($emptyTables as $table => $label) {
        echo "1. Populate: $label ($table)\n";
    }

    echo "\nOptions to populate data:\n";
    echo "  A) Import from existing database dump/backup\n";
    echo "  B) Use sample/seed data scripts\n";
    echo "  C) Manual data entry via admin panel\n";
    echo "  D) API endpoints to create records\n";
} else {
    echo "✅ All core tables have data!\n";
}

echo "\n";

?>

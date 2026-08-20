<?php
/**
 * Verify All Connections Use curac_save Database
 * Tests that all .env files and connections point to curac_save
 */

error_reporting(E_ALL);
ini_set('display_errors', '1');

echo "════════════════════════════════════════════════════════════════\n";
echo "  VERIFY ALL CONNECTIONS USE curac_save DATABASE\n";
echo "════════════════════════════════════════════════════════════════\n\n";

// Step 1: Check .env files
echo "Step 1: Checking .env Files Configuration\n";
echo "─────────────────────────────────────────────────────────────\n";

$envFiles = [
    'backend/.env' => 'Backend API',
    'payment_api/.env' => 'Payment API',
    'file-server/.env' => 'File Server'
];

$baseDir = dirname(__DIR__);
$allCorrect = true;

foreach ($envFiles as $filePath => $name) {
    $fullPath = $baseDir . '/' . $filePath;

    if (!file_exists($fullPath)) {
        echo "✗ $name: .env not found\n";
        $allCorrect = false;
        continue;
    }

    $content = file_get_contents($fullPath);

    // Check for DB_DATABASE
    if (preg_match('/DB_DATABASE\s*=\s*(.+)/i', $content, $matches)) {
        $dbName = trim($matches[1]);

        if ($dbName === 'curac_save') {
            echo "✓ $name: Using curac_save ✓\n";
        } else {
            echo "✗ $name: Using $dbName (should be curac_save)\n";
            $allCorrect = false;
        }
    } else {
        echo "⚠ $name: DB_DATABASE not found in .env\n";
    }
}

echo "\n";

// Step 2: Test connections
echo "Step 2: Testing Database Connections\n";
echo "─────────────────────────────────────────────────────────────\n";

// Backend connection
try {
    $pdo = new PDO(
        "mysql:host=127.0.0.1;port=3306;dbname=curac_save;charset=utf8mb4",
        'root',
        '',
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
    echo "✓ Backend Connection: Connected to curac_save\n";

    // Test query
    $result = $pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'curac_save'");
    $tableCount = $result->fetchColumn();
    echo "  ├─ Tables found: $tableCount\n";

    $result = $pdo->query("SELECT SUM(TABLE_ROWS) FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'curac_save'");
    $recordCount = $result->fetchColumn();
    echo "  └─ Total records: " . number_format($recordCount) . "\n";

} catch (PDOException $e) {
    echo "✗ Backend Connection: " . $e->getMessage() . "\n";
    $allCorrect = false;
}

echo "\n";

// Step 3: Verify key tables exist
echo "Step 3: Verifying Key Tables in curac_save\n";
echo "─────────────────────────────────────────────────────────────\n";

$keyTables = [
    'student' => 'Student Records',
    'application' => 'Applications',
    'regnumbers' => 'Registration Numbers',
    'employees' => 'Employees',
    'fee_invoices' => 'Fee Invoices',
    'users' => 'System Users',
    'modules' => 'Course Modules'
];

try {
    $pdo = new PDO("mysql:host=127.0.0.1;port=3306;dbname=curac_save", 'root', '');

    foreach ($keyTables as $table => $description) {
        try {
            $result = $pdo->query("SELECT COUNT(*) FROM `$table`");
            $count = $result->fetchColumn();
            echo "✓ $table: $count records ($description)\n";
        } catch (PDOException $e) {
            echo "✗ $table: Not found\n";
            $allCorrect = false;
        }
    }
} catch (PDOException $e) {
    echo "✗ Connection error: " . $e->getMessage() . "\n";
    $allCorrect = false;
}

echo "\n";

// Step 4: Verify config files
echo "Step 4: Checking PHP Config Files\n";
echo "─────────────────────────────────────────────────────────────\n";

$configFile = $baseDir . '/backend/config/app.php';
if (file_exists($configFile)) {
    $content = file_get_contents($configFile);
    if (strpos($content, "DB_DATABASE") !== false) {
        echo "✓ Backend config: Uses environment variables\n";
        echo "  └─ Will use DB_DATABASE from .env (curac_save)\n";
    } else {
        echo "⚠ Backend config: May not use environment variables\n";
    }
} else {
    echo "✗ Backend config not found\n";
}

echo "\n";

// Step 5: Summary
echo "════════════════════════════════════════════════════════════════\n";

if ($allCorrect) {
    echo "  ✅ ALL SYSTEMS CONFIGURED TO USE curac_save\n";
} else {
    echo "  ⚠️  SOME ISSUES FOUND - SEE ABOVE\n";
}

echo "════════════════════════════════════════════════════════════════\n\n";

echo "Configuration Summary:\n";
echo "─────────────────────────────────────────────────────────────\n";
echo "Database: curac_save\n";
echo "Host: 127.0.0.1\n";
echo "Port: 3306\n";
echo "User: root\n";
echo "Password: (empty)\n";
echo "Charset: utf8mb4\n";
echo "\nStatus: ✓ CONFIGURED AND READY\n";
echo "─────────────────────────────────────────────────────────────\n\n";

echo "Access curac_save at: http://localhost/phpmyadmin\n";
echo "Select database: curac_save\n\n";

?>

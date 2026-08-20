<?php
require_once __DIR__ . '/../vendor/autoload.php';
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
$dotenv->load();

$host = $_ENV['DB_HOST'] ?? '127.0.0.1';
$port = $_ENV['DB_PORT'] ?? '3306';
$db   = $_ENV['DB_DATABASE'] ?? 'curac_save';
$user = $_ENV['DB_USERNAME'] ?? 'root';
$pass = $_ENV['DB_PASSWORD'] ?? '';

$pdo = new PDO("mysql:host=$host;port=$port;dbname=$db;charset=utf8mb4", $user, $pass);

echo "Checking table names and structure...\n\n";

// Check for departments table
$tables = ['departements', 'departments'];
foreach ($tables as $t) {
    $stmt = $pdo->query("SHOW TABLES LIKE '$t'");
    if ($stmt->rowCount() > 0) {
        echo "✓ Found table: $t\n";
        $stmt = $pdo->query("SHOW COLUMNS FROM $t");
        $cols = $stmt->fetchAll();
        foreach ($cols as $col) {
            if (strpos(strtolower($col['Field']), 'id') !== false || strpos(strtolower($col['Field']), 'code') !== false) {
                echo "  - Column: " . $col['Field'] . " (" . $col['Type'] . ")\n";
            }
        }
    }
}

echo "\n";

// Check for faculty table
$tables = ['faculty', 'faculties'];
foreach ($tables as $t) {
    $stmt = $pdo->query("SHOW TABLES LIKE '$t'");
    if ($stmt->rowCount() > 0) {
        echo "✓ Found table: $t\n";
        $stmt = $pdo->query("SHOW COLUMNS FROM $t");
        $cols = $stmt->fetchAll();
        foreach ($cols as $col) {
            if (strpos(strtolower($col['Field']), 'id') !== false || strpos(strtolower($col['Field']), 'code') !== false) {
                echo "  - Column: " . $col['Field'] . " (" . $col['Type'] . ")\n";
            }
        }
    }
}

echo "\n";

// Get PK info
echo "Checking Primary Keys:\n";
$stmt = $pdo->query("SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA='$db' AND CONSTRAINT_NAME='PRIMARY' AND TABLE_NAME IN ('departements', 'faculty')");
$pks = $stmt->fetchAll();
foreach ($pks as $pk) {
    echo "  " . $pk['TABLE_NAME'] . " -> PK: " . $pk['COLUMN_NAME'] . "\n";
}
?>

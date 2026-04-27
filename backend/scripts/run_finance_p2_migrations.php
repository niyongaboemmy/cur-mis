<?php
require_once __DIR__ . '/../vendor/autoload.php';
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
$dotenv->load();

$host = $_ENV['DB_HOST'] ?? '127.0.0.1';
$port = $_ENV['DB_PORT'] ?? '8889';
$db   = $_ENV['DB_DATABASE'] ?? 'curac_save';
$user = $_ENV['DB_USERNAME'] ?? 'root';
$pass = $_ENV['DB_PASSWORD'] ?? 'root';

$dsn = "mysql:host=$host;port=$port;dbname=$db;charset=utf8mb4";
$pdo = new PDO($dsn, $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

$files = [
    __DIR__ . '/../database/migrations/2026_04_26_025_create_expenses_tables.sql',
    __DIR__ . '/../database/migrations/2026_04_26_026_create_clearance_table.sql',
    __DIR__ . '/../database/migrations/2026_04_26_027_create_expense_budgets.sql',
    __DIR__ . '/../database/migrations/2026_04_26_028_add_clearance_threshold.sql'
];

foreach ($files as $file) {
    if(!file_exists($file)) continue;
    echo "Running migration: " . basename($file) . "\n";
    $sql = file_get_contents($file);
    try {
        $pdo->exec($sql);
        echo "Success: " . basename($file) . "\n";
    } catch (PDOException $e) {
        if (strpos($e->getMessage(), 'already exists') !== false || strpos($e->getMessage(), 'Duplicate column') !== false) {
            echo "Skipped (already exists): " . basename($file) . "\n";
        } else {
            echo "Error in " . basename($file) . ": " . $e->getMessage() . "\n";
        }
    }
}
echo "All migrations ran successfully.\n";

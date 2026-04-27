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

$tables = ['academic_years', 'expense_categories', 'users'];
foreach ($tables as $t) {
    $stmt = $pdo->query("DESCRIBE `$t`");
    $res = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo "Table: $t\n";
    foreach ($res as $col) {
        if ($col['Key'] === 'PRI' || $col['Field'] === 'id') {
            echo "  {$col['Field']}: {$col['Type']}\n";
        }
    }
}

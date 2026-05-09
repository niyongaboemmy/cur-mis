<?php
require_once __DIR__ . '/backend/vendor/autoload.php';
if (file_exists(__DIR__ . '/backend/.env')) {
    $dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/backend/');
    $dotenv->load();
}
require_once __DIR__ . '/backend/config/app.php';
$dbHost = $_ENV['DB_HOST'] ?? '127.0.0.1';
$dbPort = $_ENV['DB_PORT'] ?? 8889;
$dbName = $_ENV['DB_DATABASE'] ?? 'cur_mis';
$dbUser = $_ENV['DB_USERNAME'] ?? 'root';
$dbPass = $_ENV['DB_PASSWORD'] ?? 'root';

try {
    $pdo = new PDO("mysql:host=$dbHost;port=$dbPort;dbname=$dbName;charset=utf8mb4", $dbUser, $dbPass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    $sql = file_get_contents(__DIR__ . '/backend/database/migrations/2026_05_09_057_module_marks_exemptions.sql');
    $pdo->exec($sql);
    echo "Migration successful.\n";
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}

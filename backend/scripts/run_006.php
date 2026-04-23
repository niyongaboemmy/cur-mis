<?php
require_once __DIR__ . '/../vendor/autoload.php';
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
$dotenv->load();

$host = $_ENV['DB_HOST'] ?? '127.0.0.1';
$port = $_ENV['DB_PORT'] ?? '8889';
$db   = $_ENV['DB_DATABASE'] ?? 'curac_save';
$user = $_ENV['DB_USERNAME'] ?? 'root';
$pass = $_ENV['DB_PASSWORD'] ?? 'root';

$pdo = new PDO("mysql:host=$host;port=$port;dbname=$db;charset=utf8mb4", $user, $pass);
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$sql = file_get_contents(__DIR__ . '/../database/migrations/2024_04_21_006_create_academic_terms.sql');
try {
    $pdo->exec($sql);
    echo "Migration 006 successful.\n";
} catch (PDOException $e) {
    echo "Error: " . $e->getMessage() . "\n";
}

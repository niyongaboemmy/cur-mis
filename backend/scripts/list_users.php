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
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

echo "All Users in System:\n";
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";

$stmt = $pdo->query("SELECT u.id, u.email, u.full_name, r.name as role_name, u.is_active FROM users u LEFT JOIN roles r ON r.id = u.role_id ORDER BY u.id");
$users = $stmt->fetchAll(PDO::FETCH_ASSOC);

if (empty($users)) {
    echo "No users found\n";
} else {
    foreach ($users as $u) {
        $active = $u['is_active'] ? '✓' : '✗';
        echo "[$active] ID:" . str_pad($u['id'], 3) . " | " . str_pad($u['email'], 40) . " | " . str_pad($u['full_name'], 30) . " | " . $u['role_name'] . "\n";
    }
}

echo "\n";
echo "Total: " . count($users) . " users\n";
?>

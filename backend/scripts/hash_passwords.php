<?php
require_once __DIR__ . '/../vendor/autoload.php';
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
$dotenv->load();

use Core\Database;

echo "--- Password Hashing Tool ---\n";

$db = Database::getInstance();
$users = $db->fetchAll("SELECT id, username, password FROM users");

foreach ($users as $user) {
    $plainPassword = $user['password'];
    
    // Check if already hashed (bcrypt hashes start with $2y$)
    if (str_starts_with($plainPassword, '$2y$')) {
        echo "⏭️ Skipping already hashed password for user: {$user['username']}\n";
        continue;
    }

    echo "🔐 Hashing password for user: {$user['username']}...\n";
    $hashedPassword = password_hash($plainPassword, PASSWORD_BCRYPT);
    
    $db->execute("UPDATE users SET password = :pw WHERE id = :id", [
        'pw' => $hashedPassword,
        'id' => $user['id']
    ]);
}

echo "✅ All passwords have been secured.\n";

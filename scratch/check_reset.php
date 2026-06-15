<?php
require 'c:/xampp/htdocs/cur-mis/backend/vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable('c:/xampp/htdocs/cur-mis/backend');
$dotenv->load();

try {
    $pdo = new PDO(
        'mysql:host=127.0.0.1;port=3306;dbname=curac_save;charset=utf8mb4',
        'root',
        '',
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
    
    $stmt = $pdo->query("SHOW COLUMNS FROM users");
    $cols = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo "DB connection OK!\n\n";
    echo "users table columns:\n";
    foreach ($cols as $col) {
        echo "  - {$col['Field']} ({$col['Type']})" . ($col['Null'] === 'YES' ? ' NULLABLE' : '') . "\n";
    }
    
    // Check if the required columns for reset exist
    $colNames = array_column($cols, 'Field');
    $needed = ['reset_token', 'reset_token_expires_at', 'otp_code', 'otp_expires_at'];
    echo "\nReset password column check:\n";
    foreach ($needed as $c) {
        $exists = in_array($c, $colNames);
        echo "  - {$c}: " . ($exists ? "EXISTS" : "MISSING!") . "\n";
    }
    
} catch (Exception $e) {
    echo "DB ERROR: " . $e->getMessage() . "\n";
}

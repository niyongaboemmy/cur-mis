<?php
require_once __DIR__ . '/backend/vendor/autoload.php';

// Assuming there's a config file or I can just use the ENV
$socket = '/Applications/MAMP/tmp/mysql/mysql.sock';
$db   = 'curac_save';
$user = 'root';
$pass = 'root'; 
$charset = 'utf8mb4';

$dsn = "mysql:unix_socket=$socket;dbname=$db;charset=$charset";
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
];

try {
     $pdo = new PDO($dsn, $user, $pass, $options);
     
     echo "Checking 'departements' table...\n";
     $stmt = $pdo->query("SHOW CREATE TABLE `departements`");
     print_r($stmt->fetch());
     
     echo "\nChecking 'fee_structures' table...\n";
     $stmt = $pdo->query("SHOW CREATE TABLE `fee_structures`");
     print_r($stmt->fetch());

} catch (\PDOException $e) {
     echo "Error: " . $e->getMessage();
}

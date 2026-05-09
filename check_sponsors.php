<?php
$socket = '/Applications/MAMP/tmp/mysql/mysql.sock';
$db   = 'curac_save';
$user = 'root';
$pass = 'root'; 

try {
     $pdo = new PDO("mysql:unix_socket=$socket;dbname=$db;charset=utf8mb4", $user, $pass);
     $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
     
     $stmt = $pdo->query("SHOW CREATE TABLE `sponsors`");
     print_r($stmt->fetch());

     $stmt = $pdo->query("SHOW CREATE TABLE `fee_bursaries`");
     print_r($stmt->fetch());
     
     $stmt = $pdo->query("SELECT COUNT(*) FROM `sponsors`");
     echo "Sponsors count: " . $stmt->fetchColumn() . "\n";
} catch (Exception $e) {
     echo "Error: " . $e->getMessage() . "\n";
}

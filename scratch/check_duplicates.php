<?php
require_once dirname(__DIR__) . '/backend/vendor/autoload.php';

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
     
     echo "Checking for sponsor with ID 0...\n";
     $stmt = $pdo->query("SELECT * FROM sponsors WHERE id = 0");
     $res = $stmt->fetchAll();
     print_r($res);

     echo "\nChecking for bursaries with sponsor_id = 0...\n";
     $stmt = $pdo->query("SELECT student_id, bursary_type, sponsor_id FROM fee_bursaries WHERE sponsor_id = 0 OR sponsor_id IS NULL LIMIT 10");
     $res = $stmt->fetchAll();
     print_r($res);

     echo "\nChecking for duplicates (students in both unassigned and unicef)...\n";
     $stmt = $pdo->query("
        SELECT b1.student_id, b1.bursary_type as unassigned_type, b2.bursary_type as sponsored_type, s.name as sponsor_name
        FROM fee_bursaries b1
        JOIN fee_bursaries b2 ON b1.student_id = b2.student_id
        JOIN sponsors s ON s.id = b2.sponsor_id
        WHERE (b1.sponsor_id IS NULL OR b1.sponsor_id = 0)
          AND (b2.sponsor_id IS NOT NULL AND b2.sponsor_id > 0)
     ");
     $res = $stmt->fetchAll();
     print_r($res);

} catch (\PDOException $e) {
     echo "Error: " . $e->getMessage();
}

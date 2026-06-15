<?php
$dsn = 'mysql:host=127.0.0.1;port=3306;dbname=curac_save;charset=utf8mb4';
$user = 'root';
$pass = '';
$options = [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
];

try {
    $pdo = new PDO($dsn, $user, $pass, $options);
    echo "Connected to curac_save\n";
    $tables = $pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
    echo "Tables: " . count($tables) . "\n";
    echo implode("\n", array_slice($tables, 0, 50)) . "\n";
    echo "\nChecking key tables counts...\n";
    $check = [
        'users',
        'roles',
        'student',
        'student_applications',
        'applicant_profiles',
        'application_documents',
        'admission_offers',
        'fee_invoices',
        'fee_payments',
        'payment',
        'fee_structures',
        'fee_bursaries',
        'departements',
        'options',
        'campuses',
        'levels',
        'academic_years',
        'academic_terms',
        'api_authorization',
        'settings'
    ];
    foreach ($check as $table) {
        $stmt = $pdo->query("SELECT COUNT(*) as c FROM `$table`");
        $row = $stmt->fetch();
        echo sprintf("%s: %d\n", $table, $row['c'] ?? 0);
    }
} catch (PDOException $e) {
    echo 'DB ERROR: ' . $e->getMessage() . "\n";
    exit(1);
}

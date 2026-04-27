<?php
require_once __DIR__ . '/../backend/core/Database.php';

use Core\Database;

// Mock environment for Database.php
if (!isset($_ENV['DB_HOST'])) {
    // Try to load from .env if it exists
    $envFile = __DIR__ . '/../backend/.env';

    if (file_exists($envFile)) {
        $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            if (strpos(trim($line), '#') === 0) continue;
            list($name, $value) = explode('=', $line, 2);
            $_ENV[trim($name)] = trim($value, " \t\n\r\0\x0B\"'");
        }
    }
}

try {
    $db = Database::getInstance();
    $stats = $db->fetchOne("
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN LOWER(student_state) = 'active' THEN 1 ELSE 0 END) as active_lower,
            SUM(CASE WHEN student_state = 'active' THEN 1 ELSE 0 END) as active_exact
        FROM student
    ");
    echo "Student Stats:\n";
    print_r($stats);
    
    $sample = $db->fetchAll("SELECT regnumber, fname, lname, student_state FROM student LIMIT 5");
    echo "\nSample Students:\n";
    print_r($sample);

} catch (\Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}

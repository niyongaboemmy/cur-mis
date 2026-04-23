<?php
require 'backend/core/Database.php';

// Mock getenv or use .env if possible
function loadEnv($path) {
    if (!file_exists($path)) return;
    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        if (strpos(trim($line), '#') === 0) continue;
        list($name, $value) = explode('=', $line, 2);
        $_ENV[trim($name)] = trim($value);
        putenv(trim($name)."=".trim($value));
    }
}

loadEnv(__DIR__ . '/backend/.env');

try {
    $db = Core\Database::getInstance();
    $db->query("SELECT 1 FROM intakes LIMIT 1");
    echo "INTAKES_EXISTS\n";
} catch (Exception $e) {
    echo "INTAKES_MISSING: " . $e->getMessage() . "\n";
}

try {
    $db->query("SELECT email_verified FROM student_applications LIMIT 1");
    echo "COLUMNS_EXISTS\n";
} catch (Exception $e) {
    echo "COLUMNS_MISSING: " . $e->getMessage() . "\n";
}

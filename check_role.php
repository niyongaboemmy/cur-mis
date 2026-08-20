<?php
require 'backend/core/Database.php';
require 'backend/app/Models/BaseModel.php';
require 'backend/app/Models/RoleModel.php';

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
    $role = $db->fetchOne("SELECT * FROM roles WHERE name = 'applicant'");
    echo $role ? "ROLE_EXISTS: " . $role['id'] . "\n" : "ROLE_MISSING\n";
} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
}

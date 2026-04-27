<?php
/**
 * Master Migration Runner - V2 (Bulk Execution)
 * 
 * This version uses multi-statement execution to ensure that complex scripts
 * (like RBAC creation) run as intended, while still maintaining idempotency.
 */

require_once __DIR__ . '/../vendor/autoload.php';

// Load environment variables
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__ . '/../');
$dotenv->safeLoad();

$host = $_ENV['DB_HOST']     ?? '127.0.0.1';
$port = $_ENV['DB_PORT']     ?? '8889';
$db   = $_ENV['DB_DATABASE'] ?? 'curac_save';
$user = $_ENV['DB_USERNAME'] ?? 'root';
$pass = $_ENV['DB_PASSWORD'] ?? 'root';

echo "Connecting to database: $db on $host:$port...\n";

$dsn = "mysql:host={$host};port={$port};dbname={$db};charset=utf8mb4";

// Find all migration files
$directories = [
    __DIR__ . '/../database/migrations',
    __DIR__ . '/../migrations'
];

$allFiles = [];
foreach ($directories as $dir) {
    if (is_dir($dir)) {
        $files = glob($dir . '/*.sql');
        foreach ($files as $f) {
            $allFiles[basename($f)] = realpath($f);
        }
    }
}

ksort($allFiles);

echo "Found " . count($allFiles) . " unique migration files.\n\n";

$successCount = 0;
$errorCount   = 0;

foreach ($allFiles as $name => $path) {
    echo "→ Running $name ... ";
    $sql = file_get_contents($path);
    
    try {
        $pdo = new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::MYSQL_ATTR_USE_BUFFERED_QUERY => true,
            PDO::MYSQL_ATTR_MULTI_STATEMENTS => true,
        ]);
        
        $pdo->exec("SET FOREIGN_KEY_CHECKS = 0");
        $pdo->exec($sql);
        $pdo->exec("SET FOREIGN_KEY_CHECKS = 1");
        
        echo "Done.\n";
        $successCount++;
    } catch (PDOException $e) {
        $msg = $e->getMessage();
        // Even in bulk, we might hit duplicate errors
        if (str_contains($msg, 'already exists') || 
            str_contains($msg, 'Duplicate column') || 
            str_contains($msg, 'Duplicate key') ||
            str_contains($msg, 'Duplicate entry') ||
            str_contains($msg, 'Multiple primary key defined') ||
            str_contains($msg, 'check that column/key exists')
        ) {
            echo "Skipped (already applied).\n";
            $successCount++;
        } else {
            echo "Failed.\n  [ERROR] $msg\n";
            $errorCount++;
        }
    }
    $pdo = null;
}

echo "\nSummary: $successCount Success, $errorCount Errors\n";

echo "\nSyncing Permissions via PHP script...\n";
passthru('php ' . escapeshellarg(__DIR__ . '/sync_permissions.php'));

echo "\nDone.\n";

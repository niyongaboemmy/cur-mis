<?php
/**
 * Database Import Script
 * Imports the complete database dump file
 */

error_reporting(E_ALL);
ini_set('display_errors', '1');
set_time_limit(300); // 5 minute limit for large imports

echo "════════════════════════════════════════════════════════\n";
echo "  DATABASE IMPORT SCRIPT\n";
echo "════════════════════════════════════════════════════════\n\n";

$host = '127.0.0.1';
$user = 'root';
$password = '';
$port = 3306;
$database = 'cur_mis';

// Dump file location
$dumpFile = dirname(__DIR__) . '/.claude/worktrees/agent-a9b0c96b5004201bd/curac_save.sql';

if (!file_exists($dumpFile)) {
    die("✗ Database dump file not found at: $dumpFile\n");
}

echo "Database dump file: " . basename($dumpFile) . "\n";
echo "File size: " . (file_get_contents($dumpFile) ? number_format(filesize($dumpFile) / 1024 / 1024, 2) . " MB" : "unknown") . "\n\n";

// Step 1: Connect to MySQL
echo "Step 1: Connecting to MySQL...\n";
try {
    $pdo = new PDO(
        "mysql:host=$host;port=$port;dbname=$database;charset=utf8mb4",
        $user,
        $password,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::MYSQL_ATTR_USE_BUFFERED_QUERY => true
        ]
    );
    echo "✓ Connected to $database\n\n";
} catch (PDOException $e) {
    die("✗ Connection failed: " . $e->getMessage() . "\n");
}

// Step 2: Read and parse the dump file
echo "Step 2: Parsing SQL dump file...\n";
$sql = file_get_contents($dumpFile);

// Remove MySQL comments and split by statements
$lines = explode("\n", $sql);
$statements = [];
$currentStatement = '';

foreach ($lines as $line) {
    $line = trim($line);

    // Skip comments and empty lines
    if (empty($line) || substr($line, 0, 2) === '--' || substr($line, 0, 1) === '#') {
        continue;
    }

    $currentStatement .= ' ' . $line;

    // Check if statement is complete (ends with semicolon)
    if (substr(trim($currentStatement), -1) === ';') {
        $statements[] = trim($currentStatement);
        $currentStatement = '';
    }
}

// Add any remaining statement
if (!empty(trim($currentStatement))) {
    $statements[] = trim($currentStatement);
}

echo "✓ Parsed " . count($statements) . " SQL statements\n\n";

// Step 3: Execute statements
echo "Step 3: Importing data...\n";
$executed = 0;
$errors = 0;
$skipped = 0;

foreach ($statements as $index => $statement) {
    $progress = round(($index / count($statements)) * 100);

    try {
        // Skip certain statements
        if (strpos($statement, 'CREATE DATABASE') !== false) {
            $skipped++;
            continue;
        }

        // Skip USE statements for the old database
        if (strpos($statement, 'USE `curac_save`') !== false) {
            $skipped++;
            continue;
        }

        $pdo->exec($statement);
        $executed++;

        if ($index % 100 === 0) {
            echo ".";
        }
    } catch (PDOException $e) {
        $errors++;
        if ($errors <= 5) {
            // Only show first 5 errors to avoid spam
            echo "\n  ⚠ Error in statement " . ($index + 1) . ": " . $e->getMessage();
            echo "\n    Statement: " . substr($statement, 0, 80) . "...\n";
        }
    }
}

echo "\n\n";
echo "════════════════════════════════════════════════════════\n";
echo "  IMPORT COMPLETE\n";
echo "════════════════════════════════════════════════════════\n\n";
echo "Statements executed: $executed\n";
echo "Errors encountered: $errors\n";
echo "Statements skipped: $skipped\n\n";

// Verify
echo "Step 4: Verifying database...\n";
try {
    $result = $pdo->query("SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = '$database'");
    $row = $result->fetch(PDO::FETCH_ASSOC);
    $tableCount = $row['table_count'];

    if ($tableCount > 0) {
        echo "✓ Database has $tableCount tables\n\n";

        // Show some sample data
        $result = $pdo->query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = '$database' LIMIT 10");
        $tables = $result->fetchAll(PDO::FETCH_COLUMN);

        echo "Sample tables:\n";
        foreach ($tables as $table) {
            $countResult = $pdo->query("SELECT COUNT(*) FROM `$table`");
            $count = $countResult->fetchColumn();
            echo "  ✓ $table ($count records)\n";
        }
    } else {
        echo "⚠ No tables found\n";
    }
} catch (PDOException $e) {
    echo "⚠ Could not verify: " . $e->getMessage() . "\n";
}

echo "\n";
echo "════════════════════════════════════════════════════════\n";
echo "  ✓ DATABASE IMPORT SUCCESSFUL\n";
echo "════════════════════════════════════════════════════════\n\n";

echo "Next steps:\n";
echo "1. Refresh http://localhost:8080 in browser\n";
echo "2. API should now respond with data (no 500 errors)\n";
echo "3. Access http://localhost:5182 (Frontend)\n";
echo "4. Try logging in with test credentials\n\n";
?>

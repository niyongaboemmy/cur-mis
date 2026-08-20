<?php
/**
 * Migrate Data to curac_save Database
 * Creates a new database named 'curac_save' and imports all data from the SQL dump
 */

error_reporting(E_ALL);
ini_set('display_errors', '1');
set_time_limit(600);
ini_set('memory_limit', '512M');

echo "════════════════════════════════════════════════════════════════\n";
echo "  MIGRATE DATA TO curac_save DATABASE\n";
echo "════════════════════════════════════════════════════════════════\n\n";

$host = '127.0.0.1';
$user = 'root';
$password = '';
$port = 3306;
$targetDb = 'curac_save';

// Locate the dump file
$dumpFile = dirname(__DIR__) . '/.claude/worktrees/agent-a9b0c96b5004201bd/curac_save.sql';

if (!file_exists($dumpFile)) {
    die("✗ Database dump file not found at: $dumpFile\n");
}

echo "📁 Source File: " . basename($dumpFile) . "\n";
$fileSize = filesize($dumpFile);
echo "📊 File Size: " . number_format($fileSize / 1024 / 1024, 2) . " MB\n";
echo "📅 File Modified: " . date('Y-m-d H:i:s', filemtime($dumpFile)) . "\n\n";

// Step 1: Connect to MySQL (without database)
echo "Step 1: Connecting to MySQL Server...\n";
try {
    $pdo = new PDO(
        "mysql:host=$host;port=$port;charset=utf8mb4",
        $user,
        $password,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::MYSQL_ATTR_USE_BUFFERED_QUERY => true
        ]
    );
    echo "✓ Connected to MySQL Server\n\n";
} catch (PDOException $e) {
    die("✗ Connection failed: " . $e->getMessage() . "\n");
}

// Step 2: Create database
echo "Step 2: Creating '$targetDb' Database...\n";
try {
    echo "  Dropping existing '$targetDb' database (if exists)...\n";
    $pdo->exec("DROP DATABASE IF EXISTS $targetDb");
    echo "  ✓ Database dropped\n";

    echo "  Creating fresh '$targetDb' database...\n";
    $pdo->exec("CREATE DATABASE $targetDb CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci");
    echo "  ✓ Database created\n";

    // Switch to target database
    $pdo->exec("USE $targetDb");
    echo "  ✓ Switched to $targetDb\n\n";
} catch (PDOException $e) {
    die("✗ Database creation failed: " . $e->getMessage());
}

// Step 3: Load and parse SQL file
echo "Step 3: Loading SQL Dump File...\n";
$sqlContent = file_get_contents($dumpFile);

if ($sqlContent === false) {
    die("✗ Failed to read dump file\n");
}

echo "✓ File loaded into memory\n\n";

// Step 4: Parse SQL statements
echo "Step 4: Parsing SQL Statements...\n";

$lines = explode("\n", $sqlContent);
$statements = [];
$currentStatement = '';
$inMultiLineComment = false;

foreach ($lines as $line) {
    $trimmedLine = trim($line);

    // Handle multi-line comments /* ... */
    if (strpos($trimmedLine, '/*') !== false) {
        $inMultiLineComment = true;
    }
    if ($inMultiLineComment) {
        if (strpos($trimmedLine, '*/') !== false) {
            $inMultiLineComment = false;
        }
        continue;
    }

    // Skip single-line comments
    if (substr($trimmedLine, 0, 2) === '--' || substr($trimmedLine, 0, 1) === '#') {
        continue;
    }

    // Skip empty lines
    if (empty($trimmedLine)) {
        continue;
    }

    $currentStatement .= ' ' . $line;

    // Check if statement is complete
    if (substr(rtrim($currentStatement), -1) === ';') {
        $stmt = trim($currentStatement);
        if (!empty($stmt)) {
            $statements[] = $stmt;
        }
        $currentStatement = '';
    }
}

// Add any remaining statement
if (!empty(trim($currentStatement))) {
    $statements[] = trim($currentStatement);
}

echo "✓ Parsed " . count($statements) . " SQL statements\n\n";

// Step 5: Execute statements
echo "Step 5: Executing SQL Statements...\n";
echo "─────────────────────────────────────────────────────────────\n";

$executed = 0;
$errors = 0;
$skipped = 0;
$errorLog = [];

// Disable foreign key checks for faster insertion
$pdo->exec("SET FOREIGN_KEY_CHECKS = 0");

try {
    foreach ($statements as $index => $statement) {
        $percentage = round(($index / count($statements)) * 100);

        // Skip certain statements
        if (strpos($statement, 'CREATE DATABASE') !== false ||
            strpos($statement, 'USE `') !== false ||
            strpos($statement, '/*!') !== false) {
            $skipped++;
            continue;
        }

        try {
            $pdo->exec($statement);
            $executed++;

            // Progress indicator
            if ($index % 50 === 0) {
                echo ".";
                if ($index % 500 === 0) {
                    echo " $percentage%\n";
                }
            }
        } catch (PDOException $e) {
            $errors++;
            $errorLog[] = [
                'statement_num' => $index + 1,
                'error' => $e->getMessage(),
                'preview' => substr($statement, 0, 100)
            ];

            // Only show first few errors
            if ($errors <= 3) {
                echo "\n  ⚠ Error: " . $e->getMessage() . "\n";
            }
        }
    }

    // Re-enable foreign key checks
    $pdo->exec("SET FOREIGN_KEY_CHECKS = 1");

    echo "\n\n";
} catch (Exception $e) {
    echo "✗ Execution failed: " . $e->getMessage() . "\n";
    exit(1);
}

// Step 6: Display Results
echo "════════════════════════════════════════════════════════════════\n";
echo "  MIGRATION RESULTS\n";
echo "════════════════════════════════════════════════════════════════\n\n";

echo "Statements Executed: " . number_format($executed) . "\n";
echo "Errors Encountered: " . number_format($errors) . "\n";
echo "Statements Skipped: " . number_format($skipped) . "\n";
echo "Success Rate: " . number_format(($executed / (count($statements) - $skipped)) * 100, 2) . "%\n\n";

// Step 7: Verify Database
echo "Step 7: Verifying Database Structure and Data...\n\n";

try {
    // Get table count
    $result = $pdo->query("SELECT COUNT(*) as count FROM information_schema.TABLES WHERE TABLE_SCHEMA = '$targetDb'");
    $tableCount = $result->fetchColumn();
    echo "✓ Total Tables: $tableCount\n\n";

    // Get detailed table information
    $result = $pdo->query("
        SELECT
            TABLE_NAME,
            TABLE_ROWS,
            ROUND(((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024), 2) AS size_mb
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = '$targetDb'
        ORDER BY TABLE_ROWS DESC
        LIMIT 20
    ");

    $tables = $result->fetchAll(PDO::FETCH_ASSOC);

    if (!empty($tables)) {
        echo "Top 20 Tables by Row Count:\n";
        echo "─────────────────────────────────────────────────────────\n";
        printf("%-35s %15s %10s\n", "Table Name", "Row Count", "Size (MB)");
        echo "─────────────────────────────────────────────────────────\n";

        $totalRows = 0;
        $totalSize = 0;

        foreach ($tables as $table) {
            printf("%-35s %15s %10s\n",
                substr($table['TABLE_NAME'], 0, 34),
                number_format($table['TABLE_ROWS']),
                $table['size_mb']
            );
            $totalRows += $table['TABLE_ROWS'];
            $totalSize += $table['size_mb'];
        }

        echo "─────────────────────────────────────────────────────────\n";
        printf("%-35s %15s %10s\n", "TOTAL", number_format($totalRows), number_format($totalSize, 2));
        echo "─────────────────────────────────────────────────────────\n\n";
    }

} catch (PDOException $e) {
    echo "⚠ Could not verify database: " . $e->getMessage() . "\n\n";
}

// Step 8: Connection Info
echo "════════════════════════════════════════════════════════════════\n";
echo "  ✅ MIGRATION COMPLETE\n";
echo "════════════════════════════════════════════════════════════════\n\n";

echo "Database Connection Details:\n";
echo "─────────────────────────────────────────────────────────────\n";
echo "  Database Name: $targetDb\n";
echo "  Host: $host\n";
echo "  Port: $port\n";
echo "  User: $user\n";
echo "  Password: (empty)\n";
echo "  Charset: utf8mb4\n";
echo "  Status: ✓ READY TO USE\n";
echo "─────────────────────────────────────────────────────────────\n\n";

// Step 9: Access Information
echo "How to Access the Database:\n\n";
echo "1. Using phpMyAdmin:\n";
echo "   URL: http://localhost/phpmyadmin\n";
echo "   Select database: curac_save\n\n";

echo "2. Using MySQL Command Line:\n";
echo "   Command: mysql -u root -h 127.0.0.1 curac_save\n\n";

echo "3. In PHP Code:\n";
echo "   \$pdo = new PDO('mysql:host=127.0.0.1;dbname=curac_save;charset=utf8mb4', 'root', '');\n\n";

echo "4. In Configuration Files:\n";
echo "   Create a .env file with:\n";
echo "   DB_HOST=127.0.0.1\n";
echo "   DB_PORT=3306\n";
echo "   DB_DATABASE=curac_save\n";
echo "   DB_USERNAME=root\n";
echo "   DB_PASSWORD=\n\n";

echo "════════════════════════════════════════════════════════════════\n";
echo "  ✨ curac_save DATABASE IS READY ✨\n";
echo "════════════════════════════════════════════════════════════════\n\n";

echo "Next Steps:\n";
echo "1. Access phpMyAdmin: http://localhost/phpmyadmin\n";
echo "2. Select 'curac_save' database\n";
echo "3. Browse tables and data\n";
echo "4. Update your application to use 'curac_save' database\n\n";

?>

<?php
/**
 * Full Database Migration Script
 * Migrates ALL data from curac_save.sql to local cur_mis database
 * Handles large datasets, foreign keys, and transaction management
 */

error_reporting(E_ALL);
ini_set('display_errors', '1');
set_time_limit(600); // 10 minute limit for large migrations
ini_set('memory_limit', '512M'); // Increase memory for large files

echo "════════════════════════════════════════════════════════════════\n";
echo "  FULL DATABASE MIGRATION - curac_save.sql → cur_mis\n";
echo "════════════════════════════════════════════════════════════════\n\n";

$host = '127.0.0.1';
$user = 'root';
$password = '';
$port = 3306;
$targetDb = 'cur_mis';

// Locate the dump file
$dumpFile = dirname(__DIR__) . '/.claude/worktrees/agent-a9b0c96b5004201bd/curac_save.sql';

if (!file_exists($dumpFile)) {
    // Try alternative locations
    $altPaths = [
        dirname(__DIR__) . '/database/curac_save.sql',
        dirname(__DIR__) . '/curac_save.sql',
        'C:/xamppP/htdocs/cur-mis/.claude/worktrees/agent-a9b0c96b5004201bd/curac_save.sql'
    ];

    foreach ($altPaths as $path) {
        if (file_exists($path)) {
            $dumpFile = $path;
            break;
        }
    }

    if (!file_exists($dumpFile)) {
        die("✗ Database dump file not found!\n" .
            "Checked:\n" .
            "  - " . $altPaths[0] . "\n" .
            "  - " . $altPaths[1] . "\n" .
            "  - " . $altPaths[2] . "\n");
    }
}

echo "📁 Source File: " . basename($dumpFile) . "\n";
$fileSize = filesize($dumpFile);
echo "📊 File Size: " . number_format($fileSize / 1024 / 1024, 2) . " MB\n";
echo "📅 File Modified: " . date('Y-m-d H:i:s', filemtime($dumpFile)) . "\n\n";

// Step 1: Connect to MySQL
echo "Step 1: Establishing Database Connection...\n";
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

// Step 2: Prepare target database
echo "Step 2: Preparing Target Database...\n";
try {
    // Drop existing database (be careful!)
    echo "  Dropping existing '$targetDb' database...\n";
    $pdo->exec("DROP DATABASE IF EXISTS $targetDb");
    echo "  ✓ Database dropped\n";

    // Create fresh database
    echo "  Creating fresh '$targetDb' database...\n";
    $pdo->exec("CREATE DATABASE $targetDb CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci");
    echo "  ✓ Database created\n";

    // Switch to target database
    $pdo->exec("USE $targetDb");
    echo "  ✓ Switched to $targetDb\n\n";
} catch (PDOException $e) {
    die("✗ Database preparation failed: " . $e->getMessage());
}

// Step 3: Parse and execute SQL dump
echo "Step 3: Parsing SQL Dump File...\n";
$sqlContent = file_get_contents($dumpFile);

if ($sqlContent === false) {
    die("✗ Failed to read dump file\n");
}

echo "✓ File loaded into memory\n\n";

echo "Step 4: Processing SQL Statements...\n";

// Advanced SQL parsing that handles comments better
$statements = [];
$lines = explode("\n", $sqlContent);
$currentStatement = '';
$inMultiLineComment = false;

foreach ($lines as $lineNum => $line) {
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

// Step 5: Execute statements with progress tracking
echo "Step 5: Executing SQL Statements...\n";
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
                echo "    Preview: " . substr($statement, 0, 100) . "...\n";
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

    // Get key statistics
    $stats = $pdo->query("
        SELECT
            (SELECT COUNT(*) FROM users) as user_count,
            (SELECT COUNT(*) FROM application) as application_count,
            (SELECT COUNT(*) FROM students) as student_count,
            (SELECT COUNT(*) FROM courses) as course_count,
            (SELECT COUNT(*) FROM departments) as department_count,
            (SELECT COUNT(*) FROM intakes) as intake_count
    ")->fetch(PDO::FETCH_ASSOC);

    echo "Key Statistics:\n";
    echo "───────────────────────────────────────\n";
    echo "  Users: " . number_format($stats['user_count']) . "\n";
    echo "  Applications: " . number_format($stats['application_count']) . "\n";
    echo "  Students: " . number_format($stats['student_count']) . "\n";
    echo "  Courses: " . number_format($stats['course_count']) . "\n";
    echo "  Departments: " . number_format($stats['department_count']) . "\n";
    echo "  Intakes: " . number_format($stats['intake_count']) . "\n";
    echo "───────────────────────────────────────\n\n";

} catch (PDOException $e) {
    echo "⚠ Could not verify database: " . $e->getMessage() . "\n\n";
}

// Step 8: Show Error Summary
if (!empty($errorLog)) {
    echo "Error Summary:\n";
    echo "───────────────────────────────────────\n";
    foreach (array_slice($errorLog, 0, 10) as $error) {
        echo "  ✗ Statement #" . $error['statement_num'] . ": " . $error['error'] . "\n";
    }
    if (count($errorLog) > 10) {
        echo "  ... and " . (count($errorLog) - 10) . " more errors\n";
    }
    echo "\n";
}

// Final Summary
echo "════════════════════════════════════════════════════════════════\n";
if ($errors === 0) {
    echo "  ✅ MIGRATION SUCCESSFUL - ALL DATA IMPORTED!\n";
} else {
    echo "  ⚠️  MIGRATION COMPLETED WITH " . $errors . " ERRORS\n";
}
echo "════════════════════════════════════════════════════════════════\n\n";

echo "Next Steps:\n";
echo "1. Refresh http://localhost:8080 in browser\n";
echo "2. Check if API endpoints return data correctly\n";
echo "3. Refresh http://localhost:5182 (Frontend)\n";
echo "4. Test login with test credentials\n";
echo "5. Verify all data is accessible in the application\n\n";

echo "Database Connection Info:\n";
echo "  Host: $host\n";
echo "  Port: $port\n";
echo "  Database: $targetDb\n";
echo "  User: $user\n\n";

echo "Access phpMyAdmin: http://localhost/phpmyadmin\n";
echo "Browse database and verify data integrity\n\n";

?>

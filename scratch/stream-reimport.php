<?php
/**
 * Streaming Database Import from SQL Dump
 * Reads file in chunks to avoid memory exhaustion
 */

$dumpFile = __DIR__ . '/../curac_save.sql';

if (!file_exists($dumpFile)) {
    echo "✗ Dump file not found: $dumpFile\n";
    exit(1);
}

$fileSize = filesize($dumpFile);
$fileSizeMB = $fileSize / (1024 * 1024);

echo "════════════════════════════════════════════════════════════════\n";
echo "  STREAMING DATABASE RE-IMPORT\n";
echo "════════════════════════════════════════════════════════════════\n\n";

echo "Source File: curac_save.sql\n";
echo "File Size: " . round($fileSizeMB, 2) . " MB\n\n";

try {
    $pdo = new PDO('mysql:host=127.0.0.1;dbname=curac_save', 'root', '');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_SILENT);

    echo "Step 1: Disabling foreign key checks...\n";
    echo "─────────────────────────────────────────────────────────────\n";
    $pdo->exec("SET FOREIGN_KEY_CHECKS = 0");
    echo "✓ Foreign key checks disabled\n\n";

    echo "Step 2: Opening SQL file stream...\n";
    echo "─────────────────────────────────────────────────────────────\n";

    $handle = fopen($dumpFile, 'r');
    if (!$handle) {
        echo "✗ Cannot open file: $dumpFile\n";
        exit(1);
    }

    $buffer = '';
    $lineCount = 0;
    $statementCount = 0;
    $bytesRead = 0;
    $startTime = time();

    echo "Processing SQL statements...\n\n";

    while (!feof($handle)) {
        $chunk = fread($handle, 8192); // Read 8KB at a time
        $bytesRead += strlen($chunk);
        $buffer .= $chunk;

        // Process complete statements
        while (true) {
            // Find next statement terminator
            $pos = strpos($buffer, ";\n");
            if ($pos === false) {
                break;
            }

            $statement = substr($buffer, 0, $pos);
            $buffer = substr($buffer, $pos + 2);

            $statement = trim($statement);

            // Skip comments and empty statements
            if (empty($statement) || substr($statement, 0, 2) === '--') {
                continue;
            }

            // Execute statement
            $result = $pdo->exec($statement);
            $statementCount++;

            if ($result === false) {
                $error = $pdo->errorInfo();
                echo "⚠ Error in statement $statementCount: " . $error[2] . "\n";
            }

            // Progress report every 500 statements
            if ($statementCount % 500 == 0) {
                $elapsed = time() - $startTime;
                $progress = round(($bytesRead / $fileSize) * 100);
                echo "  Progress: {$progress}% ({$statementCount} statements) - {$elapsed}s elapsed\n";
            }
        }

        // Progress report based on file reading
        if ($bytesRead % (5 * 1024 * 1024) < 8192) { // Every 5MB
            $progress = round(($bytesRead / $fileSize) * 100);
            $elapsed = time() - $startTime;
            echo "  Reading: {$progress}% - {$elapsed}s elapsed\n";
        }
    }

    // Process remaining buffer
    if (!empty($buffer)) {
        $statement = trim($buffer);
        if (!empty($statement) && substr($statement, 0, 2) !== '--') {
            $pdo->exec($statement);
            $statementCount++;
        }
    }

    fclose($handle);

    echo "\n✓ File processed: $statementCount statements executed\n\n";

    echo "Step 3: Re-enabling foreign key checks...\n";
    echo "─────────────────────────────────────────────────────────────\n";
    $pdo->exec("SET FOREIGN_KEY_CHECKS = 1");
    echo "✓ Foreign key checks re-enabled\n\n";

    echo "Step 4: Verifying database...\n";
    echo "─────────────────────────────────────────────────────────────\n";

    // Get statistics
    $result = $pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'curac_save'");
    $tableCount = $result->fetchColumn();

    $result = $pdo->query("SELECT COALESCE(SUM(TABLE_ROWS), 0) FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'curac_save'");
    $recordCount = $result->fetchColumn();

    echo "Tables: $tableCount\n";
    echo "Total Records: " . number_format($recordCount) . "\n\n";

    // Show table breakdown
    echo "Top 20 tables by record count:\n";
    $result = $pdo->query("
        SELECT TABLE_NAME, TABLE_ROWS
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = 'curac_save'
        ORDER BY TABLE_ROWS DESC
        LIMIT 20
    ");

    while ($row = $result->fetch(PDO::FETCH_ASSOC)) {
        printf("  %-40s %10s records\n", $row['TABLE_NAME'], number_format($row['TABLE_ROWS']));
    }

    echo "\n";
    echo "════════════════════════════════════════════════════════════════\n";
    echo "  ✅ IMPORT COMPLETE\n";
    echo "════════════════════════════════════════════════════════════════\n\n";

    $elapsed = time() - $startTime;
    echo "Summary:\n";
    echo "  Total time: {$elapsed} seconds\n";
    echo "  Statements executed: $statementCount\n";
    echo "  Final record count: " . number_format($recordCount) . "\n";
    echo "  Database ready for use!\n\n";

} catch (Exception $e) {
    echo "✗ Fatal error: " . $e->getMessage() . "\n";
    exit(1);
}

?>

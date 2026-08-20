<?php
/**
 * Full Database Re-Import from SQL Dump
 * Clears and re-imports all data from curac_save.sql
 */

$dumpFile = __DIR__ . '/../curac_save.sql';

if (!file_exists($dumpFile)) {
    echo "✗ Dump file not found: $dumpFile\n";
    exit(1);
}

$fileSize = filesize($dumpFile);
$fileSizeMB = $fileSize / (1024 * 1024);

echo "════════════════════════════════════════════════════════════════\n";
echo "  FULL DATABASE RE-IMPORT\n";
echo "════════════════════════════════════════════════════════════════\n\n";

echo "Source File: $dumpFile\n";
echo "File Size: " . round($fileSizeMB, 2) . " MB\n\n";

try {
    $pdo = new PDO('mysql:host=127.0.0.1;dbname=curac_save', 'root', '');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    echo "Step 1: Backing up current counts...\n";
    echo "─────────────────────────────────────────────────────────────\n";

    $result = $pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'curac_save'");
    $oldTableCount = $result->fetchColumn();

    $result = $pdo->query("SELECT COALESCE(SUM(TABLE_ROWS), 0) FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'curac_save'");
    $oldRecordCount = $result->fetchColumn();

    echo "Current tables: $oldTableCount\n";
    echo "Current records: " . number_format($oldRecordCount) . "\n\n";

    echo "Step 2: Disabling foreign key checks...\n";
    echo "─────────────────────────────────────────────────────────────\n";
    $pdo->exec("SET FOREIGN_KEY_CHECKS = 0");
    echo "✓ Foreign key checks disabled\n\n";

    echo "Step 3: Reading SQL file...\n";
    echo "─────────────────────────────────────────────────────────────\n";
    $sql = file_get_contents($dumpFile);
    echo "✓ File read: " . strlen($sql) . " bytes\n\n";

    echo "Step 4: Executing SQL statements...\n";
    echo "─────────────────────────────────────────────────────────────\n";

    // Split into individual statements
    $statements = array_filter(
        array_map('trim', explode(';', $sql)),
        function($stmt) {
            return !empty($stmt) && !preg_match('/^--/', $stmt);
        }
    );

    $successCount = 0;
    $errorCount = 0;
    $errors = [];

    foreach ($statements as $i => $statement) {
        try {
            if (trim($statement)) {
                $pdo->exec($statement);
                $successCount++;

                if (($i + 1) % 50 == 0) {
                    printf("  Processed %d/%d statements...\n", $i + 1, count($statements));
                }
            }
        } catch (PDOException $e) {
            $errorCount++;
            $errors[] = [
                'statement' => substr($statement, 0, 100),
                'error' => $e->getMessage()
            ];

            // Only store first 5 errors
            if (count($errors) <= 5) {
                echo "  ⚠ Error in statement $i: " . $e->getMessage() . "\n";
            }
        }
    }

    echo "✓ Processed " . count($statements) . " statements\n";
    echo "  ├─ Successful: $successCount\n";
    echo "  └─ Errors: $errorCount\n\n";

    echo "Step 5: Re-enabling foreign key checks...\n";
    echo "─────────────────────────────────────────────────────────────\n";
    $pdo->exec("SET FOREIGN_KEY_CHECKS = 1");
    echo "✓ Foreign key checks re-enabled\n\n";

    echo "Step 6: Verifying data...\n";
    echo "─────────────────────────────────────────────────────────────\n";

    $result = $pdo->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'curac_save'");
    $newTableCount = $result->fetchColumn();

    $result = $pdo->query("SELECT COALESCE(SUM(TABLE_ROWS), 0) FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'curac_save'");
    $newRecordCount = $result->fetchColumn();

    echo "New tables: $newTableCount\n";
    echo "New records: " . number_format($newRecordCount) . "\n";
    echo "Net change: +" . ($newRecordCount - $oldRecordCount) . " records\n\n";

    echo "════════════════════════════════════════════════════════════════\n";
    echo "  ✅ IMPORT COMPLETE\n";
    echo "════════════════════════════════════════════════════════════════\n\n";

    echo "Summary:\n";
    echo "  Total SQL statements: " . count($statements) . "\n";
    echo "  Successful: $successCount\n";
    echo "  Errors: $errorCount\n";
    echo "  Final record count: " . number_format($newRecordCount) . "\n\n";

    if ($errorCount > 0) {
        echo "First few errors:\n";
        foreach (array_slice($errors, 0, 3) as $error) {
            echo "  ⚠ " . $error['statement'] . "...\n";
            echo "    → " . $error['error'] . "\n";
        }
    }

} catch (Exception $e) {
    echo "✗ Fatal error: " . $e->getMessage() . "\n";
    exit(1);
}

?>

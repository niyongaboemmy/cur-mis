<?php
/**
 * Migration Runner: Add Staff Qualifications to Employees Table
 *
 * This script adds the following columns to the employees table:
 * - end_date
 * - rssb_number
 * - degree
 * - area_specialization
 * - foreign_degree_equivalence
 */

// Database connection settings
$host = getenv('DB_HOST') ?: 'localhost';
$dbname = getenv('DB_NAME') ?: 'cur_mis';
$user = getenv('DB_USER') ?: 'root';
$password = getenv('DB_PASSWORD') ?: '';
$port = getenv('DB_PORT') ?: 3306;

try {
    echo "\n╔════════════════════════════════════════════════════════════════╗\n";
    echo "║   Adding Staff Qualifications Columns to Employees Table       ║\n";
    echo "╚════════════════════════════════════════════════════════════════╝\n\n";

    // Connect to database
    $dsn = "mysql:host=$host;port=$port;dbname=$dbname;charset=utf8mb4";
    $pdo = new PDO($dsn, $user, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    echo "✅ Connected to database: $dbname\n\n";

    // SQL statements to add the columns
    $statements = [
        "ALTER TABLE `employees` ADD COLUMN IF NOT EXISTS `end_date` DATE DEFAULT NULL COMMENT 'Employment end date' AFTER `employee_reg_date`",
        "ALTER TABLE `employees` ADD COLUMN IF NOT EXISTS `rssb_number` VARCHAR(50) DEFAULT NULL COMMENT 'Social security/pension number' AFTER `employee_account`",
        "ALTER TABLE `employees` ADD COLUMN IF NOT EXISTS `degree` VARCHAR(100) DEFAULT NULL COMMENT 'Academic degree (BSc, MSc, PhD, etc.)' AFTER `rssb_number`",
        "ALTER TABLE `employees` ADD COLUMN IF NOT EXISTS `area_specialization` VARCHAR(150) DEFAULT NULL COMMENT 'Area of specialization/field of study' AFTER `degree`",
        "ALTER TABLE `employees` ADD COLUMN IF NOT EXISTS `foreign_degree_equivalence` VARCHAR(255) DEFAULT NULL COMMENT 'Recognition/equivalence status for foreign degrees' AFTER `area_specialization`",
    ];

    foreach ($statements as $i => $sql) {
        echo "Running: " . substr($sql, 0, 80) . "...\n";
        try {
            $pdo->exec($sql);
            echo "  ✅ Done\n\n";
        } catch (PDOException $e) {
            if (strpos($e->getMessage(), 'Duplicate column name') !== false) {
                echo "  ⏭️  Column already exists (skipped)\n\n";
            } else {
                throw $e;
            }
        }
    }

    // Verify the columns
    echo "\n✅ Verifying columns in employees table...\n";
    $result = $pdo->query("DESCRIBE `employees`");
    $columns = $result->fetchAll();

    $expectedColumns = ['end_date', 'rssb_number', 'degree', 'area_specialization', 'foreign_degree_equivalence'];
    $foundColumns = [];

    foreach ($columns as $col) {
        if (in_array($col['Field'], $expectedColumns, true)) {
            $foundColumns[] = $col['Field'];
            echo "  ✅ Column exists: {$col['Field']} ({$col['Type']})\n";
        }
    }

    if (count($foundColumns) === count($expectedColumns)) {
        echo "\n╔════════════════════════════════════════════════════════════════╗\n";
        echo "║                   ✅ MIGRATION SUCCESSFUL ✅                   ║\n";
        echo "║                                                                ║\n";
        echo "║ All staff qualification columns have been added to the         ║\n";
        echo "║ employees table. The database is ready to use!                 ║\n";
        echo "╚════════════════════════════════════════════════════════════════╝\n\n";
    } else {
        echo "\n⚠️  Warning: Not all columns were found.\n";
        echo "Expected: " . implode(', ', $expectedColumns) . "\n";
        echo "Found: " . implode(', ', $foundColumns) . "\n";
    }

} catch (PDOException $e) {
    echo "\n❌ Database Error:\n";
    echo $e->getMessage() . "\n\n";
    exit(1);
} catch (Exception $e) {
    echo "\n❌ Error:\n";
    echo $e->getMessage() . "\n\n";
    exit(1);
}
?>

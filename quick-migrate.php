<?php
// Minimal migration script - no dependencies, direct PDO
// Usage: php quick-migrate.php

$host = 'localhost';
$port = 3306;
$db = 'cur_mis';
$user = 'root';
$pass = '';

try {
    $pdo = new PDO("mysql:host=$host;port=$port;dbname=$db;charset=utf8mb4", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Create schema_migrations table
    $pdo->exec("CREATE TABLE IF NOT EXISTS `schema_migrations` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `migration` VARCHAR(255) NOT NULL UNIQUE,
        `batch` INT NOT NULL,
        `executed_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )");

    // Check if migration already applied
    $stmt = $pdo->prepare("SELECT 1 FROM schema_migrations WHERE migration = ?");
    $stmt->execute(['2026_09_01_001_create_programme_types_table.sql']);

    if ($stmt->fetchColumn()) {
        echo "✓ Migration already applied\n";
        exit(0);
    }

    // Apply migration
    $pdo->exec("CREATE TABLE IF NOT EXISTS `programme_types` (
      `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      `name` VARCHAR(50) NOT NULL UNIQUE COLLATE utf8mb4_unicode_ci,
      `display_name` VARCHAR(100) NOT NULL,
      `description` TEXT,
      `is_active` TINYINT(1) NOT NULL DEFAULT 1,
      `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY `idx_name` (`name`),
      KEY `idx_is_active` (`is_active`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $pdo->exec("INSERT IGNORE INTO `programme_types` (`name`, `display_name`, `description`, `is_active`) VALUES
    ('day', 'Day', 'Full-time day programmes', 1),
    ('evening', 'Evening', 'Evening programmes', 1),
    ('weekend', 'Weekend', 'Weekend programmes', 1),
    ('holiday', 'Holiday', 'Holiday programmes', 1),
    ('distance_learning', 'Distance Learning', 'Distance learning programmes', 1)");

    // Record in ledger
    $stmt = $pdo->prepare("INSERT INTO schema_migrations (migration, batch) VALUES (?, ?)");
    $stmt->execute(['2026_09_01_001_create_programme_types_table.sql', 1]);

    echo "✓ Migration applied successfully\n";

    // Verify
    $result = $pdo->query("SELECT id, name, display_name FROM programme_types WHERE is_active = 1 ORDER BY id")->fetchAll(PDO::FETCH_ASSOC);
    echo "\nProgramme Types created:\n";
    foreach ($result as $row) {
        echo "  - {$row['name']}: {$row['display_name']}\n";
    }

} catch (Exception $e) {
    echo "✗ Error: " . $e->getMessage() . "\n";
    exit(1);
}
?>

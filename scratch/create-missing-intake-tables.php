<?php
/**
 * Create Missing Intake Tables
 * Creates tables needed for the intake management system
 */

$pdo = new PDO('mysql:host=127.0.0.1;dbname=curac_save', 'root', '');

echo "Creating missing tables in curac_save...\n\n";

// Table 1: intakes
$sql1 = "
CREATE TABLE IF NOT EXISTS `intakes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
";

// Table 2: intake_verification
$sql2 = "
CREATE TABLE IF NOT EXISTS `intake_verification` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `intake_id` int(11) NOT NULL,
  `application_id` int(11) NOT NULL,
  `verification_status` varchar(50) NOT NULL DEFAULT 'pending',
  `verified_by` int(11),
  `verified_at` timestamp NULL,
  `comments` text,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `intake_id` (`intake_id`),
  KEY `application_id` (`application_id`),
  CONSTRAINT `fk_intake_verification_intake` FOREIGN KEY (`intake_id`) REFERENCES `intakes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_intake_verification_application` FOREIGN KEY (`application_id`) REFERENCES `application` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
";

// Table 3: online_application_setup
$sql3 = "
CREATE TABLE IF NOT EXISTS `online_application_setup` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `intake_id` int(11) NOT NULL,
  `application_form_url` varchar(255),
  `is_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `settings` json,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `intake_id` (`intake_id`),
  CONSTRAINT `fk_online_app_setup_intake` FOREIGN KEY (`intake_id`) REFERENCES `intakes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
";

// Insert sample data for intakes
$sql4 = "
INSERT IGNORE INTO `intakes` (`id`, `name`, `start_date`, `end_date`, `is_active`, `created_at`) VALUES
(1, '2026-A (January)', '2026-01-01', '2026-06-30', 1, NOW()),
(2, '2026-B (August)', '2026-08-01', '2026-12-31', 1, NOW());
";

try {
    // Create tables
    $pdo->exec($sql1);
    echo "✓ Created table: intakes\n";

    $pdo->exec($sql2);
    echo "✓ Created table: intake_verification\n";

    $pdo->exec($sql3);
    echo "✓ Created table: online_application_setup\n";

    // Insert sample data
    $pdo->exec($sql4);
    echo "✓ Inserted sample intake data\n";

    echo "\n✅ All missing tables created successfully!\n";
    echo "\nVerifying tables...\n";

    // Verify
    $result = $pdo->query("SELECT COUNT(*) FROM intakes");
    $count = $result->fetchColumn();
    echo "✓ intakes table: $count records\n";

} catch (PDOException $e) {
    echo "✗ Error: " . $e->getMessage() . "\n";
}
?>

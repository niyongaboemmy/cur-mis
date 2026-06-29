<?php
declare(strict_types=1);
define('BASE_PATH', __DIR__ . '/backend');
require BASE_PATH . '/vendor/autoload.php';
$dotenv = Dotenv\Dotenv::createImmutable(BASE_PATH . '/');
$dotenv->load();
require BASE_PATH . '/config/app.php';
use Core\Database;
$db = Database::getInstance();

$steps = [];

// 1. source column
try {
    $db->execute("ALTER TABLE fee_payments ADD COLUMN source ENUM('MANUAL','GATEWAY','APPLICATION_TRANSFER') NOT NULL DEFAULT 'MANUAL' AFTER status", []);
    $steps[] = ['ok', "Added fee_payments.source"];
} catch (Throwable $e) {
    $steps[] = ['warn', "source column: " . $e->getMessage()];
}

// 2. source_application_id column
try {
    $db->execute("ALTER TABLE fee_payments ADD COLUMN source_application_id INT UNSIGNED NULL DEFAULT NULL AFTER source", []);
    $steps[] = ['ok', "Added fee_payments.source_application_id"];
} catch (Throwable $e) {
    $steps[] = ['warn', "source_application_id column: " . $e->getMessage()];
}

// 3. indexes
foreach ([
    "ALTER TABLE fee_payments ADD INDEX idx_fp_source (source)",
    "ALTER TABLE fee_payments ADD INDEX idx_fp_src_app_id (source_application_id)",
] as $sql) {
    try {
        $db->execute($sql, []);
        $steps[] = ['ok', "Index added"];
    } catch (Throwable $e) {
        $steps[] = ['warn', "Index: " . $e->getMessage()];
    }
}

// 4. Seed settings
$rows = [
    ['application_fee_mapped_fee_type',          '',     'Fee type key that application fee payments map to (blank = disabled)'],
    ['application_fee_amount',                   '5000', 'Default application fee amount in RWF (fallback if not in fee_structures)'],
    ['application_fee_credit_on_enrollment',     '1',    'Auto-credit application fee to student invoice on enrollment (1=enabled, 0=disabled)'],
];
foreach ($rows as [$k, $v, $desc]) {
    try {
        $db->execute(
            "INSERT INTO settings (key_name, value, description) VALUES (?,?,?) ON DUPLICATE KEY UPDATE description = VALUES(description)",
            [$k, $v, $desc]
        );
        $steps[] = ['ok', "Seeded setting: $k"];
    } catch (Throwable $e) {
        $steps[] = ['fail', "Setting $k: " . $e->getMessage()];
    }
}

// 5. Verify
$cols = $db->fetchAll(
    "SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fee_payments' AND COLUMN_NAME IN ('source','source_application_id')",
    []
);
$steps[] = [count($cols) === 2 ? 'ok' : 'fail', "fee_payments now has " . count($cols) . "/2 new columns"];

$settings = $db->fetchAll("SELECT key_name, value FROM settings WHERE key_name LIKE 'application_fee%'", []);
$steps[] = [count($settings) === 3 ? 'ok' : 'fail', count($settings) . "/3 application_fee settings seeded"];

echo "\nMigration Run\n" . str_repeat('-', 50) . "\n";
foreach ($steps as [$status, $msg]) {
    $colour = $status === 'ok' ? "\033[32m✓" : ($status === 'warn' ? "\033[33m⚠" : "\033[31m✗");
    echo "  $colour $msg\033[0m\n";
}
echo "\n";

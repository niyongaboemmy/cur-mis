<?php

/**
 * Loads the payroll reference data (pay schemes, 2026 settings version, responsibility roles,
 * hourly rates, banks). Idempotent: rows that already exist are left alone.
 *
 * Usage:
 *   php scripts/seed_payroll_reference.php --dry-run   # show what would be inserted
 *   php scripts/seed_payroll_reference.php             # insert missing rows
 *
 * Run the migrations first (php scripts/migrate.php).
 */

declare(strict_types=1);

define('BASE_PATH', dirname(__DIR__));

require BASE_PATH . '/vendor/autoload.php';

if (file_exists(BASE_PATH . '/.env')) {
    (Dotenv\Dotenv::createImmutable(BASE_PATH))->load();
}

use App\Payroll\Seed\ReferenceSeeder;
use Core\Database;

$dryRun = in_array('--dry-run', $argv ?? [], true);

$settings  = require BASE_PATH . '/database/seeds/payroll/settings_2026.php';
$reference = require BASE_PATH . '/database/seeds/payroll/reference_2026.php';

$plan = ReferenceSeeder::plan($settings, $reference);

echo "Pay schemes:          " . count($plan['schemes']) . "\n";
echo "Settings version:     effective {$plan['settings']['effective_from']}\n";
echo "Responsibility roles: " . count($plan['roles']) . "\n";
echo "Hourly grades:        " . count($plan['hourly_rates']) . "\n";
echo "Banks:                " . count($plan['banks']) . "\n";

if ($dryRun) {
    echo "\nDry run: nothing written.\n";
    exit(0);
}

$counts = ReferenceSeeder::apply(Database::getInstance(), $plan);

echo "\nRows inserted (existing rows are kept):\n";
foreach ($counts as $table => $n) {
    echo str_pad($table, 22) . $n . "\n";
}

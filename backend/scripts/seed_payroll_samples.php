<?php

/**
 * Adds five SAMPLE staff (and their SUPPORT contracts) to a development database.
 *
 * Refuses to run without --confirm, and refuses when APP_ENV is production.
 * Re-running adds nothing for a person already in the database (matched by the SAMPLE name).
 *
 * Usage:  php scripts/seed_payroll_samples.php --confirm
 */

declare(strict_types=1);

define('BASE_PATH', dirname(__DIR__));

require BASE_PATH . '/vendor/autoload.php';

if (file_exists(BASE_PATH . '/.env')) {
    (Dotenv\Dotenv::createImmutable(BASE_PATH))->load();
}

use Core\Database;

if (!in_array('--confirm', $argv ?? [], true)) {
    fwrite(STDERR, "This adds sample staff. Run it with --confirm on a development database.\n");
    exit(1);
}
if (strtolower((string) ($_ENV['APP_ENV'] ?? '')) === 'production') {
    fwrite(STDERR, "Refusing to add sample staff on a production database.\n");
    exit(1);
}

$db = Database::getInstance();
$people = require BASE_PATH . '/database/seeds/payroll/sample_people.php';

$added = 0;
foreach ($people as $person) {
    $name = $person['first'] . ' ' . $person['last'];
    $existing = $db->fetchOne('SELECT `employee_id` FROM `employees` WHERE `employee_fname` = ? AND `employee_lname` = ?', [$person['first'], $person['last']]);
    if ($existing !== false) {
        echo "exists: {$name}\n";
        continue;
    }

    $db->execute(
        'INSERT INTO `employees`
            (`employee_fname`, `employee_lname`, `employee_status`, `staff_category`, `account_status`,
             `employee_bank`, `employee_account`, `rssb_number`, `salary`, `insurance_type`, `insurance_premium`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$person['first'], $person['last'], 'Permanent', 'Administrative', 'Active',
         'Equity Bank', '0000' . $added, 'SAMPLE', $person['basic'], 'RAMA', '0']
    );
    $employeeId = (int) $db->lastInsertId();

    $db->execute(
        'INSERT INTO `employment_contracts`
            (`employee_id`, `scheme_code`, `start_date`, `basic_salary`, `topup_rate`, `housing_divisor`, `transport_divisor`, `status`)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [$employeeId, 'SUPPORT', date('Y-m-01'), $person['basic'], '0', 0, 0, 'Active']
    );
    echo "added: {$name} ({$person['band']})\n";
    $added++;
}

echo "\n{$added} sample person(s) added.\n";

<?php

/**
 * Payroll calculator checks against the CUR "Calculation of Payroll" procedure.
 * Expected values were worked out by hand from the procedure, not taken from the code.
 *
 * Run: php backend/scripts/tests/payroll_calculator_test.php
 */

declare(strict_types=1);

require_once __DIR__ . '/../../app/Services/PayrollSettings.php';
require_once __DIR__ . '/../../app/Services/PayrollCalculator.php';

use App\Services\PayrollCalculator as PC;

$failures = 0;
$passes   = 0;

$assertEq = static function (string $name, mixed $expected, mixed $actual) use (&$failures, &$passes): void {
    if ($expected === $actual) {
        $passes++;
        return;
    }
    $failures++;
    echo "FAIL {$name}: expected " . var_export($expected, true) . ', got ' . var_export($actual, true) . PHP_EOL;
};

// ── Case 1: basic 500,000, no responsibility role, no arrears ──────────────
$r = PC::calculate(500000);
$assertEq('c1 housing (2)',            71428.57,  $r['housing_allowance']);
$assertEq('c1 transport (3)',          71428.57,  $r['transport_allowance']);
$assertEq('c1 base gross (4)',         642857.14, $r['base_gross']);
$assertEq('c1 gross (7)',              642857.14, $r['gross']);
$assertEq('c1 PAYE (8)',               156857.14, $r['paye']);
$assertEq('c1 maternity base (9)',     571428.57, $r['maternity_base']);
$assertEq('c1 pension employee (10)',  38571.43,  $r['pension_employee']);
$assertEq('c1 occupational (11)',      11428.57,  $r['occupational_employer']);
$assertEq('c1 pension employer (12)',  38571.43,  $r['pension_employer']);
$assertEq('c1 maternity emp (13)',     1714.29,   $r['maternity_employee']);
$assertEq('c1 maternity er (14)',      1714.29,   $r['maternity_employer']);
$assertEq('c1 RSSB total (15)',        40285.72,  $r['rssb_employee_total']);
$assertEq('c1 RAMA emp (16)',          42857.14,  $r['rama_employee']);
$assertEq('c1 RAMA er (17)',           42857.14,  $r['rama_employer']);
$assertEq('c1 net salary (18)',        402857.14, $r['net_salary']);
$assertEq('c1 CBHI (19)',              2014.29,   $r['cbhi']);
$assertEq('c1 net after CBHI (20)',    400842.85, $r['net_after_cbhi']);
$assertEq('c1 net pay (22)',           400842.85, $r['net_pay']);
// Includes employer CBHI: 0.5% of gross 642,857.14 = 3,214.29
$assertEq('c1 employer cost',          740642.86, $r['employer_cost']);

// ── Case 2: basic 150,000, Dean (150,000), other deductions 10,000 ─────────
$r = PC::calculate(150000, 'dean', 0.0, 10000.0);
$assertEq('c2 responsibility (5)',     150000.0,  $r['responsibility_allowance']);
$assertEq('c2 gross (7)',              342857.14, $r['gross']);
$assertEq('c2 PAYE (8)',               66857.14,  $r['paye']);
$assertEq('c2 maternity base (9)',     321428.57, $r['maternity_base']);
$assertEq('c2 pension emp (10)',       20571.43,  $r['pension_employee']);
$assertEq('c2 RAMA emp (16)',          24107.14,  $r['rama_employee']);
$assertEq('c2 net salary (18)',        230357.14, $r['net_salary']);
$assertEq('c2 CBHI (19)',              1151.79,   $r['cbhi']);
$assertEq('c2 other ded (21)',         10000.0,   $r['other_deductions']);
$assertEq('c2 net pay (22)',           219205.35, $r['net_pay']);

// ── Case 3: arrears are part of total gross (step 6 → 7) ───────────────────
$r = PC::calculate(150000, null, 50000.0);
$assertEq('c3 gross includes arrears', 242857.14, $r['gross']);
$assertEq('c3 arrears (6)',            50000.0,   $r['arrears']);

// ── Case 4: PAYE on a lower salary, first bracket edge ─────────────────────
$r = PC::calculate(50000);
$assertEq('c4 PAYE (8)',               428.57,    $r['paye']);

// ── PAYE bracket boundaries ────────────────────────────────────────────────
$assertEq('paye 0',        0.0,     PC::paye(0));
$assertEq('paye 60000',    0.0,     PC::paye(60000));
$assertEq('paye 100000',   4000.0,  PC::paye(100000));
$assertEq('paye 200000',   24000.0, PC::paye(200000));
$assertEq('paye 300000',   54000.0, PC::paye(300000));

// ── Responsibility roles ───────────────────────────────────────────────────
$assertEq('role academic secretary', 120000.0, PC::responsibilityAmount('academic_secretary'));
$assertEq('role head of dept',       100000.0, PC::responsibilityAmount('head_of_department'));
$assertEq('role head of unit',       150000.0, PC::responsibilityAmount('head_of_unit'));
$assertEq('role none',               0.0,      PC::responsibilityAmount(null));
try {
    PC::responsibilityAmount('janitor');
    $failures++;
    echo "FAIL unknown role did not throw" . PHP_EOL;
} catch (InvalidArgumentException) {
    $passes++;
}

echo "{$passes} passed, {$failures} failed" . PHP_EOL;
exit($failures === 0 ? 0 : 1);

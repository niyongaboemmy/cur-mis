<?php

/**
 * Five SAMPLE staff for trying the payroll on a development database. They are not real people.
 * Each sits in a different PAYE band, so a sample run shows every band at work.
 *
 * SUPPORT scheme, no top-up and no housing or transport, so gross equals the basic salary here.
 * Load with scripts/seed_payroll_samples.php --confirm (development databases only).
 */

return [
    ['first' => 'SAMPLE', 'last' => 'Band Zero',     'basic' => 50000,   'band' => 'nil (0%)'],
    ['first' => 'SAMPLE', 'last' => 'Band Ten',      'basic' => 80000,   'band' => '10%'],
    ['first' => 'SAMPLE', 'last' => 'Band Twenty',   'basic' => 150000,  'band' => '20%'],
    ['first' => 'SAMPLE', 'last' => 'Band Thirty',   'basic' => 250000,  'band' => '30%'],
    ['first' => 'SAMPLE', 'last' => 'Band Top',      'basic' => 1000000, 'band' => '30%'],
];

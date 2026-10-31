<?php

/**
 * Payroll settings for 2026, used by the tests and as the source for the Phase 2 seed.
 *
 * Shape consumed by App\Payroll\Engine\PayrollEngine. Percentages are decimal strings
 * ("11.68228" means 11.68228%). Amounts are whole RWF.
 *
 * Values marked "not decided" are left null on purpose. The engine refuses to use them,
 * so nothing is assumed silently (see the open decisions in docs/payroll/SPEC.md).
 */

return [
    // Basic top-up (E) and housing/transport divisors (G, H). Institution policy.
    'topup_rate'        => '11.68228',
    'housing_divisor'   => 7,
    'transport_divisor' => 7,

    // Statutory contribution rates (percent of their base)
    'rates' => [
        'pension_ee'    => '6',     // base: total gross
        'pension_er'    => '6',     // base: total gross
        'hazard_er'     => '2',     // occupational hazard, employer; base: statutory base
        'maternity_ee'  => '0.3',   // base: statutory base
        'maternity_er'  => '0.3',   // base: statutory base
        'rama_ee'       => '7.5',   // base: statutory base
        'rama_er'       => '7.5',   // base: statutory base
        'cbhi_ee'       => '0.5',   // base: net before CBHI
    ],

    // Progressive PAYE, monthly. Upper limit in RWF; last band has no upper limit.
    'paye_bands' => [
        ['upper' => '60000',  'rate' => '0'],
        ['upper' => '100000', 'rate' => '10'],
        ['upper' => '200000', 'rate' => '20'],
        ['upper' => null,     'rate' => '30'],
    ],

    // Flat secondary-employment rate (FLAT_SECONDARY)
    'flat_rate' => '30',

    // Casual labour: nothing up to the threshold, then the rate on the excess
    'casual' => ['threshold' => 60000, 'rate' => '15'],

    // WITHHOLDING rate for consultancy, if CUR chooses it. Not decided (spec §8 Q6).
    'withholding_rate' => null,

    // CBHI base: after_all_insurance (as in the CUR sheet) or after_paye_and_rssb_only
    'cbhi_base' => 'after_all_insurance',

    // Statutory base for maternity, hazard and RAMA: gross minus transport allowance, or gross
    'statutory_base' => 'excludes_transport',

    // Warn when deductions exceed this percent of gross. Not decided, so no warning yet.
    'max_deduction_percent' => null,

    // Part-time allowances (spec §3.3), in RWF. Paid as a separate non-taxable reimbursement,
    // not through the payroll run.
    'part_time_allowances' => [
        'accommodation_per_night' => 8825,   // only for lecturers from outside Huye
        'transport_kigali'        => 7480,   // per trip, from Kigali
        'transport_other'         => 4000,   // per trip, from elsewhere
    ],

    // Pay schemes (spec §2). rssb = pension + maternity; hazard = occupational hazard;
    // rama = scheme allows RAMA; cbhi = CBHI applies.
    'schemes' => [
        'PERMANENT'    => ['tax_method' => 'PROGRESSIVE',    'earnings' => 'SALARY',  'rssb' => true,  'hazard' => true,  'rama' => true,  'cbhi' => true],
        'SUPPORT'      => ['tax_method' => 'PROGRESSIVE',    'earnings' => 'SALARY',  'rssb' => true,  'hazard' => true,  'rama' => true,  'cbhi' => true],
        'PART_TIME'    => ['tax_method' => 'FLAT_SECONDARY', 'earnings' => 'HOURLY',  'rssb' => true,  'hazard' => false, 'rama' => false, 'cbhi' => true],
        'PG_INCENTIVE' => ['tax_method' => 'FLAT_SECONDARY', 'earnings' => 'ENTERED', 'rssb' => true,  'hazard' => true,  'rama' => false, 'cbhi' => true],
        'TRANSPORT'    => ['tax_method' => 'FLAT_SECONDARY', 'earnings' => 'ENTERED', 'rssb' => true,  'hazard' => true,  'rama' => false, 'cbhi' => true],
        'CASUAL'       => ['tax_method' => 'PROGRESSIVE',    'earnings' => 'DAILY',   'rssb' => true,  'hazard' => true,  'rama' => false, 'cbhi' => true],
        'CONSULTANCY'  => ['tax_method' => 'FLAT_SECONDARY', 'earnings' => 'ENTERED', 'rssb' => false, 'hazard' => false, 'rama' => false, 'cbhi' => false],
    ],
];

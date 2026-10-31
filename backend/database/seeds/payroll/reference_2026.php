<?php

/**
 * Reference lists for 2026, loaded by scripts/seed_payroll_reference.php.
 *
 * Every entry is a starting point to be confirmed by CUR. Codes that the spec does not give
 * (TUT, PGL) are assigned here and marked in the comments. Re-running the seed never
 * overwrites a row that already exists.
 */

return [
    'effective_from' => '2026-01-01',

    // Pay scheme display names. The rules themselves are in settings_2026.php ('schemes').
    'scheme_names' => [
        'PERMANENT'    => 'Permanent academic and administrative staff',
        'SUPPORT'      => 'Support staff',
        'PART_TIME'    => 'Part-time lecturers',
        'PG_INCENTIVE' => 'Masters and postgraduate part-time incentive',
        'TRANSPORT'    => 'Transport allowance payment',
        'CASUAL'       => 'Casual workers',
        'CONSULTANCY'  => 'Consultancy fees',
    ],

    // Responsibility allowances, monthly RWF (step 5 of the CUR procedure).
    // Amounts are the existing PayrollSettings::ROLE_DEFAULTS, to confirm with CUR.
    'responsibility_roles' => [
        ['code' => 'academic_secretary',          'name' => 'Academic Secretary',                        'amount' => 136015],
        ['code' => 'dean',                        'name' => 'Dean',                                      'amount' => 170018],
        ['code' => 'registrar',                   'name' => 'Registrar',                                 'amount' => 170018],
        ['code' => 'director_research',           'name' => 'Director of Research',                      'amount' => 170018],
        ['code' => 'cpa_coordinator',             'name' => 'CPA Coordinator',                           'amount' => 170018],
        ['code' => 'international_student_coord', 'name' => 'International Student Coordinator',         'amount' => 170018],
        ['code' => 'planning_cooperation',        'name' => 'Planning and Cooperation',                  'amount' => 170018],
        ['code' => 'internal_auditor',            'name' => 'Internal Auditor',                          'amount' => 170018],
        ['code' => 'sponsored_student_coord',     'name' => 'Sponsored Student Coordinator (Chancen)',   'amount' => 170018],
        ['code' => 'head_of_unit',                'name' => 'Head of Unit (Director)',                   'amount' => 170018],
        ['code' => 'head_of_department',          'name' => 'Head of Department',                        'amount' => 113346],
    ],

    // Part-time hourly rates, RWF per hour (spec §3.3). TUT and PGL codes are assigned here.
    // TUT is 5,857 per the policy document; the Excel example used 5,800 (spec §8 Q2).
    'hourly_rates' => [
        ['code' => 'CCA', 'name' => 'Lecturer',                  'rate' => 7149],
        ['code' => 'ASS', 'name' => 'Assistant Lecturer',        'rate' => 6291],
        ['code' => 'TUT', 'name' => 'Tutorial',                  'rate' => 5857],
        ['code' => 'CC',  'name' => 'Senior Lecturer',           'rate' => 8007],
        ['code' => 'PA',  'name' => 'Associate Professor',       'rate' => 8500],
        ['code' => 'PT',  'name' => 'Full Professor',            'rate' => 9107],
        ['code' => 'PGL', 'name' => 'Lecturer in Postgraduate',  'rate' => 18000],
    ],

    // Controlled bank list. The spec names these and "…", so HR must complete the list.
    'banks' => [
        ['name' => 'Bank of Kigali', 'short_code' => 'BK'],
        ['name' => 'Equity Bank',    'short_code' => null],
        ['name' => 'BPR',            'short_code' => null],
        ['name' => 'I&M Bank',       'short_code' => null],
    ],
];

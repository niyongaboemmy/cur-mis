<?php

declare(strict_types=1);

namespace App\Services;

use InvalidArgumentException;

/**
 * CUR payroll calculator.
 *
 * Single source of truth for monthly payroll, implementing the
 * "Calculation of Payroll" procedure (steps 1–22). Pure PHP, no database
 * access, so it can be exercised directly by tests and reused for previews.
 *
 * Every monetary value is rounded to 2 decimals and downstream steps use the
 * rounded value, so the stored payslip always adds up.
 */
final class PayrollCalculator
{
    /** Contribution rates (fractions of the base shown in the procedure). */
    public const RATES = [
        'pension_employee'      => 0.06,   // step 10 – base: total gross
        'pension_employer'      => 0.06,   // step 12 – base: total gross
        'occupational_employer' => 0.02,   // step 11 – base: maternity base (employer only)
        'maternity_employee'    => 0.003,  // step 13 – base: maternity base
        'maternity_employer'    => 0.003,  // step 14 – base: maternity base
        'rama_employee'         => 0.075,  // step 16 – base: maternity base
        'rama_employer'         => 0.075,  // step 17 – base: maternity base
        'cbhi_employee'         => 0.005,  // step 19 – base: net salary (after PAYE and RSSB/RAMA)
    ];

    /**
     * Progressive monthly PAYE bands (step 8). A null upper bound is open-ended.
     * Each band's rate applies only to the slice of income inside that band.
     */
    public const PAYE_BANDS = [
        ['upper' => 60000,  'rate' => 0.00],
        ['upper' => 100000, 'rate' => 0.10],
        ['upper' => 200000, 'rate' => 0.20],
        ['upper' => null,   'rate' => 0.30],
    ];

    /** Responsibility allowances (step 5). Each employee holds at most one role. */
    public const RESPONSIBILITY_ROLES = [
        'academic_secretary'            => ['label' => 'Academic Secretary',                      'amount' => 120000],
        'dean'                          => ['label' => 'Dean',                                    'amount' => 150000],
        'registrar'                     => ['label' => 'Registrar',                               'amount' => 150000],
        'director_research'             => ['label' => 'Director of Research',                    'amount' => 150000],
        'cpa_coordinator'               => ['label' => 'CPA Coordinator',                         'amount' => 150000],
        'international_student_coord'   => ['label' => 'International Student Coordinator',       'amount' => 150000],
        'planning_cooperation'          => ['label' => 'Planning and Cooperation',                'amount' => 150000],
        'internal_auditor'              => ['label' => 'Internal Auditor',                        'amount' => 150000],
        'sponsored_student_coord'       => ['label' => 'Sponsored Student Coordinator (Chancen)', 'amount' => 150000],
        'head_of_unit'                  => ['label' => 'Head of Unit (Director)',                 'amount' => 150000],
        'head_of_department'            => ['label' => 'Head of Department',                      'amount' => 100000],
    ];

    /**
     * Responsibility allowance for a role code. Null/empty means no role.
     *
     * @throws InvalidArgumentException for an unknown role code
     */
    public static function responsibilityAmount(?string $role): float
    {
        if ($role === null || $role === '') {
            return 0.0;
        }
        if (!isset(self::RESPONSIBILITY_ROLES[$role])) {
            throw new InvalidArgumentException("Unknown responsibility role: {$role}");
        }
        return (float) self::RESPONSIBILITY_ROLES[$role]['amount'];
    }

    /** Monthly PAYE on a total gross amount (step 8). */
    public static function paye(float $taxableIncome): float
    {
        if ($taxableIncome <= 0) {
            return 0.0;
        }

        $tax = 0.0;
        $lower = 0.0;
        foreach (self::PAYE_BANDS as $band) {
            if ($taxableIncome <= $lower) {
                break;
            }
            $upper = $band['upper'] ?? PHP_FLOAT_MAX;
            $slice = min($taxableIncome, $upper) - $lower;
            $tax += $slice * $band['rate'];
            $lower = $upper;
        }

        return self::r2($tax);
    }

    /**
     * Run the full procedure for one employee and one period.
     *
     * @param float       $basicSalary     Step 1 – monthly basic salary
     * @param string|null $responsibility  Step 5 – role code from RESPONSIBILITY_ROLES
     * @param float       $arrears         Step 6 – arrears for this period, if any
     * @param float|null  $otherDeductions Step 21 – total of other deductions, if known
     * @return array<string, float> Every figure in the procedure, keyed by step name
     */
    public static function calculate(
        float $basicSalary,
        ?string $responsibility = null,
        float $arrears = 0.0,
        ?float $otherDeductions = 0.0,
    ): array {
        return self::compute($basicSalary, self::responsibilityAmount($responsibility), $arrears, $otherDeductions);
    }

    /**
     * Same procedure as calculate(), but takes the responsibility allowance amount
     * directly. Used to recompute a stored payroll row, which keeps the amount that
     * was in force when it was created.
     *
     * @return array<string, float>
     */
    public static function compute(
        float $basicSalary,
        float $responsibilityAmount,
        float $arrears = 0.0,
        ?float $otherDeductions = 0.0,
    ): array {
        $basic = self::r2(max(0.0, $basicSalary));

        // Steps 2–4
        $housing   = self::r2($basic / 7);
        $transport = self::r2($basic / 7);
        $baseGross = self::r2($basic + $housing + $transport);

        // Steps 5–7
        $responsibilityAllowance = self::r2(max(0.0, $responsibilityAmount));
        $arrears = self::r2(max(0.0, $arrears));
        $gross   = self::r2($baseGross + $responsibilityAllowance + $arrears);

        // Step 8 – PAYE on total gross
        $paye = self::paye($gross);

        // Step 9 – maternity base excludes transport allowance
        $maternityBase = self::r2($gross - $transport);

        // Steps 10–17 – RSSB, maternity, RAMA (employee and employer shares)
        $pensionEmployee      = self::r2($gross * self::RATES['pension_employee']);
        $pensionEmployer      = self::r2($gross * self::RATES['pension_employer']);
        $occupationalEmployer = self::r2($maternityBase * self::RATES['occupational_employer']);
        $maternityEmployee    = self::r2($maternityBase * self::RATES['maternity_employee']);
        $maternityEmployer    = self::r2($maternityBase * self::RATES['maternity_employer']);
        $ramaEmployee         = self::r2($maternityBase * self::RATES['rama_employee']);
        $ramaEmployer         = self::r2($maternityBase * self::RATES['rama_employer']);

        // Step 15 – employee RSSB total (pension + maternity)
        $rssbEmployeeTotal = self::r2($pensionEmployee + $maternityEmployee);

        // Step 18 – net salary after PAYE, RSSB and RAMA
        $netSalary = self::r2(max(0.0, $gross - $paye - $rssbEmployeeTotal - $ramaEmployee));

        // Steps 19–20 – CBHI on net salary, then deducted from it
        $cbhi         = self::r2($netSalary * self::RATES['cbhi_employee']);
        $netAfterCbhi = self::r2(max(0.0, $netSalary - $cbhi));

        // Steps 21–22 – other deductions, then net pay
        $other  = self::r2(max(0.0, (float) ($otherDeductions ?? 0.0)));
        $netPay = self::r2(max(0.0, $netAfterCbhi - $other));

        return [
            'basic_salary'              => $basic,
            'housing_allowance'         => $housing,
            'transport_allowance'       => $transport,
            'base_gross'                => $baseGross,
            'responsibility_allowance'  => $responsibilityAllowance,
            'arrears'                   => $arrears,
            'gross'                     => $gross,
            'paye'                      => $paye,
            'maternity_base'            => $maternityBase,
            'pension_employee'          => $pensionEmployee,
            'pension_employer'          => $pensionEmployer,
            'occupational_employer'     => $occupationalEmployer,
            'maternity_employee'        => $maternityEmployee,
            'maternity_employer'        => $maternityEmployer,
            'rssb_employee_total'       => $rssbEmployeeTotal,
            'rama_employee'             => $ramaEmployee,
            'rama_employer'             => $ramaEmployer,
            'net_salary'                => $netSalary,
            'cbhi'                      => $cbhi,
            'net_after_cbhi'            => $netAfterCbhi,
            'other_deductions'          => $other,
            'net_pay'                   => $netPay,
            'employer_cost'             => self::r2($gross + $pensionEmployer + $occupationalEmployer
                                            + $maternityEmployer + $ramaEmployer),
        ];
    }

    /** Public rule set for the UI: rates, PAYE bands and responsibility roles. */
    public static function rules(): array
    {
        return [
            'rates'                 => self::RATES,
            'paye_bands'            => self::PAYE_BANDS,
            'responsibility_roles'  => array_map(
                static fn (string $code, array $r) => ['code' => $code, 'label' => $r['label'], 'amount' => $r['amount']],
                array_keys(self::RESPONSIBILITY_ROLES),
                array_values(self::RESPONSIBILITY_ROLES)
            ),
        ];
    }

    private static function r2(float $value): float
    {
        return round($value, 2);
    }
}

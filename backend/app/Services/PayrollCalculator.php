<?php

declare(strict_types=1);

namespace App\Services;

use InvalidArgumentException;

/**
 * CUR payroll calculator.
 *
 * Single source of truth for monthly payroll, implementing the
 * "Calculation of Payroll" procedure (steps 1–22). The formulas live here. The
 * numbers they use (contribution rates, PAYE bands, responsibility amounts) come
 * from PayrollSettings, which HR can change on the Payroll Settings page.
 *
 * Pure PHP, no database access. Callers pass the settings in; when they do not,
 * the defaults in PayrollSettings are used.
 *
 * Every monetary value is rounded to 2 decimals and downstream steps use the
 * rounded value, so the stored payslip always adds up.
 */
final class PayrollCalculator
{
    /** Responsibility roles (step 5). Codes and labels are fixed here; amounts come from settings. */
    public const RESPONSIBILITY_ROLES = [
        'academic_secretary'            => ['label' => 'Academic Secretary'],
        'dean'                          => ['label' => 'Dean'],
        'registrar'                     => ['label' => 'Registrar'],
        'director_research'             => ['label' => 'Director of Research'],
        'cpa_coordinator'               => ['label' => 'CPA Coordinator'],
        'international_student_coord'   => ['label' => 'International Student Coordinator'],
        'planning_cooperation'          => ['label' => 'Planning and Cooperation'],
        'internal_auditor'              => ['label' => 'Internal Auditor'],
        'sponsored_student_coord'       => ['label' => 'Sponsored Student Coordinator (Chancen)'],
        'head_of_unit'                  => ['label' => 'Head of Unit (Director)'],
        'head_of_department'            => ['label' => 'Head of Department'],
    ];

    /**
     * Responsibility allowance for a role code. Null/empty means no role.
     *
     * @param array|null $settings Output of PayrollSettings::calculatorInputs()
     *
     * @throws InvalidArgumentException for an unknown role code
     */
    public static function responsibilityAmount(?string $role, ?array $settings = null): float
    {
        if ($role === null || $role === '') {
            return 0.0;
        }
        if (!isset(self::RESPONSIBILITY_ROLES[$role])) {
            throw new InvalidArgumentException("Unknown responsibility role: {$role}");
        }
        $settings ??= PayrollSettings::calculatorDefaults();
        return (float) ($settings['responsibility_amounts'][$role] ?? 0.0);
    }

    /**
     * Monthly PAYE on a total gross amount (step 8).
     *
     * @param array|null $bands Output of PayrollSettings::calculatorInputs()['paye_bands']
     */
    public static function paye(float $taxableIncome, ?array $bands = null): float
    {
        if ($taxableIncome <= 0) {
            return 0.0;
        }

        $bands ??= PayrollSettings::calculatorDefaults()['paye_bands'];

        $tax = 0.0;
        $lower = 0.0;
        foreach ($bands as $band) {
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
     * @param array|null  $settings        Output of PayrollSettings::calculatorInputs()
     * @return array<string, float> Every figure in the procedure, keyed by step name
     */
    public static function calculate(
        float $basicSalary,
        ?string $responsibility = null,
        float $arrears = 0.0,
        ?float $otherDeductions = 0.0,
        ?array $settings = null,
    ): array {
        $settings ??= PayrollSettings::calculatorDefaults();
        return self::compute(
            $basicSalary,
            self::responsibilityAmount($responsibility, $settings),
            $arrears,
            $otherDeductions,
            $settings,
        );
    }

    /**
     * Same procedure as calculate(), but takes the responsibility allowance amount
     * directly. Used to recompute a stored payroll row, which keeps the amount that
     * was in force when it was created.
     *
     * @param array|null $settings Output of PayrollSettings::calculatorInputs()
     * @return array<string, float>
     */
    public static function compute(
        float $basicSalary,
        float $responsibilityAmount,
        float $arrears = 0.0,
        ?float $otherDeductions = 0.0,
        ?array $settings = null,
    ): array {
        $settings ??= PayrollSettings::calculatorDefaults();
        $rates = $settings['rates'];

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
        $paye = self::paye($gross, $settings['paye_bands']);

        // Step 9 – maternity base excludes transport allowance
        $maternityBase = self::r2($gross - $transport);

        // Steps 10–17 – RSSB, maternity, RAMA (employee and employer shares)
        $pensionEmployee      = self::r2($gross * $rates['pension_employee']);
        $pensionEmployer      = self::r2($gross * $rates['pension_employer']);
        $occupationalEmployer = self::r2($maternityBase * $rates['occupational_employer']);
        $maternityEmployee    = self::r2($maternityBase * $rates['maternity_employee']);
        $maternityEmployer    = self::r2($maternityBase * $rates['maternity_employer']);
        $ramaEmployee         = self::r2($maternityBase * $rates['rama_employee']);
        $ramaEmployer         = self::r2($maternityBase * $rates['rama_employer']);

        // Step 15 – employee RSSB total (pension + maternity)
        $rssbEmployeeTotal = self::r2($pensionEmployee + $maternityEmployee);

        // Step 18 – net salary after PAYE, RSSB and RAMA
        $netSalary = self::r2(max(0.0, $gross - $paye - $rssbEmployeeTotal - $ramaEmployee));

        // Steps 19–20 – CBHI on net salary, then deducted from it
        $cbhi         = self::r2($netSalary * $rates['cbhi_employee']);
        $netAfterCbhi = self::r2(max(0.0, $netSalary - $cbhi));

        // Employer CBHI share – base: total gross (employer cost only, not deducted from pay)
        $cbhiEmployer = self::r2($gross * $rates['cbhi_employer']);

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
            'cbhi_employer'             => $cbhiEmployer,
            'net_after_cbhi'            => $netAfterCbhi,
            'other_deductions'          => $other,
            'net_pay'                   => $netPay,
            'employer_cost'             => self::r2($gross + $pensionEmployer + $occupationalEmployer
                                            + $maternityEmployer + $ramaEmployer + $cbhiEmployer),
        ];
    }

    /**
     * Public rule set for the UI: rates, PAYE bands and responsibility roles with
     * their current amounts.
     *
     * @param array|null $settings Output of PayrollSettings::calculatorInputs()
     */
    public static function rules(?array $settings = null): array
    {
        $settings ??= PayrollSettings::calculatorDefaults();

        $roles = [];
        foreach (self::RESPONSIBILITY_ROLES as $code => $role) {
            $roles[] = [
                'code'   => $code,
                'label'  => $role['label'],
                'amount' => (float) ($settings['responsibility_amounts'][$code] ?? 0.0),
            ];
        }

        return [
            'rates'                => $settings['rates'],
            'paye_bands'           => $settings['paye_bands'],
            'responsibility_roles' => $roles,
        ];
    }

    private static function r2(float $value): float
    {
        return round($value, 2);
    }
}

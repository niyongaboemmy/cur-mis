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
    /** Health insurance an employee is on. RAMA is the default; OTHER covers insurers such as RADIANT. */
    public const INSURANCE_RAMA  = 'RAMA';
    public const INSURANCE_OTHER = 'OTHER';

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
     * Splits a stored role list ("dean,internal_auditor") into unique role codes.
     * Null or empty means no roles. A person can hold more than one responsibility.
     *
     * @return list<string>
     *
     * @throws InvalidArgumentException for an unknown role code
     */
    public static function parseRoles(?string $roles): array
    {
        $codes = [];
        foreach (explode(',', (string) $roles) as $code) {
            $code = trim($code);
            if ($code === '' || in_array($code, $codes, true)) {
                continue;
            }
            if (!isset(self::RESPONSIBILITY_ROLES[$code])) {
                throw new InvalidArgumentException("Unknown responsibility role: {$code}");
            }
            $codes[] = $code;
        }
        return $codes;
    }

    /**
     * Responsibility allowance for a role list: the sum of each role's amount.
     * Null or empty means no role.
     *
     * @param array|null $settings Output of PayrollSettings::calculatorInputs()
     *
     * @throws InvalidArgumentException for an unknown role code
     */
    public static function responsibilityAmount(?string $roles, ?array $settings = null): float
    {
        $settings ??= PayrollSettings::calculatorDefaults();
        $total = 0.0;
        foreach (self::parseRoles($roles) as $code) {
            $total += (float) ($settings['responsibility_amounts'][$code] ?? 0.0);
        }
        return $total;
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
     * @param list<array{label: string, base: string, employee_rate: float, employer_rate: float}> $autoDeductions
     *                                     Step 21 – automatic deductions from AutoDeductionService::forEmployee()
     * @return array<string, float> Every figure in the procedure, keyed by step name
     */
    public static function calculate(
        float $basicSalary,
        ?string $responsibility = null,
        float $arrears = 0.0,
        ?float $otherDeductions = 0.0,
        ?array $settings = null,
        ?string $insurance = null,
        float $insurancePremium = 0.0,
        array $autoDeductions = [],
    ): array {
        $settings ??= PayrollSettings::calculatorDefaults();
        return self::compute(
            $basicSalary,
            self::responsibilityAmount($responsibility, $settings),
            $arrears,
            $otherDeductions,
            $settings,
            $insurance,
            $insurancePremium,
            $autoDeductions,
        );
    }

    /**
     * Same procedure as calculate(), but takes the responsibility allowance amount
     * directly. Used to recompute a stored payroll row, which keeps the amount that
     * was in force when it was created.
     *
     * @param array|null $settings Output of PayrollSettings::calculatorInputs()
     * @param list<array{label: string, base: string, employee_rate: float, employer_rate: float}> $autoDeductions
     *                     Rates are percentages (6 = 6%). base 'gross' uses total gross, 'net' uses net salary.
     * @return array<string, float>
     */
    public static function compute(
        float $basicSalary,
        float $responsibilityAmount,
        float $arrears = 0.0,
        ?float $otherDeductions = 0.0,
        ?array $settings = null,
        ?string $insurance = null,
        float $insurancePremium = 0.0,
        array $autoDeductions = [],
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

        // Employees on another insurer (for example RADIANT) pay no RAMA, and CUR pays no RAMA share.
        // The insurer premium comes through the employee deductions instead.
        if (self::insuranceOf($insurance) === self::INSURANCE_OTHER) {
            $ramaEmployee = 0.0;
            $ramaEmployer = 0.0;
        }

        // Step 15 – employee RSSB total (pension + maternity)
        $rssbEmployeeTotal = self::r2($pensionEmployee + $maternityEmployee);

        // Steps 18–19 – RADIANT (other insurer) premium, then net salary after PAYE, RSSB, RAMA and RADIANT.
        // The premium is only taken for employees on another insurer.
        $radiant = self::insuranceOf($insurance) === self::INSURANCE_OTHER ? self::r2(max(0.0, $insurancePremium)) : 0.0;
        $netSalary = self::r2(max(0.0, $gross - $paye - $rssbEmployeeTotal - $ramaEmployee - $radiant));

        // Steps 20–21 – CBHI 0.5% of that net salary, then deducted from it
        $cbhi         = self::r2($netSalary * $rates['cbhi_employee']);
        $netAfterCbhi = self::r2(max(0.0, $netSalary - $cbhi));

        // Employer CBHI share – base: total gross (employer cost only, not deducted from pay)
        $cbhiEmployer = self::r2($gross * $rates['cbhi_employer']);

        // Step 21 – automatic deductions from Payroll Settings (insurers and other percentages).
        // Each one is a percentage of gross or of net salary. The employer share adds to employer cost.
        $autoEmployee = 0.0;
        $autoEmployer = 0.0;
        foreach ($autoDeductions as $item) {
            $base          = ($item['base'] ?? AutoDeductionService::BASE_GROSS) === AutoDeductionService::BASE_NET ? $netSalary : $gross;
            $autoEmployee += self::r2($base * (float) ($item['employee_rate'] ?? 0) / 100);
            $autoEmployer += self::r2($base * (float) ($item['employer_rate'] ?? 0) / 100);
        }
        $autoEmployee = self::r2($autoEmployee);
        $autoEmployer = self::r2($autoEmployer);

        // Steps 21–22 – other deductions (manual plus automatic), then net pay
        $other  = self::r2(max(0.0, (float) ($otherDeductions ?? 0.0)) + $autoEmployee);
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
            'radiant'                   => $radiant,
            'cbhi'                      => $cbhi,
            'cbhi_employer'             => $cbhiEmployer,
            'net_after_cbhi'            => $netAfterCbhi,
            'auto_deductions'           => $autoEmployee,
            'auto_employer'             => $autoEmployer,
            'other_deductions'          => $other,
            'net_pay'                   => $netPay,
            'employer_cost'             => self::r2($gross + $pensionEmployer + $occupationalEmployer
                                            + $maternityEmployer + $ramaEmployer + $cbhiEmployer + $autoEmployer),
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

    /** Normalises an insurance code; unknown or empty means RAMA. */
    public static function insuranceOf(?string $insurance): string
    {
        return strtoupper(trim((string) $insurance)) === self::INSURANCE_OTHER ? self::INSURANCE_OTHER : self::INSURANCE_RAMA;
    }

    private static function r2(float $value): float
    {
        return round($value, 2);
    }
}

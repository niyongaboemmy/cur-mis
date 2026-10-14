<?php

declare(strict_types=1);

namespace App\Services;

use Core\Database;

/**
 * Bridges PayrollCalculator and the hr_payroll table.
 *
 * Maps the calculator's step names onto hr_payroll columns and refreshes stored
 * rows when inputs change (for example, when a per-employee deduction is added).
 */
final class HrPayrollRecalculator
{
    /** Calculator output key → hr_payroll column. */
    private const COLUMN_MAP = [
        'basic_salary'             => 'basic_salary',
        'housing_allowance'        => 'housing_allowance',
        'transport_allowance'      => 'transport_allowance',
        'base_gross'               => 'base_gross',
        'responsibility_allowance' => 'responsibility_allowance',
        'arrears'                  => 'arrears',
        'gross'                    => 'gross',
        'paye'                     => 'tax',
        'maternity_base'           => 'maternity_base',
        'pension_employee'         => 'pension',
        'rama_employee'            => 'rama',
        'maternity_employee'       => 'maternity',
        'cbhi'                     => 'cbhi',
        'other_deductions'         => 'other_deductions',
        'net_pay'                  => 'net',
        'pension_employer'         => 'employer_pension',
        'maternity_employer'       => 'employer_maternity',
        'occupational_employer'    => 'employer_occupational',
        'rama_employer'            => 'employer_rama',
        'employer_cost'            => 'gross_cost',
    ];

    /** Sum of this employee's active deductions that fall in the given month. */
    public static function activeDeductionTotal(Database $db, int $empId, int $year, int $month): float
    {
        $rows = $db->fetchAll(
            "SELECT monthly_amount
             FROM hr_employee_deductions
             WHERE emp_id = ?
               AND status = 'Active'
               AND (start_year < ? OR (start_year = ? AND start_month <= ?))
               AND (end_year IS NULL
                    OR end_year > ?
                    OR (end_year = ? AND end_month >= ?))",
            [$empId, $year, $year, $month, $year, $year, $month]
        ) ?: [];

        return (float)array_sum(array_column($rows, 'monthly_amount'));
    }

    /** Converts a calculator result into an hr_payroll column => value array. */
    public static function columnsFor(array $calc): array
    {
        $out = [];
        foreach (self::COLUMN_MAP as $key => $column) {
            $out[$column] = $calc[$key];
        }
        return $out;
    }

    /**
     * Recomputes every still-Pending payroll row for one employee from its stored
     * basic salary, responsibility allowance and arrears, plus current deductions.
     * Approved and Paid rows are never changed. Rows with no basic salary are skipped.
     */
    public static function refreshPendingForEmployee(Database $db, int $empId): void
    {
        $rows = $db->fetchAll(
            "SELECT id, period_year, period_month, basic_salary, responsibility_allowance, arrears
             FROM hr_payroll
             WHERE emp_id = ? AND status = 'Pending'",
            [$empId]
        ) ?: [];

        $settings = PayrollSettings::calculatorInputs(PayrollSettings::load($db));

        foreach ($rows as $row) {
            if ((float)$row['basic_salary'] <= 0) {
                continue;
            }

            $other = self::activeDeductionTotal(
                $db,
                $empId,
                (int)$row['period_year'],
                (int)$row['period_month']
            );

            $calc = PayrollCalculator::compute(
                (float)$row['basic_salary'],
                (float)$row['responsibility_allowance'],
                (float)$row['arrears'],
                $other,
                $settings
            );

            $columns = self::columnsFor($calc);
            $set = implode(', ', array_map(static fn (string $c) => "`{$c}` = ?", array_keys($columns)));

            $db->execute(
                "UPDATE hr_payroll SET {$set} WHERE id = ?",
                [...array_values($columns), (int)$row['id']]
            );
        }
    }
}

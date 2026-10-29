<?php

declare(strict_types=1);

namespace App\Payroll\Runs;

/**
 * The engine figures stored on each payroll line, in the order they are calculated.
 * Each name is also the column name in payroll_lines, so one list drives both the insert
 * and the read-back.
 */
final class PayrollLineColumns
{
    public const MONEY = [
        'basic_salary', 'basic_topup', 'total_basic', 'housing_allowance', 'transport_allowance',
        'gross_salary', 'responsibility_allowance', 'arrears', 'total_gross', 'paye',
        'maternity_base', 'pension_employee', 'pension_employer', 'maternity_employee', 'maternity_employer',
        'hazard_employer', 'rssb_employee_total', 'rama_employee', 'rama_employer', 'other_insurance',
        'net_before_cbhi', 'cbhi', 'net_after_cbhi', 'deductions', 'net_pay', 'total_deductions',
        'employer_cost', 'gross_up_residual',
    ];

    /**
     * Keeps only the storable figures from an engine result.
     *
     * @param array<string, mixed> $line
     * @return array<string, int|string>
     */
    public static function fromEngineLine(array $line): array
    {
        $row = [];
        foreach (self::MONEY as $column) {
            $row[$column] = (int) ($line[$column] ?? 0);
        }
        $row['tax_method'] = (string) ($line['tax_method'] ?? '');
        $row['warnings_json'] = json_encode($line['warnings'] ?? [], JSON_THROW_ON_ERROR);
        return $row;
    }
}

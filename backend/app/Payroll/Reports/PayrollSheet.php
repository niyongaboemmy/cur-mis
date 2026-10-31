<?php

declare(strict_types=1);

namespace App\Payroll\Reports;

/**
 * Layout of the run sheet export: the same order as CUR's payroll sheet (No, names, Basic Salary … NET PAY),
 * with the employee's contributions and the employer's contributions under separate, labelled headings.
 *
 * Pure: takes the run's lines and the names of the people, and returns rows. The workbook writer lays them out.
 */
final class PayrollSheet
{
    /**
     * [heading, source key, side]. side is 'Employee', 'Employer' or '' for lines that are not contributions.
     * The source key is a payroll_lines column, or no / first_name / last_name for the person columns.
     */
    public const COLUMNS = [
        ['No', 'no', ''],
        ['First name', 'first_name', ''],
        ['Last name', 'last_name', ''],
        ['Basic Salary', 'basic_salary', ''],
        ['Basic top-up', 'basic_topup', ''],
        ['Housing', 'housing_allowance', ''],
        ['Transport', 'transport_allowance', ''],
        ['Gross salary', 'gross_salary', ''],
        ['Responsibility', 'responsibility_allowance', ''],
        ['Arrears', 'arrears', ''],
        ['TOTAL GROSS', 'total_gross', ''],
        ['PAYE (RRA)', 'paye', 'Employee'],
        ['Pension', 'pension_employee', 'Employee'],
        ['Maternity', 'maternity_employee', 'Employee'],
        ['RSSB total', 'rssb_employee_total', 'Employee'],
        ['RAMA', 'rama_employee', 'Employee'],
        ['Other insurance', 'other_insurance', 'Employee'],
        ['CBHI', 'cbhi', 'Employee'],
        ['Other deductions', 'deductions', 'Employee'],
        ['NET PAY', 'net_pay', ''],
        ['Pension', 'pension_employer', 'Employer'],
        ['Maternity', 'maternity_employer', 'Employer'],
        ['Occupational hazard', 'hazard_employer', 'Employer'],
        ['RAMA', 'rama_employer', 'Employer'],
        ['Employer cost', 'employer_cost', 'Employer'],
    ];

    /**
     * @param list<array<string, mixed>>                                   $lines payroll_lines rows
     * @param array<int, array{first_name: string, last_name: string}>    $names employee_id => names
     * @return array{headings: list<string>, rows: list<list<int|string>>, totals: list<int|string>}
     */
    public static function build(array $lines, array $names): array
    {
        $headings = [];
        foreach (self::COLUMNS as [$heading, , $side]) {
            $headings[] = $side === '' ? $heading : "{$side}: {$heading}";
        }

        $rows = [];
        $totals = array_fill(0, count(self::COLUMNS), 0);
        $number = 0;
        foreach ($lines as $line) {
            $number++;
            $person = $names[(int) $line['employee_id']] ?? ['first_name' => '', 'last_name' => (string) $line['employee_name']];
            $row = [];
            foreach (self::COLUMNS as $i => [, $key]) {
                $value = match ($key) {
                    'no'         => $number,
                    'first_name' => $person['first_name'],
                    'last_name'  => $person['last_name'],
                    default      => (int) ($line[$key] ?? 0),
                };
                $row[] = $value;
                if (is_int($value) && $key !== 'no') {
                    $totals[$i] += $value;
                }
            }
            $rows[] = $row;
        }

        $totalRow = $totals;
        $totalRow[0] = 'TOTAL';
        $totalRow[1] = '';
        $totalRow[2] = '';
        return ['headings' => $headings, 'rows' => $rows, 'totals' => $totalRow];
    }
}

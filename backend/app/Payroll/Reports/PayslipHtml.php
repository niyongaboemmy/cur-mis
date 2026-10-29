<?php

declare(strict_types=1);

namespace App\Payroll\Reports;

use App\Payroll\DataQuality\PayrollDataQualityReport;

/**
 * One person's payslip for one run: earnings, employee deductions, employer contributions and net pay.
 * Pure HTML from the stored line; the PDF is produced by PayrollPdf.
 */
final class PayslipHtml
{
    /**
     * @param array<string, mixed> $line     payroll_lines row
     * @param array<string, mixed> $run      payroll_runs row
     */
    public static function build(array $line, array $run): string
    {
        $m = static fn (string $key): string => number_format((int) $line[$key]);
        $e = [PayrollPdf::class, 'e'];

        $earnings = [
            ['Basic salary', 'basic_salary'],
            ['Basic top-up', 'basic_topup'],
            ['Housing allowance', 'housing_allowance'],
            ['Transport allowance', 'transport_allowance'],
            ['Responsibility allowance', 'responsibility_allowance'],
            ['Arrears', 'arrears'],
        ];
        $deductions = [
            ['PAYE', 'paye'],
            ['Pension (employee)', 'pension_employee'],
            ['Maternity (employee)', 'maternity_employee'],
            ['RAMA (employee)', 'rama_employee'],
            ['Other insurance', 'other_insurance'],
            ['CBHI', 'cbhi'],
            ['Other deductions', 'deductions'],
        ];
        $employer = [
            ['Pension (employer)', 'pension_employer'],
            ['Maternity (employer)', 'maternity_employer'],
            ['Occupational hazard (employer)', 'hazard_employer'],
            ['RAMA (employer)', 'rama_employer'],
        ];

        $table = static function (string $heading, array $items) use ($m, $e): string {
            $rows = '';
            foreach ($items as [$label, $key]) {
                $rows .= '<tr><td>' . $e($label) . '</td><td class="num">' . $m($key) . '</td></tr>';
            }
            return '<h2>' . $e($heading) . '</h2><table>' . $rows . '</table>';
        };

        $title = 'Payslip: ' . (string) $run['title'];
        $period = substr((string) $run['period_date'], 0, 7);
        $bank = trim((string) ($line['bank_name'] ?? '')) !== '' ? (string) $line['bank_name'] : 'not recorded';
        $account = (string) ($line['account_number'] ?? '');
        $masked = $account === '' ? 'not recorded' : PayrollDataQualityReport::maskAccount($account);

        $body = '<h1>' . $e($title) . '</h1>
            <p>Catholic University of Rwanda &middot; period ' . $e($period) . '</p>
            <table><tr><th>Employee</th><td>' . $e((string) $line['employee_name']) . '</td>
                   <th>Bank</th><td>' . $e($bank) . ' &middot; ' . $e($masked) . '</td></tr></table>'
            . $table('Earnings', $earnings)
            . '<table><tr><th>Total gross</th><td class="num">' . $m('total_gross') . '</td></tr></table>'
            . $table('Deductions', $deductions)
            . '<table><tr><th>Total deductions</th><td class="num">' . $m('total_deductions') . '</td></tr></table>'
            . '<table class="total"><tr class="total"><td>NET PAY</td><td class="num">' . $m('net_pay') . ' RWF</td></tr></table>'
            . $table('Employer contributions (not deducted from pay)', $employer)
            . '<table><tr><th>Employer cost</th><td class="num">' . $m('employer_cost') . '</td></tr></table>';

        return PayrollPdf::document($title, $body);
    }
}

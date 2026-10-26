<?php

declare(strict_types=1);

namespace Tests\Payroll;

use App\Payroll\Reports\BankTransferList;
use App\Payroll\Reports\PayrollPdf;
use App\Payroll\Reports\PayrollSheet;
use App\Payroll\Reports\PayrollWorkbook;
use App\Payroll\Reports\PayslipHtml;
use App\Payroll\Reports\StatutoryTotals;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PHPUnit\Framework\TestCase;

/** Phase 7: exports and statutory totals, from line data (no database). */
final class ReportsTest extends TestCase
{
    /** A payroll_lines row with the figures the reports read. */
    private function line(int $employeeId, string $name, string $bank, string $account, array $figures = []): array
    {
        $defaults = [
            'basic_salary' => 0, 'basic_topup' => 0, 'housing_allowance' => 0, 'transport_allowance' => 0,
            'gross_salary' => 0, 'responsibility_allowance' => 0, 'arrears' => 0, 'total_gross' => 0,
            'paye' => 0, 'pension_employee' => 0, 'pension_employer' => 0, 'maternity_employee' => 0,
            'maternity_employer' => 0, 'hazard_employer' => 0, 'rssb_employee_total' => 0, 'rama_employee' => 0,
            'rama_employer' => 0, 'other_insurance' => 0, 'cbhi' => 0, 'deductions' => 0, 'total_deductions' => 0,
            'net_pay' => 0, 'employer_cost' => 0, 'housing_allowance' => 0,
        ];
        return ['employee_id' => $employeeId, 'employee_name' => $name, 'bank_name' => $bank,
            'account_number' => $account, 'line_ref' => ''] + array_merge($defaults, $figures);
    }

    public function testPayrollSheetKeepsTheCalculationOrderAndTotals(): void
    {
        $lines = [
            $this->line(101, 'Uwase Alice', 'Equity Bank', '1001', ['total_gross' => 1000, 'net_pay' => 600, 'paye' => 150]),
            $this->line(102, 'Mugisha Bob', 'Bank of Kigali', '2002', ['total_gross' => 500, 'net_pay' => 300, 'paye' => 50]),
        ];
        $names = [101 => ['first_name' => 'Alice', 'last_name' => 'Uwase'], 102 => ['first_name' => 'Bob', 'last_name' => 'Mugisha']];

        $sheet = PayrollSheet::build($lines, $names);

        $this->assertSame(['No', 'First name', 'Last name'], array_slice($sheet['headings'], 0, 3));
        $this->assertContains('Employee: PAYE (RRA)', $sheet['headings']);
        $this->assertContains('Employer: Pension', $sheet['headings']);
        $this->assertSame([1, 'Alice', 'Uwase'], array_slice($sheet['rows'][0], 0, 3));

        $index = array_search('TOTAL GROSS', $sheet['headings'], true);
        $this->assertSame(1500, $sheet['totals'][$index]);
        $this->assertSame('TOTAL', $sheet['totals'][0]);
        $this->assertSame(900, $sheet['totals'][array_search('NET PAY', $sheet['headings'], true)]);
    }

    public function testPayrollSheetHeadingsCarryNoRatesSoARateChangeNeedsNoEdit(): void
    {
        foreach (PayrollSheet::COLUMNS as [$heading]) {
            $this->assertDoesNotMatchRegularExpression('/\d+(\.\d+)?%/', $heading);
        }
    }

    public function testBankListGroupsByBankAndPaysEachPersonOnce(): void
    {
        // Spec §9 test 14: one lecturer with three module lines is paid once, with the three nets added together
        $lines = [
            $this->line(102, 'Mugisha Bob', 'Bank of Kigali', '2002', ['net_pay' => 100]),
            $this->line(102, 'Mugisha Bob', 'Bank of Kigali', '2002', ['net_pay' => 200]),
            $this->line(102, 'Mugisha Bob', 'Bank of Kigali', '2002', ['net_pay' => 300]),
            $this->line(101, 'Uwase Alice', 'Equity Bank', '1001', ['net_pay' => 50]),
            $this->line(103, 'Ingabire Carol', '', '', ['net_pay' => 70]),
        ];

        $list = BankTransferList::build($lines);

        $byBank = [];
        foreach ($list['banks'] as $group) {
            $byBank[$group['bank']] = $group;
        }
        $this->assertSame([['name' => 'Mugisha Bob', 'account' => '2002', 'amount' => 600]], $byBank['Bank of Kigali']['payments']);
        $this->assertSame(600, $byBank['Bank of Kigali']['total']);
        $this->assertSame(70, $byBank[BankTransferList::UNASSIGNED]['total']);
        $this->assertSame(720, $list['total'], 'the grand total is the sum of every net');
    }

    public function testStatutoryTotalsSeparateEmployeeAndEmployerShares(): void
    {
        $lines = [
            $this->line(101, 'A', 'x', '1', ['paye' => 100, 'pension_employee' => 60, 'maternity_employee' => 3,
                'pension_employer' => 60, 'maternity_employer' => 3, 'hazard_employer' => 20,
                'rama_employee' => 75, 'rama_employer' => 75, 'cbhi' => 5]),
            $this->line(102, 'B', 'x', '2', ['paye' => 200, 'pension_employee' => 40, 'maternity_employee' => 2,
                'pension_employer' => 40, 'maternity_employer' => 2, 'hazard_employer' => 10,
                'rama_employee' => 25, 'rama_employer' => 25, 'cbhi' => 4]),
        ];

        $totals = StatutoryTotals::build($lines);

        $this->assertSame(300, $totals['rra']['employee']);
        $this->assertSame(100, $totals['rssb']['pension']['employee']);
        $this->assertSame(5, $totals['rssb']['maternity']['employee']);
        $this->assertSame(105, $totals['rssb']['total']['employee'], 'employee RSSB is pension plus maternity');
        $this->assertSame(135, $totals['rssb']['total']['employer'], 'employer RSSB includes hazard');
        $this->assertSame(100, $totals['rama']['employee']);
        $this->assertSame(100, $totals['rama']['employer']);
        $this->assertSame(9, $totals['cbhi']['employee']);
    }

    public function testPayslipShowsNetPayAndMasksTheAccountAndEscapesNames(): void
    {
        $line = $this->line(101, '<script>alert(1)</script>', 'Equity Bank', '0012345678',
            ['total_gross' => 2365396, 'net_pay' => 1096716, 'employer_cost' => 2600000]);
        $run = ['title' => 'June 2026 salary', 'period_date' => '2026-06-01'];

        $html = PayslipHtml::build($line, $run);

        $this->assertStringContainsString('1,096,716 RWF', $html);
        $this->assertStringContainsString('******5678', $html);
        $this->assertStringNotContainsString('0012345678', $html, 'the full account number is never printed');
        $this->assertStringNotContainsString('<script>', $html, 'names are escaped');
        $this->assertStringContainsString('&lt;script&gt;', $html);
    }

    public function testWorkbookHasTheThreeSheetsAndReadsBackWithItsTotals(): void
    {
        $run = ['title' => 'June 2026', 'period_date' => '2026-06-01', 'status' => 'APPROVED'];
        $lines = [
            $this->line(101, 'Uwase Alice', 'Equity Bank', '1001', ['total_gross' => 1000, 'net_pay' => 600, 'paye' => 150]),
            $this->line(102, 'Mugisha Bob', 'Bank of Kigali', '2002', ['total_gross' => 500, 'net_pay' => 300, 'paye' => 50]),
        ];
        $sheet = PayrollSheet::build($lines, []);
        $bankList = BankTransferList::build($lines);
        $statutory = StatutoryTotals::build($lines);

        $book = PayrollWorkbook::build($run, $sheet, $bankList, $statutory);
        $bytes = PayrollWorkbook::toXlsx($book);

        $path = tempnam(sys_get_temp_dir(), 'xlsxtest');
        file_put_contents($path, $bytes);
        try {
            $read = IOFactory::load($path);
        } finally {
            @unlink($path);
        }

        $this->assertSame(['Payroll', 'Bank transfers', 'Statutory'], $read->getSheetNames());
        $bank = $read->getSheetByName('Bank transfers');
        $this->assertSame('GRAND TOTAL', $bank->getCell('B6')->getValue());
        $this->assertSame(900, (int) $bank->getCell('D6')->getValue());
        $this->assertSame('PAYE', $read->getSheetByName('Statutory')->getCell('B2')->getValue());
    }

    public function testPdfRenderingProducesAPdfWhenDompdfIsInstalled(): void
    {
        if (!class_exists(\Dompdf\Dompdf::class)) {
            $this->markTestSkipped('Dompdf is not installed.');
        }
        $pdf = PayrollPdf::render(PayrollPdf::document('Test', '<p>Hello</p>'));
        $this->assertNotNull($pdf);
        $this->assertStringStartsWith('%PDF', $pdf);
    }
}

<?php

declare(strict_types=1);

namespace Tests\Payroll;

use App\Payroll\Engine\LineInput;

/**
 * Spec §9 test 1: the golden case from the original Excel, PERMANENT scheme.
 * Basic 1,647,309; top-up 11.68228%; ÷7 housing and transport; RAMA 7.5% applies and
 * the OTHER-insurer premium (M.I RADIANT) of 82,620 is also taken; other deductions 200,000.
 */
final class GoldenPermanentTest extends PayrollTestCase
{
    public function testGoldenPayslip(): void
    {
        $line = $this->engine()->compute(new LineInput(
            scheme: 'PERMANENT',
            basic: 1647309,
            rama: true,
            otherInsurance: 82620,
            deductions: 200000,
        ));

        $this->assertRwf(2365396, $line['total_gross'], 'total gross');
        $this->assertRwf(673619, $line['paye'], 'PAYE');
        $this->assertRwf(148231, $line['rssb_employee_total'], 'RSSB employee total');
        $this->assertRwf(157693, $line['rama_employee'], 'RAMA employee');
        $this->assertRwf(6516, $line['cbhi'], 'CBHI');
        $this->assertRwf(1096716, $line['net_pay'], 'net pay');
        $this->assertSame([], $line['warnings']);
    }

    public function testBasicTopUpAndDivisorsAreExact(): void
    {
        $line = $this->engine()->compute(new LineInput(scheme: 'PERMANENT', basic: 1647309, rama: true));

        // 1,647,309 × 11.68228% = 192,443.1, rounded to 192,443; then ÷7 for housing and transport
        $this->assertSame(192443, $line['basic_topup']);
        $this->assertSame(1839752, $line['total_basic']);
        $this->assertSame(262822, $line['housing_allowance']);
        $this->assertSame(262822, $line['transport_allowance']);
        $this->assertSame(2365396, $line['total_gross']);
    }
}

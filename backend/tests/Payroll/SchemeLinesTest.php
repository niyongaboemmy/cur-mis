<?php

declare(strict_types=1);

namespace Tests\Payroll;

use App\Payroll\Engine\LineInput;

/** Spec §9 tests 3–9: one case per scheme and tax method. */
final class SchemeLinesTest extends PayrollTestCase
{
    public function testSupportStaffWithPerEmployeeTopUpAndNoHousing(): void
    {
        $line = $this->engine()->compute(new LineInput(
            scheme: 'SUPPORT',
            basic: 139732,
            topupRate: '8.703223',
            housingDivisor: 0,
            transportDivisor: 0,
            rama: true,
        ));

        $this->assertSame(151893, $line['total_gross']);
        $this->assertSame(14379, $line['paye']);
        $this->assertSame(9114, $line['pension_employee']);
        $this->assertSame(456, $line['maternity_employee']);
        $this->assertSame(11392, $line['rama_employee']);
        $this->assertSame(583, $line['cbhi']);
        // The spec's own components (151,893 − 14,379 − 9,114 − 456 − 11,392 − 583) give 115,969,
        // not the 115,971 the spec states. Flagged for CUR to confirm; the formulas give 115,969.
        $this->assertSame(115969, $line['net_pay']);
    }

    public function testPartTimeLecturerHourlyFlatThirtyPercent(): void
    {
        $line = $this->engine()->compute(new LineInput(
            scheme: 'PART_TIME',
            quantity: '80',
            unitRate: 6291,
        ));

        $this->assertSame(503280, $line['total_gross']);
        $this->assertSame(150984, $line['paye']);
        $this->assertSame(30197, $line['pension_employee']);
        $this->assertSame(1510, $line['maternity_employee']);
        $this->assertSame(0, $line['hazard_employer']);
        $this->assertSame(0, $line['rama_employee']);
        $this->assertSame(1603, $line['cbhi']);
        $this->assertSame(318986, $line['net_pay']);
    }

    public function testPartTimeHoursOverrideIsJustAnotherQuantity(): void
    {
        $line = $this->engine()->compute(new LineInput(
            scheme: 'PART_TIME',
            quantity: '36',
            unitRate: 5857,
        ));

        $this->assertSame(210852, $line['total_gross']);
        $this->assertRwf(133641, $line['net_pay'], 'net pay');
    }

    public function testCasualLabourerProgressiveWithDeduction(): void
    {
        $line = $this->engine()->compute(new LineInput(
            scheme: 'CASUAL',
            quantity: '2',
            unitRate: 75339,
            taxMethod: 'PROGRESSIVE',
            deductions: 50000,
        ));

        $this->assertSame(150678, $line['total_gross']);
        $this->assertSame(14136, $line['paye']);
        $this->assertSame(9041, $line['pension_employee']);
        $this->assertSame(452, $line['maternity_employee']);
        $this->assertSame(635, $line['cbhi']);
        $this->assertSame(76414, $line['net_pay']);
        // Pension 6% + hazard 2% = 8%. Each share is rounded, so the sum is 12,055 against the
        // spec's 12,054 (8% of the whole gross). Within the ±1 RWF tolerance.
        $this->assertRwf(12054, $line['pension_employer'] + $line['hazard_employer'], 'employer RSSB 8%');
    }

    public function testCasualLabourerUsesCasualLabourRule(): void
    {
        $line = $this->engine()->compute(new LineInput(
            scheme: 'CASUAL',
            quantity: '1',
            unitRate: 315550,
            taxMethod: 'CASUAL_LABOUR',
        ));

        $this->assertSame(38333, $line['paye']);
        // The spec states 256,051. CBHI on 257,337 is 1,286.7, which rounds to 1,287 (the spec's own
        // rule and the TRANSPORT case agree on that). That gives 256,050, within the ±1 RWF tolerance.
        $this->assertRwf(256051, $line['net_pay'], 'net pay');
    }

    public function testTransportAllowanceFlatThirtyPercent(): void
    {
        $line = $this->engine()->compute(new LineInput(
            scheme: 'TRANSPORT',
            enteredGross: 416591,
        ));

        $this->assertSame(124977, $line['paye']);
        $this->assertSame(26245, $line['rssb_employee_total']);
        $this->assertSame(1327, $line['cbhi']);
        $this->assertSame(264042, $line['net_pay']);
    }

    public function testConsultancyHasOnlyTax(): void
    {
        $line = $this->engine()->compute(new LineInput(
            scheme: 'CONSULTANCY',
            enteredGross: 571429,
        ));

        $this->assertSame(171429, $line['paye']);
        $this->assertSame(0, $line['rssb_employee_total']);
        $this->assertSame(0, $line['cbhi']);
        $this->assertSame(400000, $line['net_pay']);
    }
}

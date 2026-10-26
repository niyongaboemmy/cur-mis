<?php

declare(strict_types=1);

namespace Tests\Payroll;

use App\Payroll\Engine\LineInput;
use InvalidArgumentException;

/** Spec §7 item 9 (engine part): input validation and warnings. */
final class ValidationTest extends PayrollTestCase
{
    public function testNegativeSalaryIsRejected(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->engine()->compute(new LineInput(scheme: 'PERMANENT', basic: -1));
    }

    public function testUnknownSchemeIsRejected(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->engine()->compute(new LineInput(scheme: 'NOPE', basic: 1000));
    }

    public function testHourlySchemeNeedsQuantityAndRate(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->engine()->compute(new LineInput(scheme: 'PART_TIME', quantity: '10'));
    }

    public function testNegativeNetIsWarnedNotHidden(): void
    {
        $line = $this->engine()->compute(new LineInput(
            scheme: 'CONSULTANCY',
            enteredGross: 100000,
            deductions: 200000,
        ));

        $this->assertLessThan(0, $line['net_pay']);
        $this->assertContains('NEGATIVE_NET', $line['warnings']);
    }
}

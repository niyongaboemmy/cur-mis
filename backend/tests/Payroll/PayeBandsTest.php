<?php

declare(strict_types=1);

namespace Tests\Payroll;

use App\Payroll\Tax\ProgressiveTax;

/** Spec §9 test 2: progressive PAYE band edges, tested on the tax method directly. */
final class PayeBandsTest extends PayrollTestCase
{
    /** @return iterable<string, array{int, int}> */
    public function bandEdges(): iterable
    {
        yield 'below first band'  => [50000, 0];
        yield 'top of first band' => [60000, 0];
        yield 'second band'       => [80000, 2000];
        yield 'second band top'   => [100000, 4000];
        yield 'third band'        => [150000, 14000];
        yield 'third band top'    => [200000, 24000];
        yield 'fourth band'       => [250000, 39000];
    }

    /** @dataProvider bandEdges */
    public function testProgressiveBandEdges(int $gross, int $expectedTax): void
    {
        $tax = new ProgressiveTax($this->settings()['paye_bands']);
        $this->assertSame($expectedTax, $tax->tax($gross));
    }

    public function testNoTaxOnZeroOrNegativeGross(): void
    {
        $tax = new ProgressiveTax($this->settings()['paye_bands']);
        $this->assertSame(0, $tax->tax(0));
        $this->assertSame(0, $tax->tax(-5000));
    }
}

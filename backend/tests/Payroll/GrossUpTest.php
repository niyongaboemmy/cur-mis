<?php

declare(strict_types=1);

namespace Tests\Payroll;

use App\Payroll\Engine\LineInput;
use App\Payroll\GrossUpSolver;
use InvalidArgumentException;
use RuntimeException;

/** Spec §9 tests 10–11: gross-up from a target net, using the engine itself. */
final class GrossUpTest extends PayrollTestCase
{
    public function testConsultancyGrossUpFromTargetNet(): void
    {
        $line = $this->engine()->compute(new LineInput(
            scheme: 'CONSULTANCY',
            targetNet: 400000,
        ));

        $this->assertSame(571429, $line['total_gross']);
        $this->assertSame(400000, $line['net_pay']);
        $this->assertSame(0, $line['gross_up_residual']);
    }

    public function testPgIncentiveGrossUpWithProgressiveBands(): void
    {
        $line = $this->engine()->compute(new LineInput(
            scheme: 'PG_INCENTIVE',
            targetNet: 204000,
            taxMethod: 'PROGRESSIVE',
        ));

        $this->assertRwf(265346, $line['total_gross'], 'gross');
        $this->assertSame(204000, $line['net_pay']);
        $this->assertSame(0, $line['gross_up_residual']);
    }

    public function testGrossUpNeedsAnEnteredGrossScheme(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->engine()->compute(new LineInput(scheme: 'PERMANENT', basic: 500000, targetNet: 400000));
    }

    public function testSolverFindsLargestGrossWithNetAtMostTarget(): void
    {
        // net = gross − gross÷2 is exact at even targets
        $result = (new GrossUpSolver())->largestGrossWithNetAtMost(500, static fn (int $g): int => $g - intdiv($g, 2));
        $this->assertSame(1000, $result['gross']);
        $this->assertSame(0, $result['residual']);
    }

    public function testSolverReportsResidualWhenTargetIsNotReachable(): void
    {
        // Net only moves in steps of 2, so an odd target has no exact gross
        $result = (new GrossUpSolver())->largestGrossWithNetAtMost(501, static fn (int $g): int => intdiv($g, 2) * 2);
        $this->assertSame(1, $result['residual']);
    }

    public function testSolverRejectsNegativeTarget(): void
    {
        $this->expectException(InvalidArgumentException::class);
        (new GrossUpSolver())->largestGrossWithNetAtMost(-1, static fn (int $g): int => $g);
    }

    public function testSolverStopsWhenTargetCannotBeBracketed(): void
    {
        $this->expectException(RuntimeException::class);
        // Net is always 0, so the search never reaches a gross above the target
        (new GrossUpSolver())->largestGrossWithNetAtMost(10, static fn (int $g): int => 0);
    }
}

<?php

declare(strict_types=1);

namespace App\Payroll;

use InvalidArgumentException;
use RuntimeException;

/**
 * Finds the entered gross that produces a target net, by binary search on whole RWF.
 *
 * Net pay rises with gross but not one-for-one, and rounding can skip a value, so the
 * search returns the largest gross whose net is at most the target. The residual is the
 * shortfall (target − net); it is 0 when the target is reachable exactly. Example: a
 * consultancy target of 400,000 at 30% gives gross 571,429 with residual 0.
 */
final class GrossUpSolver
{
    /** Hard cap on search steps, as a guard against a runaway loop. */
    public const MAX_ITERATIONS = 100;

    /** No payslip gross in RWF comes near this. Stops the bracket search before integer overflow. */
    public const MAX_GROSS = 1000000000000;

    /**
     * @param callable(int): int $netFor Net pay for a given gross; must be non-decreasing in gross
     * @return array{gross: int, residual: int}
     */
    public function largestGrossWithNetAtMost(int $targetNet, callable $netFor): array
    {
        if ($targetNet < 0) {
            throw new InvalidArgumentException('Target net cannot be negative.');
        }

        $low = 0;
        $high = max(1, $targetNet * 2);
        $steps = 0;
        // Grow the upper bound until it is over the target
        while ($netFor($high) <= $targetNet) {
            $high *= 2;
            if (++$steps > self::MAX_ITERATIONS || $high > self::MAX_GROSS) {
                throw new RuntimeException('Gross-up could not bracket the target net.');
            }
        }

        // Invariant: netFor(low) <= target < netFor(high)
        while ($high - $low > 1) {
            if (++$steps > self::MAX_ITERATIONS) {
                throw new RuntimeException('Gross-up did not converge.');
            }
            $mid = intdiv($low + $high, 2);
            if ($netFor($mid) <= $targetNet) {
                $low = $mid;
            } else {
                $high = $mid;
            }
        }

        return ['gross' => $low, 'residual' => $targetNet - $netFor($low)];
    }
}

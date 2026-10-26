<?php

declare(strict_types=1);

namespace App\Payroll\Tax;

use App\Payroll\Money;
use InvalidArgumentException;

/**
 * Progressive monthly PAYE bands. Each band taxes only the slice of gross that falls inside it.
 *
 * Bands are [['upper' => string|null, 'rate' => string], ...], lowest first. The last band
 * has upper = null. Rates are percentages as decimal strings.
 */
final class ProgressiveTax implements TaxMethod
{
    /** @var list<array{upper: ?string, rate: string}> */
    private array $bands;

    /** @param list<array{upper: ?string, rate: string}> $bands */
    public function __construct(array $bands)
    {
        if ($bands === []) {
            throw new InvalidArgumentException('Progressive tax needs at least one band.');
        }
        $this->bands = array_values($bands);
    }

    public function code(): string
    {
        return 'PROGRESSIVE';
    }

    public function tax(int $gross): int
    {
        if ($gross <= 0) {
            return 0;
        }

        // Sum the exact slices first, then round once, so the band arithmetic adds no error of its own.
        $total = '0';
        $lower = '0';
        foreach ($this->bands as $band) {
            if ($gross <= (int) $lower) {
                break;
            }
            $upper = $band['upper'] === null ? $gross : min($gross, (int) $band['upper']);
            $slice = (string) ($upper - (int) $lower);
            $total = bcadd($total, bcdiv(bcmul($slice, $band['rate'], 12), '100', 12), 12);
            $lower = $band['upper'] ?? (string) $gross;
        }

        return Money::round($total);
    }
}

<?php

declare(strict_types=1);

namespace App\Payroll\Tax;

use App\Payroll\Money;

/**
 * Casual labour: nothing on the first threshold of monthly gross, then a single rate on the excess.
 */
final class CasualLabourTax implements TaxMethod
{
    public function __construct(private int $threshold, private string $rate)
    {
    }

    public function code(): string
    {
        return 'CASUAL_LABOUR';
    }

    public function tax(int $gross): int
    {
        if ($gross <= $this->threshold) {
            return 0;
        }
        return Money::percent($gross - $this->threshold, $this->rate);
    }
}

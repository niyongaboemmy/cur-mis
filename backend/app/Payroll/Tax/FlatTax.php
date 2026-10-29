<?php

declare(strict_types=1);

namespace App\Payroll\Tax;

use App\Payroll\Money;

/**
 * A single rate on the whole gross. Used for FLAT_SECONDARY (CUR is not the person's first
 * employer) and for WITHHOLDING when CUR chooses it.
 */
final class FlatTax implements TaxMethod
{
    public function __construct(private string $code, private string $rate)
    {
    }

    public function code(): string
    {
        return $this->code;
    }

    public function tax(int $gross): int
    {
        return $gross <= 0 ? 0 : Money::percent($gross, $this->rate);
    }
}

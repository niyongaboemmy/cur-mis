<?php

declare(strict_types=1);

namespace App\Payroll\Tax;

final class NoTax implements TaxMethod
{
    public function code(): string
    {
        return 'NONE';
    }

    public function tax(int $gross): int
    {
        return 0;
    }
}

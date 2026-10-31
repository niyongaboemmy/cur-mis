<?php

declare(strict_types=1);

namespace App\Payroll\Tax;

/**
 * PAYE calculation for one line. Returns whole RWF.
 *
 * A tax method is chosen per scheme and can be overridden per contract. It holds no
 * state beyond the settings it was built with and never touches the database.
 */
interface TaxMethod
{
    /** Stable code stored with each payroll line, e.g. PROGRESSIVE. */
    public function code(): string;

    /** Tax due on a total gross amount in whole RWF. */
    public function tax(int $gross): int;
}

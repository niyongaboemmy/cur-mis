<?php

declare(strict_types=1);

namespace App\Payroll;

use InvalidArgumentException;

/**
 * Exact money arithmetic for payroll.
 *
 * Amounts are whole RWF integers. Rates are decimal strings in percent ("11.68228"),
 * never floats. Every line item is rounded to a whole RWF, half-up (away from zero),
 * before it is used in a later step or summed into a total.
 */
final class Money
{
    /** Working precision for intermediate decimal results. */
    private const SCALE = 12;

    /** Round a non-negative or negative decimal string to a whole RWF, half-up. */
    public static function round(string $value): int
    {
        self::assertDecimal($value);
        $negative = bccomp($value, '0', self::SCALE) < 0;
        $abs      = $negative ? bcmul($value, '-1', self::SCALE) : $value;
        // bcadd truncates to scale 0, so this is floor(abs + 0.5)
        $rounded  = bcadd($abs, '0.5', 0);
        $int      = (int) $rounded;

        return $negative ? -$int : $int;
    }

    /** base × percent / 100, rounded to whole RWF. percent is a decimal string such as "7.5". */
    public static function percent(int $base, string $percent): int
    {
        self::assertDecimal($percent);
        $product = bcmul((string) $base, $percent, self::SCALE);
        return self::round(bcdiv($product, '100', self::SCALE));
    }

    /** base ÷ divisor, rounded to whole RWF. A divisor of zero is an error; use 0 for "not applicable" at the call site. */
    public static function divide(int $base, int $divisor): int
    {
        if ($divisor <= 0) {
            throw new InvalidArgumentException('Divisor must be a positive integer.');
        }
        return self::round(bcdiv((string) $base, (string) $divisor, self::SCALE));
    }

    /** Validates that a value is a plain decimal number string such as "7", "-1.5" or "11.68228". */
    public static function assertDecimal(string $value): void
    {
        if (!preg_match('/^-?\d+(\.\d+)?$/', $value)) {
            throw new InvalidArgumentException("Not a decimal number: {$value}");
        }
    }
}

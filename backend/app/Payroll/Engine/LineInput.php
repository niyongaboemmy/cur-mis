<?php

declare(strict_types=1);

namespace App\Payroll\Engine;

/**
 * Inputs for one employee on one payroll line. All money is whole RWF.
 *
 * Which fields matter depends on the scheme's earnings mode:
 *   SALARY  – basic, topupRate and divisors (null = setting default; 0 = no housing/transport),
 *             responsibility, arrears
 *   HOURLY  – quantity (hours, decimal string) × unitRate, plus arrears
 *   DAILY   – quantity (days, decimal string) × unitRate, plus arrears
 *   ENTERED – enteredGross, or targetNet to solve the gross from a wanted net
 *
 * rama is the employee's RAMA membership and is combined with the scheme's own RAMA flag.
 * otherInsurance is the monthly premium for an insurer other than RAMA (e.g. M.I RADIANT).
 * deductions is the total of every other deduction taken from net pay (advances, Ubumwe, …).
 */
final class LineInput
{
    public function __construct(
        public string $scheme,
        public int $basic = 0,
        public ?string $topupRate = null,
        public ?int $housingDivisor = null,
        public ?int $transportDivisor = null,
        public int $responsibility = 0,
        public int $arrears = 0,
        public ?string $quantity = null,
        public ?int $unitRate = null,
        public ?int $enteredGross = null,
        public ?int $targetNet = null,
        public ?string $taxMethod = null,
        public bool $rama = false,
        public int $otherInsurance = 0,
        public int $deductions = 0,
    ) {
    }
}

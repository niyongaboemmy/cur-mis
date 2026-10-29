<?php

declare(strict_types=1);

namespace App\Payroll\PartTime;

use InvalidArgumentException;

/**
 * Part-time rules that do not need the database (spec §3.3 PART_TIME).
 *
 * Workflow: REQUESTED → DVCA_APPROVED → INVITED → CONTRACTED → SENT_TO_PAYROLL.
 * Each step is recorded with who did it and when. Hours are credits × 4 unless overridden with a reason.
 */
final class PartTimeRules
{
    public const REQUESTED        = 'REQUESTED';
    public const DVCA_APPROVED    = 'DVCA_APPROVED';
    public const INVITED          = 'INVITED';
    public const CONTRACTED       = 'CONTRACTED';
    public const SENT_TO_PAYROLL  = 'SENT_TO_PAYROLL';

    public const PROGRAMMES = ['Day', 'Weekend', 'Holiday'];
    public const ZONES      = ['KIGALI', 'OTHER'];

    /** Hours paid per credit when no override is given. */
    public const HOURS_PER_CREDIT = 4;

    /** @var array<string, string> from => to */
    private const NEXT = [
        self::REQUESTED     => self::DVCA_APPROVED,
        self::DVCA_APPROVED => self::INVITED,
        self::INVITED       => self::CONTRACTED,
        self::CONTRACTED    => self::SENT_TO_PAYROLL,
    ];

    public static function nextStatus(string $status): ?string
    {
        return self::NEXT[$status] ?? null;
    }

    /** Hours can be overridden only before the assignment reaches payroll. */
    public static function hoursCanChange(string $status): bool
    {
        return $status !== self::SENT_TO_PAYROLL;
    }

    public static function defaultHours(int $credits): string
    {
        if ($credits < 0) {
            throw new InvalidArgumentException('Credits cannot be negative.');
        }
        return (string) ($credits * self::HOURS_PER_CREDIT);
    }

    /**
     * Accommodation and transport owed for an assignment. These are paid as a separate,
     * non-taxable reimbursement, not through the payroll run (spec §8 Q5, default).
     *
     * @param array{accommodation_per_night: int, transport_kigali: int, transport_other: int} $rates
     * @return array{accommodation: int, transport: int, total: int}
     */
    public static function allowances(int $nights, bool $fromOutsideHuye, string $zone, int $trips, array $rates): array
    {
        if ($nights < 0 || $trips < 0) {
            throw new InvalidArgumentException('Nights and trips cannot be negative.');
        }
        if (!in_array($zone, self::ZONES, true) && $trips > 0) {
            throw new InvalidArgumentException("Transport zone must be KIGALI or OTHER, got {$zone}.");
        }

        $accommodation = $fromOutsideHuye ? $nights * (int) $rates['accommodation_per_night'] : 0;
        $perTrip = $zone === 'KIGALI' ? (int) $rates['transport_kigali'] : (int) $rates['transport_other'];
        $transport = $trips * $perTrip;

        return ['accommodation' => $accommodation, 'transport' => $transport, 'total' => $accommodation + $transport];
    }
}

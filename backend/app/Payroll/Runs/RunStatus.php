<?php

declare(strict_types=1);

namespace App\Payroll\Runs;

use DomainException;

/**
 * Payroll run states and the moves between them (spec §7 item 1).
 *
 *   DRAFT ──calculate──▶ CALCULATED ──verify──▶ VERIFIED ──approve──▶ APPROVED ──pay──▶ PAID
 *     ▲                     │  ▲                   │                    │
 *     └───── edit ──────────┘  └──── return ───────┘                    └─ reopen ─▶ CALCULATED
 *
 * Only DRAFT and CALCULATED runs can be edited or recalculated. PAID is final.
 */
final class RunStatus
{
    public const DRAFT      = 'DRAFT';
    public const CALCULATED = 'CALCULATED';
    public const VERIFIED   = 'VERIFIED';
    public const APPROVED   = 'APPROVED';
    public const PAID       = 'PAID';

    /** @var array<string, list<string>> */
    private const MOVES = [
        self::DRAFT      => [self::CALCULATED],
        self::CALCULATED => [self::DRAFT, self::VERIFIED],
        self::VERIFIED   => [self::CALCULATED, self::APPROVED],
        self::APPROVED   => [self::CALCULATED, self::PAID],
        self::PAID       => [],
    ];

    public static function isKnown(string $status): bool
    {
        return array_key_exists($status, self::MOVES);
    }

    /** Lines can be added, changed or removed, and the run recalculated, only in these states. */
    public static function isEditable(string $status): bool
    {
        return $status === self::DRAFT || $status === self::CALCULATED;
    }

    public static function canMove(string $from, string $to): bool
    {
        return in_array($to, self::MOVES[$from] ?? [], true);
    }

    /** @throws DomainException if the move is not allowed */
    public static function assertMove(string $from, string $to): void
    {
        if (!self::canMove($from, $to)) {
            throw new RunTransitionException("A payroll run cannot move from {$from} to {$to}.");
        }
    }
}

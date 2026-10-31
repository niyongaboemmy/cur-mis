<?php

declare(strict_types=1);

namespace App\Payroll\Settings;

use InvalidArgumentException;

/**
 * Picks the settings version that applies to a payroll period.
 *
 * Each version is ['effective_from' => 'YYYY-MM-DD', 'settings' => [...]]. A period uses the
 * latest version whose effective_from is on or before the period date. The result is a copy,
 * so a run that stores it as a snapshot is unaffected when newer versions are added later.
 */
final class EffectiveSettings
{
    /**
     * @param list<array{effective_from: string, settings: array<string, mixed>}> $versions
     * @return array<string, mixed>
     */
    public static function forDate(array $versions, string $periodDate): array
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $periodDate)) {
            throw new InvalidArgumentException("Period date must be YYYY-MM-DD, got {$periodDate}.");
        }

        $best = null;
        foreach ($versions as $version) {
            $from = (string) $version['effective_from'];
            if ($from <= $periodDate && ($best === null || $from > $best['effective_from'])) {
                $best = $version;
            }
        }

        if ($best === null) {
            throw new InvalidArgumentException("No payroll settings are in effect on {$periodDate}.");
        }

        // Round-trip through serialize so the caller gets a fully independent copy
        return unserialize(serialize($best['settings']));
    }
}

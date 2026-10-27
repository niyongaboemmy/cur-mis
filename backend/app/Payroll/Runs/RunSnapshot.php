<?php

declare(strict_types=1);

namespace App\Payroll\Runs;

use InvalidArgumentException;
use JsonException;

/**
 * Everything a payroll run needs to calculate, copied when the run is created.
 *
 * Holds the settings version valid on the period date (rates, bands, schemes), the responsibility
 * amounts and the hourly rates in force then. Later changes to any of them never touch an existing
 * run, so a PAID run reproduces the figures it was paid on (spec §3, test 12).
 */
final class RunSnapshot
{
    /**
     * @param array<string, mixed>  $settings              engine settings (includes 'schemes')
     * @param array<string, int>    $responsibilityAmounts role code => monthly RWF
     * @param array<string, int>    $hourlyRates           grade code => RWF per hour
     */
    public static function build(array $settings, array $responsibilityAmounts, array $hourlyRates): string
    {
        return json_encode([
            'settings'               => $settings,
            'responsibility_amounts' => $responsibilityAmounts,
            'hourly_rates'           => $hourlyRates,
        ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
    }

    /**
     * @return array{settings: array<string, mixed>, responsibility_amounts: array<string, int>, hourly_rates: array<string, int>}
     * @throws JsonException|InvalidArgumentException
     */
    public static function read(string $json): array
    {
        $data = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
        if (!isset($data['settings'], $data['responsibility_amounts'], $data['hourly_rates'])) {
            throw new InvalidArgumentException('Run snapshot is incomplete.');
        }
        return $data;
    }
}

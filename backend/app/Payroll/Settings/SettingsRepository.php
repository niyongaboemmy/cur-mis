<?php

declare(strict_types=1);

namespace App\Payroll\Settings;

use Core\Database;
use JsonException;

/**
 * Loads payroll settings from the database and turns them into the array the engine reads.
 *
 * A settings version is one row of payroll_settings (JSON: rates, divisors, PAYE bands, options).
 * Pay schemes are structure rather than versioned amounts, so the scheme rows from pay_schemes
 * are merged into every version when it is loaded.
 */
final class SettingsRepository
{
    public function __construct(private Database $db)
    {
    }

    /**
     * Every settings version, oldest first, in the shape EffectiveSettings::forDate() expects.
     *
     * @return list<array{effective_from: string, settings: array<string, mixed>}>
     * @throws JsonException if a stored version is not valid JSON
     */
    public function versions(): array
    {
        $schemeRows = $this->db->fetchAll(
            'SELECT `code`, `earnings_mode`, `default_tax_method`, `applies_rssb`, `applies_hazard`, `applies_rama`, `applies_cbhi`
               FROM `pay_schemes`
              WHERE `is_active` = 1'
        );
        $rows = $this->db->fetchAll(
            'SELECT `effective_from`, `settings_json` FROM `payroll_settings` ORDER BY `effective_from`'
        );

        $versions = [];
        foreach ($rows as $row) {
            $versions[] = [
                'effective_from' => (string) $row['effective_from'],
                'settings'       => self::assemble((string) $row['settings_json'], $schemeRows),
            ];
        }
        return $versions;
    }

    /** @return array<string, mixed> Settings in effect on the period date, ready for PayrollEngine. */
    public function forDate(string $periodDate): array
    {
        return \App\Payroll\Settings\EffectiveSettings::forDate($this->versions(), $periodDate);
    }

    /**
     * Combines one stored settings JSON document with the scheme rows into engine settings.
     *
     * @param list<array<string, mixed>> $schemeRows rows from pay_schemes (database column names)
     * @return array<string, mixed>
     * @throws JsonException if the JSON is invalid
     */
    public static function assemble(string $settingsJson, array $schemeRows): array
    {
        $settings = json_decode($settingsJson, true, 512, JSON_THROW_ON_ERROR);

        $schemes = [];
        foreach ($schemeRows as $row) {
            $schemes[(string) $row['code']] = [
                'tax_method' => (string) $row['default_tax_method'],
                'earnings'   => (string) $row['earnings_mode'],
                'rssb'       => (bool) (int) $row['applies_rssb'],
                'hazard'     => (bool) (int) $row['applies_hazard'],
                'rama'       => (bool) (int) $row['applies_rama'],
                'cbhi'       => (bool) (int) $row['applies_cbhi'],
            ];
        }

        $settings['schemes'] = $schemes;
        return $settings;
    }
}

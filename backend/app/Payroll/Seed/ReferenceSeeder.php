<?php

declare(strict_types=1);

namespace App\Payroll\Seed;

use App\Payroll\Engine\PayrollEngine;
use App\Payroll\Settings\SettingsRepository;
use Core\Database;
use InvalidArgumentException;
use JsonException;

/**
 * Plans and loads the payroll reference data (pay schemes, settings version, responsibility
 * roles, hourly rates, banks).
 *
 * plan() is pure: it builds every row and proves the settings work with the engine before
 * anything is written. apply() inserts with INSERT IGNORE, so rows HR has already edited are
 * never overwritten and re-running the seed is safe.
 */
final class ReferenceSeeder
{
    /**
     * @param array<string, mixed> $settings  the engine settings document (settings_2026.php)
     * @param array<string, mixed> $reference the reference lists (reference_2026.php)
     * @return array{
     *     schemes: list<array<string, mixed>>,
     *     settings: array<string, mixed>,
     *     roles: list<array<string, mixed>>,
     *     hourly_rates: list<array<string, mixed>>,
     *     banks: list<array<string, mixed>>
     * }
     * @throws InvalidArgumentException if the inputs are incomplete or inconsistent
     * @throws JsonException
     */
    public static function plan(array $settings, array $reference): array
    {
        $effectiveFrom = (string) ($reference['effective_from'] ?? '');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $effectiveFrom)) {
            throw new InvalidArgumentException('reference effective_from must be YYYY-MM-DD.');
        }

        $schemes = [];
        $sortOrder = 0;
        foreach ($settings['schemes'] ?? [] as $code => $scheme) {
            $name = $reference['scheme_names'][$code] ?? null;
            if ($name === null) {
                throw new InvalidArgumentException("No display name for pay scheme {$code}.");
            }
            $schemes[] = [
                'code'               => (string) $code,
                'name'               => (string) $name,
                'earnings_mode'      => (string) $scheme['earnings'],
                'default_tax_method' => (string) $scheme['tax_method'],
                'applies_rssb'       => $scheme['rssb'] ? 1 : 0,
                'applies_hazard'     => $scheme['hazard'] ? 1 : 0,
                'applies_rama'       => $scheme['rama'] ? 1 : 0,
                'applies_cbhi'       => $scheme['cbhi'] ? 1 : 0,
                'is_active'          => 1,
                'sort_order'         => ++$sortOrder,
            ];
        }

        // Settings are stored without the schemes; schemes live in pay_schemes.
        $documentSettings = $settings;
        unset($documentSettings['schemes']);
        $json = json_encode($documentSettings, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);

        // Prove the stored form loads and calculates before writing anything.
        $engineSettings = SettingsRepository::assemble($json, self::schemeRowsForCheck($schemes));
        new PayrollEngine($engineSettings);

        $roles = [];
        $roleCodes = [];
        foreach ($reference['responsibility_roles'] ?? [] as $role) {
            if (isset($roleCodes[$role['code']])) {
                throw new InvalidArgumentException("Duplicate responsibility role {$role['code']}.");
            }
            $roleCodes[$role['code']] = true;
            $roles[] = [
                'role_code'      => (string) $role['code'],
                'role_name'      => (string) $role['name'],
                'monthly_amount' => (string) $role['amount'],
                'effective_from' => $effectiveFrom,
            ];
        }

        $hourly = [];
        $gradeCodes = [];
        foreach ($reference['hourly_rates'] ?? [] as $grade) {
            if (isset($gradeCodes[$grade['code']])) {
                throw new InvalidArgumentException("Duplicate hourly grade {$grade['code']}.");
            }
            $gradeCodes[$grade['code']] = true;
            $hourly[] = [
                'grade_code'     => (string) $grade['code'],
                'grade_name'     => (string) $grade['name'],
                'rate_per_hour'  => (string) $grade['rate'],
                'effective_from' => $effectiveFrom,
            ];
        }

        $banks = [];
        foreach ($reference['banks'] ?? [] as $bank) {
            $banks[] = [
                'name'       => (string) $bank['name'],
                'short_code' => $bank['short_code'] ?? null,
                'is_active'  => 1,
            ];
        }

        return [
            'schemes'      => $schemes,
            'settings'     => [
                'effective_from' => $effectiveFrom,
                'settings_json'  => $json,
                'note'           => 'Seeded from settings_2026.php',
            ],
            'roles'        => $roles,
            'hourly_rates' => $hourly,
            'banks'        => $banks,
        ];
    }

    /**
     * Writes a plan with INSERT IGNORE. Returns how many rows each table actually received.
     *
     * @param array<string, mixed> $plan output of plan()
     * @return array<string, int>
     */
    public static function apply(Database $db, array $plan): array
    {
        $counts = [];

        $counts['pay_schemes'] = self::insertIgnore($db, 'pay_schemes', $plan['schemes']);
        $counts['payroll_settings'] = self::insertIgnore($db, 'payroll_settings', [$plan['settings']]);
        $counts['responsibility_roles'] = self::insertIgnore($db, 'responsibility_roles', $plan['roles']);
        $counts['hourly_rates'] = self::insertIgnore($db, 'hourly_rates', $plan['hourly_rates']);
        $counts['banks'] = self::insertIgnore($db, 'banks', $plan['banks']);

        return $counts;
    }

    /**
     * @param list<array<string, mixed>> $rows
     */
    private static function insertIgnore(Database $db, string $table, array $rows): int
    {
        $inserted = 0;
        foreach ($rows as $row) {
            $columns = array_keys($row);
            $placeholders = implode(', ', array_fill(0, count($columns), '?'));
            $sql = sprintf(
                'INSERT IGNORE INTO `%s` (%s) VALUES (%s)',
                $table,
                '`' . implode('`, `', $columns) . '`',
                $placeholders
            );
            $inserted += $db->execute($sql, array_values($row));
        }
        return $inserted;
    }

    /**
     * Scheme rows in the database shape, used only to check the plan against the engine.
     *
     * @param list<array<string, mixed>> $schemes
     * @return list<array<string, mixed>>
     */
    private static function schemeRowsForCheck(array $schemes): array
    {
        return array_map(static fn (array $s): array => [
            'code'               => $s['code'],
            'earnings_mode'      => $s['earnings_mode'],
            'default_tax_method' => $s['default_tax_method'],
            'applies_rssb'       => $s['applies_rssb'],
            'applies_hazard'     => $s['applies_hazard'],
            'applies_rama'       => $s['applies_rama'],
            'applies_cbhi'       => $s['applies_cbhi'],
        ], $schemes);
    }
}

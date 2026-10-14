<?php

declare(strict_types=1);

namespace App\Services;

use Core\Database;

/**
 * Payroll numbers that HR can change: contribution rates, PAYE bands and
 * responsibility allowance amounts.
 *
 * The values live in the payroll_config table (key/value). The formulas that use
 * them stay in PayrollCalculator. When a key is missing from the table, the
 * defaults below are used, so the calculator never runs without rates.
 *
 * Rates are stored as percentages (6 means 6%), the same as the Payroll Settings
 * page. Calculator inputs convert them to fractions.
 */
final class PayrollSettings
{
    /**
     * Calculator rate name => [config key, default percentage].
     * The names are the ones used by PayrollCalculator and by the UI.
     */
    public const RATE_SETTINGS = [
        'pension_employee'      => ['rssb_employee_rate',         6.0],   // step 10 – base: total gross
        'pension_employer'      => ['rssb_employer_rate',         6.0],   // step 12 – base: total gross
        'occupational_employer' => ['occupational_employer_rate', 2.0],   // step 11 – base: maternity base
        'maternity_employee'    => ['maternity_employee_rate',    0.3],   // step 13 – base: maternity base
        'maternity_employer'    => ['maternity_employer_rate',    0.3],   // step 14 – base: maternity base
        'rama_employee'         => ['rama_employee_rate',         7.5],   // step 16 – base: maternity base
        'rama_employer'         => ['rama_employer_rate',         7.5],   // step 17 – base: maternity base
        'cbhi_employee'         => ['cbhi_employee_rate',         0.5],   // step 19 – base: net salary
        'cbhi_employer'         => ['cbhi_employer_rate',         0.5],   // employer share – base: total gross
    ];

    /**
     * Progressive PAYE bands (step 8), lowest first. Upper limits are amounts; the
     * last band has no upper limit. Rates are percentages.
     */
    public const PAYE_BAND_SETTINGS = [
        1 => ['upper' => 'paye_band_1_upper', 'rate' => 'paye_band_1_rate', 'default_upper' => 60000,  'default_rate' => 0.0],
        2 => ['upper' => 'paye_band_2_upper', 'rate' => 'paye_band_2_rate', 'default_upper' => 100000, 'default_rate' => 10.0],
        3 => ['upper' => 'paye_band_3_upper', 'rate' => 'paye_band_3_rate', 'default_upper' => 200000, 'default_rate' => 20.0],
        4 => ['upper' => null,                'rate' => 'paye_band_4_rate', 'default_upper' => null,   'default_rate' => 30.0],
    ];

    /** Responsibility role code => default monthly amount (step 5). */
    public const ROLE_DEFAULTS = [
        'academic_secretary'          => 120000,
        'dean'                        => 150000,
        'registrar'                   => 150000,
        'director_research'           => 150000,
        'cpa_coordinator'             => 150000,
        'international_student_coord' => 150000,
        'planning_cooperation'        => 150000,
        'internal_auditor'            => 150000,
        'sponsored_student_coord'     => 150000,
        'head_of_unit'                => 150000,
        'head_of_department'          => 100000,
    ];

    /** Config key prefix for responsibility amounts, e.g. resp_dean. */
    public const ROLE_KEY_PREFIX = 'resp_';

    /** Every key HR can read and change. */
    public static function keys(): array
    {
        $keys = [];
        foreach (self::RATE_SETTINGS as [$key]) {
            $keys[] = $key;
        }
        foreach (self::PAYE_BAND_SETTINGS as $band) {
            if ($band['upper'] !== null) {
                $keys[] = $band['upper'];
            }
            $keys[] = $band['rate'];
        }
        foreach (array_keys(self::ROLE_DEFAULTS) as $code) {
            $keys[] = self::ROLE_KEY_PREFIX . $code;
        }
        return $keys;
    }

    /** Default value for every key, keyed by config key. */
    public static function defaults(): array
    {
        $values = [];
        foreach (self::RATE_SETTINGS as [$key, $default]) {
            $values[$key] = $default;
        }
        foreach (self::PAYE_BAND_SETTINGS as $band) {
            if ($band['upper'] !== null) {
                $values[$band['upper']] = (float) $band['default_upper'];
            }
            $values[$band['rate']] = $band['default_rate'];
        }
        foreach (self::ROLE_DEFAULTS as $code => $amount) {
            $values[self::ROLE_KEY_PREFIX . $code] = (float) $amount;
        }
        return $values;
    }

    /**
     * Saved values from payroll_config, falling back to the defaults for any key
     * that has not been stored yet.
     *
     * @return array<string, float>
     */
    public static function load(Database $db): array
    {
        $values = self::defaults();
        $rows = $db->fetchAll("SELECT config_key, config_value FROM payroll_config") ?: [];
        foreach ($rows as $row) {
            $key = (string) $row['config_key'];
            if (array_key_exists($key, $values) && is_numeric($row['config_value'])) {
                $values[$key] = (float) $row['config_value'];
            }
        }
        return $values;
    }

    /** Calculator inputs built from the defaults, for callers that have no database. */
    public static function calculatorDefaults(): array
    {
        return self::calculatorInputs(self::defaults());
    }

    /**
     * Converts stored values into the shape PayrollCalculator reads:
     *   rates                – fractions keyed by rate name
     *   paye_bands           – [['upper' => float|null, 'rate' => fraction], ...]
     *   responsibility_amounts – amount keyed by role code
     *
     * @param array<string, float> $values Output of load() or defaults()
     */
    public static function calculatorInputs(array $values): array
    {
        $rates = [];
        foreach (self::RATE_SETTINGS as $name => [$key, $default]) {
            $rates[$name] = round(self::num($values, $key, $default) / 100, 8);
        }

        $bands = [];
        foreach (self::PAYE_BAND_SETTINGS as $band) {
            $bands[] = [
                'upper' => $band['upper'] === null
                    ? null
                    : self::num($values, $band['upper'], (float) $band['default_upper']),
                'rate'  => round(self::num($values, $band['rate'], (float) $band['default_rate']) / 100, 8),
            ];
        }

        $amounts = [];
        foreach (self::ROLE_DEFAULTS as $code => $default) {
            $amounts[$code] = self::num($values, self::ROLE_KEY_PREFIX . $code, (float) $default);
        }

        return [
            'rates'                  => $rates,
            'paye_bands'             => $bands,
            'responsibility_amounts' => $amounts,
        ];
    }

    /**
     * Checks values before they are saved. Returns field => message; empty when valid.
     *
     * @param array<string, float> $merged Full set of values after the update
     */
    public static function validate(array $merged): array
    {
        $errors = [];

        foreach ($merged as $key => $value) {
            if ($value < 0) {
                $errors[$key] = 'Must be zero or more.';
            }
            if ((str_ends_with($key, '_rate')) && $value > 100) {
                $errors[$key] = 'A rate cannot be more than 100%.';
            }
        }

        // Upper limits of the PAYE bands must rise: band 1 < band 2 < band 3.
        $previous = 0.0;
        foreach (self::PAYE_BAND_SETTINGS as $n => $band) {
            if ($band['upper'] === null) {
                break;
            }
            $upper = $merged[$band['upper']] ?? 0.0;
            if ($upper <= $previous) {
                $errors[$band['upper']] = "PAYE band {$n} limit must be higher than the band below it.";
            }
            $previous = $upper;
        }

        return $errors;
    }

    private static function num(array $values, string $key, float $default): float
    {
        return isset($values[$key]) && is_numeric($values[$key]) ? (float) $values[$key] : $default;
    }
}

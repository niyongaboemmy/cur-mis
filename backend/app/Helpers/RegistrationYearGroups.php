<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Groups students by the two-digit year code that follows "CUR" in their
 * registration number (1CUR21AK013541 -> code 21).
 *
 * YEAR_CODES lists, for each academic year, the registration codes that belong
 * to it. A student appears on every academic-year sheet whose list contains
 * their code, so one student can appear on several sheets.
 *
 * The entry academic year of a student is the year of their own code:
 * 1CUR21... -> 2021-2022. The stored `acc_year` column is not used.
 */
final class RegistrationYearGroups
{
    /**
     * Academic year => registration year codes that belong to it.
     * 2025-2026 and 2026-2027 are inferred from the 3-code window used from
     * 2023-2024 onward; confirm them against the registry table.
     */
    public const YEAR_CODES = [
        '2010-2011' => [10],
        '2011-2012' => [10, 11],
        '2012-2013' => [10, 11, 12],
        '2013-2014' => [10, 11, 12, 13, 14],
        '2014-2015' => [10, 11, 12, 13, 14, 15],
        '2015-2016' => [13, 14, 15],
        '2016-2017' => [14, 15, 16],
        '2017-2018' => [15, 16, 17],
        '2018-2019' => [16, 17, 18],
        '2019-2020' => [17, 18, 19],
        '2020-2021' => [18, 19, 20],
        '2021-2022' => [18, 19, 20, 21],
        '2022-2023' => [19, 20, 21, 22],
        '2023-2024' => [21, 22, 23],
        '2024-2025' => [22, 23, 24],
        '2025-2026' => [23, 24, 25],
        '2026-2027' => [24, 25, 26],
    ];

    public const REASON_MISSING  = 'Missing registration number';
    public const REASON_FORMAT   = 'Unrecognised registration number format';
    public const REASON_UNMAPPED = 'Year code has no academic-year mapping';

    /**
     * Level digit (1 or 2), CUR, two-digit year code, two initials, then 5–6
     * digits. Input is upper-cased and stripped of whitespace before matching,
     * so lowercase letters and stray spaces are accepted.
     */
    private const PATTERN = '/^[12]CUR(\d{2})[A-Z]{2}\d{5,6}$/';

    /**
     * @return array{code: ?int, reason: ?string}
     *         `reason` is set exactly when the record is unmapped, and `code` is
     *         null when the number could not be read at all.
     */
    public static function classify(?string $regNumber): array
    {
        $clean = strtoupper((string)preg_replace('/\s+/', '', (string)$regNumber));
        if ($clean === '') {
            return ['code' => null, 'reason' => self::REASON_MISSING];
        }
        if (preg_match(self::PATTERN, $clean, $m) !== 1) {
            return ['code' => null, 'reason' => self::REASON_FORMAT];
        }

        // (int) turns "10" into 10 and "05" into 5. A code outside the table is
        // reported rather than guessed at.
        $code = (int)$m[1];
        if (!in_array($code, self::knownCodes(), true)) {
            return ['code' => $code, 'reason' => self::REASON_UNMAPPED];
        }
        return ['code' => $code, 'reason' => null];
    }

    /**
     * Every registration code that appears in YEAR_CODES, ascending.
     *
     * @return list<int>
     */
    public static function knownCodes(): array
    {
        $codes = [];
        foreach (self::YEAR_CODES as $list) {
            foreach ($list as $code) {
                $codes[$code] = true;
            }
        }
        $keys = array_keys($codes);
        sort($keys);
        return $keys;
    }

    /**
     * The academic-year sheets that include a code, in chronological order.
     *
     * @return list<string>
     */
    public static function yearsForCode(int $code): array
    {
        $years = [];
        foreach (self::YEAR_CODES as $year => $codes) {
            if (in_array($code, $codes, true)) {
                $years[] = (string)$year;
            }
        }
        return $years;
    }

    /** Entry academic year of a code: 21 -> 2021-2022. */
    public static function entryYear(int $code): string
    {
        return (2000 + $code) . '-' . (2001 + $code);
    }
}

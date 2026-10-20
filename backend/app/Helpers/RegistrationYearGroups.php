<?php

declare(strict_types=1);

namespace App\Helpers;

/**
 * Groups students by the two-digit year code that follows "CUR" in their
 * registration number, and maps each code to the academic-year label used by
 * the "Export by Academic Year" workbook.
 *
 *   1CUR26AK013541  -> code 26 -> 2026-2027
 *   2CUR12AK013090  -> code 12 -> 2012-2013   (the leading 1/2 is not used)
 *
 * This is a grouping by registration year, not a claim that a student was
 * enrolled or graduated in that academic year. The stored `acc_year` column is
 * never used for grouping.
 */
final class RegistrationYearGroups
{
    /** Registration year code => academic-year label (also the worksheet name). */
    public const YEAR_LABELS = [
        10 => '2010-2011',
        11 => '2011-2012',
        12 => '2012-2013',
        13 => '2013-2014',
        14 => '2014-2015',
        15 => '2015-2016',
        16 => '2016-2017',
        17 => '2017-2018',
        18 => '2018-2019',
        19 => '2019-2020',
        20 => '2020-2021',
        21 => '2021-2022',
        22 => '2022-2023',
        23 => '2023-2024',
        24 => '2024-2025',
        25 => '2025-2026',
        26 => '2026-2027',
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
     * @return array{code: ?int, label: ?string, reason: ?string}
     *         `label` is null exactly when `reason` is set (an unmapped record).
     */
    public static function classify(?string $regNumber): array
    {
        $clean = strtoupper((string)preg_replace('/\s+/', '', (string)$regNumber));
        if ($clean === '') {
            return ['code' => null, 'label' => null, 'reason' => self::REASON_MISSING];
        }
        if (preg_match(self::PATTERN, $clean, $m) !== 1) {
            return ['code' => null, 'label' => null, 'reason' => self::REASON_FORMAT];
        }

        // (int) makes "10" match the integer keys above; "05" becomes 5 and is
        // not in the map, so it is reported rather than guessed at.
        $code = (int)$m[1];
        if (!isset(self::YEAR_LABELS[$code])) {
            return ['code' => $code, 'label' => null, 'reason' => self::REASON_UNMAPPED];
        }
        return ['code' => $code, 'label' => self::YEAR_LABELS[$code], 'reason' => null];
    }
}

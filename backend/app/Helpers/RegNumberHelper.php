<?php

declare(strict_types=1);

namespace App\Helpers;

use InvalidArgumentException;

/**
 * Splits a CUR student registration number into its parts.
 *
 * Format (example 1CUR20AK05905):
 *   1      program level          "1" = Undergraduate
 *   CUR    institution code       "CUR" = Catholic University of Rwanda
 *   20     two-digit start year   "20" = 2020
 *   AK     student initials       "AK" = Alex Kagame
 *   05905  student number         kept as a string so leading zeros survive
 *
 * End year: start year + 4 for Health Sciences, + 3 for everything else.
 * The number does not say which faculty a student is in, so the caller
 * passes that in.
 *
 * Examples:
 *   RegNumberHelper::parse('1CUR20AK05905');        // startYear 2020, endYear 2023
 *   RegNumberHelper::parse('1CUR20AK05905', true);  // startYear 2020, endYear 2024
 *   RegNumberHelper::parse('bad-id');               // throws InvalidArgumentException
 */
final class RegNumberHelper
{
    /**
     * Five digits per the documented format. Six digits also accepted: live
     * registration numbers such as 1CUR26AK013408 use six.
     */
    private const PATTERN = '/^(\d)([A-Z]{3})(\d{2})([A-Z]{2})(\d{5,6})$/i';

    /** Level code → name. Add new codes here. */
    public const LEVEL_NAMES = [
        '1' => 'Undergraduate',
    ];

    /** Institution code → name. Add new codes here. */
    public const INSTITUTION_NAMES = [
        'CUR' => 'Catholic University of Rwanda',
    ];

    private const UNKNOWN = 'Unknown';

    /**
     * Parse a registration number.
     *
     * @return array{regNumber:string,level:string,institution:string,initials:string,studentNumber:string,startYear:int,endYear:int,programDuration:int}
     * @throws InvalidArgumentException when the value does not match the format.
     */
    public static function parse(string $regNumber, bool $isHealthSciences = false): array
    {
        $regNumber = strtoupper(trim($regNumber));

        if (!preg_match(self::PATTERN, $regNumber, $m)) {
            throw new InvalidArgumentException("Invalid registration number: \"{$regNumber}\"");
        }

        [, $levelCode, $institutionCode, $yearDigits, $initials, $studentNumber] = $m;

        $startYear       = 2000 + (int)$yearDigits;
        $programDuration = $isHealthSciences ? 4 : 3;

        return [
            'regNumber'       => $regNumber,
            'level'           => self::LEVEL_NAMES[$levelCode] ?? self::UNKNOWN,
            'institution'     => self::INSTITUTION_NAMES[$institutionCode] ?? self::UNKNOWN,
            'initials'        => $initials,
            'studentNumber'   => $studentNumber,
            'startYear'       => $startYear,
            'endYear'         => $startYear + $programDuration,
            'programDuration' => $programDuration,
        ];
    }

    /**
     * Same as parse() but returns null instead of throwing. Use for list
     * rows, where one legacy or malformed number must not break the page.
     *
     * @return array|null
     */
    public static function tryParse(?string $regNumber, bool $isHealthSciences = false): ?array
    {
        if ($regNumber === null || trim($regNumber) === '') {
            return null;
        }
        try {
            return self::parse($regNumber, $isHealthSciences);
        } catch (InvalidArgumentException) {
            return null;
        }
    }
}

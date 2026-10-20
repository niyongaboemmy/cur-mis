<?php

declare(strict_types=1);

namespace Tests\Registration;

use App\Helpers\RegistrationYearGroups;
use PHPUnit\Framework\TestCase;

final class RegistrationYearGroupsTest extends TestCase
{
    /** @return array<string, array{0: string, 1: int}> */
    public static function mappedNumbers(): array
    {
        return [
            'undergraduate 2010 intake' => ['1CUR10AK013543', 10],
            'undergraduate 2012 intake' => ['1CUR12AK013542', 12],
            'level 2 prefix is ignored' => ['2CUR12AK013090', 12],
            'two-digit year 25'         => ['1CUR25AK013000', 25],
            'latest mapped year'        => ['1CUR26AK013543', 26],
            'lowercase is accepted'     => ['1cur26ak013543', 26],
            'surrounding spaces'        => ['  2cur12ak013090  ', 12],
            'five-digit serial'         => ['1CUR10AK05905', 10],
        ];
    }

    /** @dataProvider mappedNumbers */
    public function testMappedNumbersReadTheRegistrationCode(string $regNumber, int $expectedCode): void
    {
        $result = RegistrationYearGroups::classify($regNumber);

        self::assertSame($expectedCode, $result['code']);
        self::assertNull($result['reason']);
    }

    /** @return array<string, array{0: ?string, 1: string}> */
    public static function unmappedNumbers(): array
    {
        return [
            'null'                => [null, RegistrationYearGroups::REASON_MISSING],
            'blank'               => ['   ', RegistrationYearGroups::REASON_MISSING],
            'generated number'    => ['CUR/2026/00001', RegistrationYearGroups::REASON_FORMAT],
            'unknown level digit' => ['3CUR26AK013543', RegistrationYearGroups::REASON_FORMAT],
            'too short'           => ['1CUR26AK01', RegistrationYearGroups::REASON_FORMAT],
            'trailing junk'       => ['1CUR26AK013543X', RegistrationYearGroups::REASON_FORMAT],
            'seven-digit serial'  => ['1CUR26AK0135431', RegistrationYearGroups::REASON_FORMAT],
            'code before 10'      => ['1CUR09AK013001', RegistrationYearGroups::REASON_UNMAPPED],
            'code after 26'       => ['1CUR27AK013001', RegistrationYearGroups::REASON_UNMAPPED],
            'code zero'           => ['1CUR00AK013001', RegistrationYearGroups::REASON_UNMAPPED],
        ];
    }

    /** @dataProvider unmappedNumbers */
    public function testUnmappableNumbersAreReportedNotGuessed(?string $regNumber, string $expectedReason): void
    {
        $result = RegistrationYearGroups::classify($regNumber);

        self::assertSame($expectedReason, $result['reason']);
    }

    public function testEveryCodeFromTenToTwentySixIsKnown(): void
    {
        self::assertSame(range(10, 26), RegistrationYearGroups::knownCodes());
    }

    public function testAStudentAppearsOnEveryYearWhoseListIncludesTheirCode(): void
    {
        // From the registry table: code 12 is on 2012-2013, 2013-2014 and 2014-2015.
        self::assertSame(
            ['2012-2013', '2013-2014', '2014-2015'],
            RegistrationYearGroups::yearsForCode(12)
        );
        // Code 21 is on 2021-2022, 2022-2023 and 2023-2024.
        self::assertSame(
            ['2021-2022', '2022-2023', '2023-2024'],
            RegistrationYearGroups::yearsForCode(21)
        );
        self::assertSame(['2026-2027'], RegistrationYearGroups::yearsForCode(26));
    }

    public function testEntryYearIsTheYearOfTheCode(): void
    {
        self::assertSame('2010-2011', RegistrationYearGroups::entryYear(10));
        self::assertSame('2021-2022', RegistrationYearGroups::entryYear(21));
        self::assertSame('2026-2027', RegistrationYearGroups::entryYear(26));
    }

    public function testTableMatchesTheRegistryPicture(): void
    {
        $years = RegistrationYearGroups::YEAR_CODES;

        self::assertSame([10], $years['2010-2011']);
        self::assertSame([10, 11, 12, 13, 14], $years['2013-2014']);
        self::assertSame([13, 14, 15], $years['2015-2016']);
        self::assertSame([18, 19, 20, 21], $years['2021-2022']);
        self::assertSame([19, 20, 21, 22], $years['2022-2023']);
        self::assertSame([21, 22, 23], $years['2023-2024']);
        self::assertSame([22, 23, 24], $years['2024-2025']);
        self::assertCount(17, $years);
    }
}

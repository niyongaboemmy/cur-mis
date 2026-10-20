<?php

declare(strict_types=1);

namespace Tests\Registration;

use App\Helpers\RegistrationYearGroups;
use PHPUnit\Framework\TestCase;

final class RegistrationYearGroupsTest extends TestCase
{
    /** @return array<string, array{0: string, 1: string}> */
    public static function mappedNumbers(): array
    {
        return [
            'undergraduate 2010 intake' => ['1CUR10AK013543', '2010-2011'],
            'undergraduate 2012 intake' => ['1CUR12AK013542', '2012-2013'],
            'level 2 prefix is ignored' => ['2CUR12AK013090', '2012-2013'],
            'two-digit year 25'         => ['1CUR25AK013000', '2025-2026'],
            'latest mapped year'        => ['1CUR26AK013543', '2026-2027'],
            'lowercase is accepted'     => ['1cur26ak013543', '2026-2027'],
            'surrounding spaces'        => ['  2cur12ak013090  ', '2012-2013'],
            'five-digit serial'         => ['1CUR10AK05905', '2010-2011'],
        ];
    }

    /** @dataProvider mappedNumbers */
    public function testMappedNumbersGroupByRegistrationYear(string $regNumber, string $expectedLabel): void
    {
        $result = RegistrationYearGroups::classify($regNumber);

        self::assertSame($expectedLabel, $result['label']);
        self::assertNull($result['reason']);
    }

    /** @return array<string, array{0: ?string, 1: string}> */
    public static function unmappedNumbers(): array
    {
        return [
            'null'                   => [null, RegistrationYearGroups::REASON_MISSING],
            'blank'                  => ['   ', RegistrationYearGroups::REASON_MISSING],
            'generated number'       => ['CUR/2026/00001', RegistrationYearGroups::REASON_FORMAT],
            'unknown level digit'    => ['3CUR26AK013543', RegistrationYearGroups::REASON_FORMAT],
            'too short'              => ['1CUR26AK01', RegistrationYearGroups::REASON_FORMAT],
            'trailing junk'          => ['1CUR26AK013543X', RegistrationYearGroups::REASON_FORMAT],
            'code before 2010'       => ['1CUR09AK013001', RegistrationYearGroups::REASON_UNMAPPED],
            'code after 2026'        => ['1CUR27AK013001', RegistrationYearGroups::REASON_UNMAPPED],
            'code zero'              => ['1CUR00AK013001', RegistrationYearGroups::REASON_UNMAPPED],
        ];
    }

    /** @dataProvider unmappedNumbers */
    public function testUnmappableNumbersAreReportedNotGuessed(?string $regNumber, string $expectedReason): void
    {
        $result = RegistrationYearGroups::classify($regNumber);

        self::assertNull($result['label']);
        self::assertSame($expectedReason, $result['reason']);
    }

    public function testEveryCodeFromTenToTwentySixIsMapped(): void
    {
        self::assertSame(
            range(10, 26),
            array_keys(RegistrationYearGroups::YEAR_LABELS)
        );
        self::assertSame('2010-2011', RegistrationYearGroups::YEAR_LABELS[10]);
        self::assertSame('2026-2027', RegistrationYearGroups::YEAR_LABELS[26]);
    }
}

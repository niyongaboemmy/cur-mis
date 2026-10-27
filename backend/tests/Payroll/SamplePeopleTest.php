<?php

declare(strict_types=1);

namespace Tests\Payroll;

use App\Payroll\Engine\LineInput;

/** The five sample staff in database/seeds/payroll/sample_people.php cover every PAYE band. */
final class SamplePeopleTest extends PayrollTestCase
{
    public function testSampleStaffCoverEveryPayeBand(): void
    {
        $people = require __DIR__ . '/../../database/seeds/payroll/sample_people.php';
        $this->assertCount(5, $people);

        $engine = $this->engine();
        $taxByBasic = [];
        foreach ($people as $person) {
            // SUPPORT with no top-up and no housing or transport: gross is the basic salary
            $line = $engine->compute(new LineInput(
                scheme: 'SUPPORT',
                basic: $person['basic'],
                topupRate: '0',
                housingDivisor: 0,
                transportDivisor: 0,
                rama: true,
            ));
            $this->assertSame($person['basic'], $line['total_gross']);
            $taxByBasic[$person['basic']] = $line['paye'];
        }

        $this->assertSame(0, $taxByBasic[50000], 'first band is nil');
        $this->assertSame(2000, $taxByBasic[80000], '10% band');
        $this->assertSame(14000, $taxByBasic[150000], '20% band');
        $this->assertSame(39000, $taxByBasic[250000], 'first 30% sample');
        $this->assertSame(264000, $taxByBasic[1000000], 'top 30% sample');
        $this->assertCount(4, array_unique(array_column($people, 'band')), 'the four bands are all present');
    }
}

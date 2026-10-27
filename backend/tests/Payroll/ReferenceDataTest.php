<?php

declare(strict_types=1);

namespace Tests\Payroll;

use App\Payroll\Engine\LineInput;
use App\Payroll\Engine\PayrollEngine;
use App\Payroll\Seed\ReferenceSeeder;
use App\Payroll\Settings\SettingsRepository;
use InvalidArgumentException;

/**
 * Phase 2: the seed plan, and the round trip from seed rows back to engine settings.
 * Database writes and reads are not covered here (no database in the test run).
 */
final class ReferenceDataTest extends PayrollTestCase
{
    private function reference(): array
    {
        return require __DIR__ . '/../../database/seeds/payroll/reference_2026.php';
    }

    public function testPlanStoresSettingsWithoutSchemes(): void
    {
        $plan = ReferenceSeeder::plan($this->settings(), $this->reference());
        $stored = json_decode($plan['settings']['settings_json'], true, 512, JSON_THROW_ON_ERROR);

        $this->assertArrayNotHasKey('schemes', $stored);
        $this->assertSame('2026-01-01', $plan['settings']['effective_from']);
    }

    public function testStoredSettingsRoundTripToTheSameEngineConfig(): void
    {
        $settings = $this->settings();
        $plan = ReferenceSeeder::plan($settings, $this->reference());

        // What the database returns: the JSON plus the pay_schemes rows
        $schemeRows = array_map(static fn (array $s): array => [
            'code'               => $s['code'],
            'earnings_mode'      => $s['earnings_mode'],
            'default_tax_method' => $s['default_tax_method'],
            'applies_rssb'       => (string) $s['applies_rssb'],
            'applies_hazard'     => (string) $s['applies_hazard'],
            'applies_rama'       => (string) $s['applies_rama'],
            'applies_cbhi'       => (string) $s['applies_cbhi'],
        ], $plan['schemes']);

        $loaded = SettingsRepository::assemble($plan['settings']['settings_json'], $schemeRows);

        $this->assertSame($settings, $loaded);
    }

    public function testStoredSettingsGiveTheGoldenPayslip(): void
    {
        $plan = ReferenceSeeder::plan($this->settings(), $this->reference());
        $schemeRows = array_map(static fn (array $s): array => [
            'code'               => $s['code'],
            'earnings_mode'      => $s['earnings_mode'],
            'default_tax_method' => $s['default_tax_method'],
            'applies_rssb'       => $s['applies_rssb'],
            'applies_hazard'     => $s['applies_hazard'],
            'applies_rama'       => $s['applies_rama'],
            'applies_cbhi'       => $s['applies_cbhi'],
        ], $plan['schemes']);
        $engine = new PayrollEngine(SettingsRepository::assemble($plan['settings']['settings_json'], $schemeRows));

        $line = $engine->compute(new LineInput(
            scheme: 'PERMANENT', basic: 1647309, rama: true, otherInsurance: 82620, deductions: 200000
        ));

        $this->assertSame(2365396, $line['total_gross']);
        $this->assertSame(673619, $line['paye']);
    }

    public function testEverySchemeHasADisplayName(): void
    {
        $reference = $this->reference();
        unset($reference['scheme_names']['CASUAL']);

        $this->expectException(InvalidArgumentException::class);
        ReferenceSeeder::plan($this->settings(), $reference);
    }

    public function testDuplicateRoleCodeIsRejected(): void
    {
        $reference = $this->reference();
        $reference['responsibility_roles'][] = $reference['responsibility_roles'][0];

        $this->expectException(InvalidArgumentException::class);
        ReferenceSeeder::plan($this->settings(), $reference);
    }

    public function testDuplicateHourlyGradeIsRejected(): void
    {
        $reference = $this->reference();
        $reference['hourly_rates'][] = $reference['hourly_rates'][0];

        $this->expectException(InvalidArgumentException::class);
        ReferenceSeeder::plan($this->settings(), $reference);
    }

    public function testBadEffectiveDateIsRejected(): void
    {
        $reference = $this->reference();
        $reference['effective_from'] = '01/01/2026';

        $this->expectException(InvalidArgumentException::class);
        ReferenceSeeder::plan($this->settings(), $reference);
    }

    public function testSettingsThatCannotCalculateAreRejectedBeforeWriting(): void
    {
        $settings = $this->settings();
        unset($settings['rates']['pension_ee']);

        $this->expectException(InvalidArgumentException::class);
        ReferenceSeeder::plan($settings, $this->reference());
    }
}

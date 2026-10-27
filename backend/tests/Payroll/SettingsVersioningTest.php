<?php

declare(strict_types=1);

namespace Tests\Payroll;

use App\Payroll\Engine\LineInput;
use App\Payroll\Engine\PayrollEngine;
use App\Payroll\Settings\EffectiveSettings;
use InvalidArgumentException;

/**
 * Spec §9 test 12 (pure part): a period uses the settings valid on its date, and a stored
 * snapshot keeps the rates it was calculated with. The database side is tested in Phase 2.
 */
final class SettingsVersioningTest extends PayrollTestCase
{
    /** @return list<array{effective_from: string, settings: array<string, mixed>}> */
    private function versions(): array
    {
        $old = $this->settings();
        $new = $this->settings();
        // RSSB pension rate moves to 7% from 2027-01-01
        $new['rates']['pension_ee'] = '7';
        $new['rates']['pension_er'] = '7';
        return [
            ['effective_from' => '2026-01-01', 'settings' => $old],
            ['effective_from' => '2027-01-01', 'settings' => $new],
        ];
    }

    public function testRunAfterNewRateUsesNewRate(): void
    {
        $settings = EffectiveSettings::forDate($this->versions(), '2027-03-01');
        $this->assertSame('7', $settings['rates']['pension_ee']);

        $line = (new PayrollEngine($settings))->compute(new LineInput(scheme: 'TRANSPORT', enteredGross: 416591));
        // 7% of 416,591 = 29,161.37, rounded to 29,161
        $this->assertSame(29161, $line['pension_employee']);
    }

    public function testRunBeforeNewRateKeepsOldRate(): void
    {
        $settings = EffectiveSettings::forDate($this->versions(), '2026-12-31');
        $this->assertSame('6', $settings['rates']['pension_ee']);
    }

    public function testSnapshotIsIndependentOfLaterChanges(): void
    {
        $versions = $this->versions();
        $snapshot = EffectiveSettings::forDate($versions, '2026-06-01');

        // Changing the source afterwards does not change a snapshot already taken
        $versions[0]['settings']['rates']['pension_ee'] = '99';
        $this->assertSame('6', $snapshot['rates']['pension_ee']);
    }

    public function testNoVersionInEffectIsAnError(): void
    {
        $this->expectException(InvalidArgumentException::class);
        EffectiveSettings::forDate($this->versions(), '2025-12-31');
    }
}

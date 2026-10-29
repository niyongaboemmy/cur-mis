<?php

declare(strict_types=1);

namespace Tests\Payroll;

use App\Payroll\Engine\PayrollEngine;
use PHPUnit\Framework\TestCase;

/** Shared helpers: the 2026 settings fixture and an engine built from it. */
abstract class PayrollTestCase extends TestCase
{
    /** @return array<string, mixed> */
    protected function settings(): array
    {
        return require __DIR__ . '/../../database/seeds/payroll/settings_2026.php';
    }

    protected function engine(): PayrollEngine
    {
        return new PayrollEngine($this->settings());
    }

    /** Asserts a whole-RWF amount within the spec's ±1 RWF rounding tolerance. */
    protected function assertRwf(int $expected, int $actual, string $label): void
    {
        $this->assertLessThanOrEqual(1, abs($expected - $actual), "{$label}: expected {$expected}, got {$actual}");
    }
}

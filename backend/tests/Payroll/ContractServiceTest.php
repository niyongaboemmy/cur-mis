<?php

declare(strict_types=1);

namespace Tests\Payroll;

use App\Payroll\Staff\ContractService;
use Core\Database;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;
use Tests\Payroll\Support\RunDatabase;

/** Phase 3: employment contracts (salary history per person and scheme). */
final class ContractServiceTest extends TestCase
{
    private Database $db;
    private ContractService $contracts;

    protected function setUp(): void
    {
        $this->db = RunDatabase::create();
        RunDatabase::loadReference($this->db);
        RunDatabase::addEmployee($this->db, 101, 'Alice', 'Uwase');
        $this->contracts = new ContractService($this->db);
    }

    /** @param array<string, mixed> $overrides */
    private function data(array $overrides = []): array
    {
        return $overrides + [
            'scheme_code' => 'PERMANENT',
            'start_date' => '2026-01-01',
            'basic_salary' => 1647309,
            'responsibility_roles' => 'dean',
        ];
    }

    public function testContractIsStoredWithItsResponsibilitiesNormalised(): void
    {
        $id = $this->contracts->add(101, $this->data(['responsibility_roles' => ' dean , dean ']), 9);
        $row = $this->db->fetchOne('SELECT * FROM employment_contracts WHERE id = ?', [$id]);

        $this->assertSame('dean', $row['responsibility_roles']);
        $this->assertSame('1647309', (string) $row['basic_salary']);
        $this->assertSame('Active', $row['status']);
    }

    public function testOnlyOneOpenContractPerScheme(): void
    {
        $this->contracts->add(101, $this->data(), 9);
        $this->expectException(InvalidArgumentException::class);
        $this->expectExceptionMessageMatches('/open contract/');
        $this->contracts->add(101, $this->data(['start_date' => '2026-07-01', 'basic_salary' => 1800000]), 9);
    }

    public function testASalaryChangeEndsTheOldContractFirst(): void
    {
        $first = $this->contracts->add(101, $this->data(), 9);
        $this->contracts->end($first, '2026-06-30', 9);
        $second = $this->contracts->add(101, $this->data(['start_date' => '2026-07-01', 'basic_salary' => 1800000]), 9);

        $history = $this->contracts->forEmployee(101);
        $this->assertSame($second, (int) $history[0]['id'], 'newest first');
        $this->assertSame('Ended', $history[1]['status']);
        $this->assertSame('2026-06-30', $history[1]['end_date']);
    }

    public function testEndDateCannotPrecedeStart(): void
    {
        $id = $this->contracts->add(101, $this->data(), 9);
        $this->expectException(InvalidArgumentException::class);
        $this->contracts->end($id, '2025-12-31', 9);
    }

    public function testTaxOverrideNeedsAKnownMethodAndAReason(): void
    {
        try {
            $this->contracts->add(101, $this->data(['tax_method' => 'FLAT_SECONDARY']), 9);
            $this->fail('an override needs a reason');
        } catch (InvalidArgumentException) {
            $this->addToAssertionCount(1);
        }
        try {
            $this->contracts->add(101, $this->data(['tax_method' => 'MAGIC', 'tax_method_reason' => 'x']), 9);
            $this->fail('unknown tax method refused');
        } catch (InvalidArgumentException) {
            $this->addToAssertionCount(1);
        }

        $id = $this->contracts->add(101, $this->data(['tax_method' => 'FLAT_SECONDARY', 'tax_method_reason' => 'second employer']), 9);
        $this->assertSame('second employer', $this->db->fetchOne('SELECT tax_method_reason FROM employment_contracts WHERE id = ?', [$id])['tax_method_reason']);
    }

    public function testUnknownRoleAndSchemeAreRefused(): void
    {
        try {
            $this->contracts->add(101, $this->data(['responsibility_roles' => 'king']), 9);
            $this->fail('unknown role refused');
        } catch (InvalidArgumentException) {
            $this->addToAssertionCount(1);
        }
        $this->expectException(InvalidArgumentException::class);
        $this->contracts->add(101, $this->data(['scheme_code' => 'NOPE']), 9);
    }

    public function testBasicSalaryMustBeAWholeNonNegativeAmount(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $this->contracts->add(101, $this->data(['basic_salary' => 1000.5]), 9);
    }
}

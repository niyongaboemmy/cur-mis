<?php

declare(strict_types=1);

namespace Tests\Payroll;

use App\Payroll\Engine\LineInput;
use App\Payroll\Engine\PayrollEngine;
use App\Payroll\Runs\PayrollRunService;
use App\Payroll\Runs\RunStatus;
use App\Payroll\Runs\RunTransitionException;
use Core\Database;
use InvalidArgumentException;
use Tests\Payroll\Support\RunDatabase;

/**
 * Spec §9 tests 4, 10, 11, 12, 13 and the integration path create → calculate → approve → pay.
 * Runs against an in-memory SQLite database through the real services.
 */
final class RunWorkflowTest extends PayrollTestCase
{
    private Database $db;
    private PayrollRunService $runs;

    private const PREPARER = 1;
    private const VERIFIER = 2;
    private const APPROVER = 3;

    protected function setUp(): void
    {
        $this->db = RunDatabase::create();
        RunDatabase::loadReference($this->db);
        $this->runs = new PayrollRunService($this->db);

        RunDatabase::addEmployee($this->db, 101, 'Alice', 'Uwase', 'Equity Bank', '1001');
        RunDatabase::addEmployee($this->db, 102, 'Bob', 'Mugisha', 'Bank of Kigali', '2002', 'OTHER', '82620');
        RunDatabase::addEmployee($this->db, 103, 'Carol', 'Ingabire', 'BPR', '3003');
        $this->contract(101, 1647309);
        $this->contract(102, 500000, 'dean');
        $this->contract(103, 300000);
    }

    private function contract(int $employeeId, int $basic, ?string $roles = null, ?string $end = null): void
    {
        RunDatabase::insert($this->db, 'employment_contracts', [
            'employee_id'          => $employeeId,
            'scheme_code'          => 'PERMANENT',
            'start_date'           => '2025-01-01',
            'end_date'             => $end,
            'basic_salary'         => $basic,
            'responsibility_roles' => $roles,
            'status'               => 'Active',
        ]);
    }

    /** Creates a June 2026 PERMANENT run, generates it from contracts and calculates it. */
    private function calculatedRun(): int
    {
        $runId = $this->runs->createRun('PERMANENT', '2026-06-15', 'Salary June 2026', self::PREPARER);
        $this->runs->generateFromContracts($runId, self::PREPARER);
        $this->runs->calculate($runId, self::PREPARER);
        return $runId;
    }

    private function approvedRun(): int
    {
        $runId = $this->calculatedRun();
        $this->runs->verify($runId, self::VERIFIER);
        $this->runs->approve($runId, self::APPROVER);
        return $runId;
    }

    private function line(int $runId, int $employeeId): array
    {
        foreach ($this->runs->lines($runId) as $line) {
            if ((int) $line['employee_id'] === $employeeId) {
                return $line;
            }
        }
        $this->fail("No line for employee {$employeeId}");
    }

    public function testFullLifecycleFromContractsToPaid(): void
    {
        $runId = $this->runs->createRun('PERMANENT', '2026-06-15', 'Salary June 2026', self::PREPARER);
        $this->assertSame(3, $this->runs->generateFromContracts($runId, self::PREPARER));

        $this->runs->calculate($runId, self::PREPARER);
        $this->runs->verify($runId, self::VERIFIER);
        $this->runs->approve($runId, self::APPROVER);
        $this->runs->markPaid($runId, self::APPROVER);

        $run = $this->runs->run($runId);
        $this->assertSame(RunStatus::PAID, $run['status']);
        $this->assertSame('2026-06-01', $run['period_date'], 'period is normalised to the first of the month');

        // Alice: no responsibility, RAMA, no other insurance. Expected figures come from the engine itself.
        $expected = $this->engine()->compute(new LineInput(scheme: 'PERMANENT', basic: 1647309, rama: true));
        $alice = $this->line($runId, 101);
        $this->assertSame($expected['net_pay'], (int) $alice['net_pay']);
        $this->assertSame($expected['paye'], (int) $alice['paye']);
        $this->assertSame('Equity Bank', $alice['bank_name']);
    }

    public function testResponsibilityAndInsuranceFromContractAndEmployee(): void
    {
        $runId = $this->calculatedRun();

        // Bob: Dean allowance (170,018) and an OTHER insurer (premium 82,620) instead of RAMA
        $bob = $this->line($runId, 102);
        $this->assertSame(170018, (int) $bob['responsibility_allowance']);
        $this->assertSame(82620, (int) $bob['other_insurance']);
        $this->assertSame(0, (int) $bob['rama_employee']);
    }

    public function testOnlyActiveContractsCoveringThePeriodAreGenerated(): void
    {
        RunDatabase::addEmployee($this->db, 104, 'Dan', 'Habimana');
        $this->contract(104, 400000, null, '2026-05-31');

        $runId = $this->runs->createRun('PERMANENT', '2026-06-01', 'June', self::PREPARER);
        $this->assertSame(3, $this->runs->generateFromContracts($runId, self::PREPARER));
        $onRun = array_map('intval', array_column($this->runs->lines($runId), 'employee_id'));
        $this->assertNotContains(104, $onRun, 'a contract that ended before the period is not on the run');
    }

    public function testSeparationOfDuties(): void
    {
        $runId = $this->calculatedRun();

        try {
            $this->runs->verify($runId, self::PREPARER);
            $this->fail('the preparer must not verify');
        } catch (RunTransitionException) {
        }

        $this->runs->verify($runId, self::VERIFIER);
        try {
            $this->runs->approve($runId, self::VERIFIER);
            $this->fail('the verifier must not approve');
        } catch (RunTransitionException) {
        }
        $this->runs->approve($runId, self::APPROVER);
        $this->assertSame(RunStatus::APPROVED, $this->runs->run($runId)['status']);
    }

    public function testLockedRunRefusesEveryChange(): void
    {
        $runId = $this->approvedRun();
        $lineId = (int) $this->line($runId, 101)['id'];

        $attempts = [
            fn () => $this->runs->calculate($runId, self::PREPARER),
            fn () => $this->runs->generateFromContracts($runId, self::PREPARER),
            fn () => $this->runs->addLine($runId, 101, 'X', ['entered_gross' => 1000], self::PREPARER, 'test'),
            fn () => $this->runs->updateLine($runId, $lineId, ['arrears' => 5], self::PREPARER, 'test'),
            fn () => $this->runs->removeLine($runId, $lineId, self::PREPARER, 'test'),
        ];
        foreach ($attempts as $attempt) {
            try {
                $attempt();
                $this->fail('a locked run must not change');
            } catch (RunTransitionException $e) {
                $this->assertStringContainsString('locked', $e->getMessage());
            }
        }
        $this->assertSame(RunStatus::APPROVED, $this->runs->run($runId)['status']);
    }

    public function testMarkPaidNeedsAnAccountNumberForEveryLine(): void
    {
        // Carol has no account number on file when the run is made
        $this->db->execute("UPDATE employees SET employee_account = '' WHERE employee_id = 103");
        $runId = $this->approvedRun();
        try {
            $this->runs->markPaid($runId, self::APPROVER);
            $this->fail('payment without an account must be refused');
        } catch (RunTransitionException $e) {
            $this->assertStringContainsString('Ingabire Carol: no account number', $e->getMessage());
        }
        $this->assertSame(RunStatus::APPROVED, $this->runs->run($runId)['status']);
    }

    public function testReopenNeedsAReasonAndAnyEditRestartsFromDraft(): void
    {
        $runId = $this->approvedRun();

        try {
            $this->runs->reopen($runId, self::APPROVER, '  ');
            $this->fail('reopen needs a reason');
        } catch (InvalidArgumentException) {
        }

        $this->runs->reopen($runId, self::APPROVER, 'Arrears agreed after approval');
        $this->assertSame(RunStatus::CALCULATED, $this->runs->run($runId)['status']);

        $lineId = (int) $this->line($runId, 101)['id'];
        $this->runs->updateLine($runId, $lineId, ['arrears' => 50000], self::PREPARER, 'Arrears agreed');
        $this->assertSame(RunStatus::DRAFT, $this->runs->run($runId)['status']);

        // A DRAFT run cannot be paid without being calculated and approved again
        $this->expectException(RunTransitionException::class);
        $this->runs->markPaid($runId, self::APPROVER);
    }

    public function testEditingALineRecordsEachChangeWithItsReason(): void
    {
        $runId = $this->calculatedRun();
        $lineId = (int) $this->line($runId, 101)['id'];

        $this->runs->updateLine($runId, $lineId, ['arrears' => 50000], self::PREPARER, 'Arrears for March');
        $adjustments = $this->db->fetchAll('SELECT * FROM payroll_adjustments WHERE run_id = ?', [$runId]);

        $this->assertCount(1, $adjustments);
        $this->assertSame('arrears', $adjustments[0]['component']);
        $this->assertSame('0', $adjustments[0]['old_value']);
        $this->assertSame('50000', $adjustments[0]['new_value']);
        $this->assertSame('Arrears for March', $adjustments[0]['reason']);

        $this->runs->calculate($runId, self::PREPARER);
        $expected = $this->engine()->compute(new LineInput(scheme: 'PERMANENT', basic: 1647309, rama: true, arrears: 50000));
        $this->assertSame($expected['total_gross'], (int) $this->line($runId, 101)['total_gross']);
    }

    public function testChangesNeedAReasonAndKnownInputs(): void
    {
        $runId = $this->calculatedRun();
        $lineId = (int) $this->line($runId, 101)['id'];

        try {
            $this->runs->updateLine($runId, $lineId, ['arrears' => 1], self::PREPARER, '');
            $this->fail('an empty reason is refused');
        } catch (InvalidArgumentException) {
        }
        try {
            $this->runs->updateLine($runId, $lineId, ['bogus' => 1], self::PREPARER, 'typo');
            $this->fail('unknown inputs are refused');
        } catch (InvalidArgumentException $e) {
            $this->assertStringContainsString('bogus', $e->getMessage());
        }
    }

    public function testSettingsVersionChangeKeepsTheOldRunsFigures(): void
    {
        // June 2026 run uses the 6% pension rate
        $oldRun = $this->calculatedRun();
        $oldPension = (int) $this->line($oldRun, 101)['pension_employee'];

        // A 7% rate takes effect on 1 January 2027
        $settings = $this->settings();
        $settings['rates']['pension_ee'] = '7';
        $settings['rates']['pension_er'] = '7';
        unset($settings['schemes']);
        RunDatabase::insert($this->db, 'payroll_settings', [
            'effective_from' => '2027-01-01',
            'settings_json'  => json_encode($settings, JSON_THROW_ON_ERROR),
            'note'           => 'pension rises to 7%',
        ]);

        $newRun = $this->runs->createRun('PERMANENT', '2027-03-01', 'Salary March 2027', self::PREPARER);
        $this->runs->generateFromContracts($newRun, self::PREPARER);
        $this->runs->calculate($newRun, self::PREPARER);

        $snapshot = json_decode($this->runs->run($newRun)['snapshot_json'], true, 512, JSON_THROW_ON_ERROR);
        $this->assertSame('7', $snapshot['settings']['rates']['pension_ee']);
        $this->assertGreaterThan($oldPension, (int) $this->line($newRun, 101)['pension_employee']);

        // Recalculating the old run still uses its own snapshot
        $this->runs->calculate($oldRun, self::PREPARER);
        $this->assertSame($oldPension, (int) $this->line($oldRun, 101)['pension_employee']);
        $oldSnapshot = json_decode($this->runs->run($oldRun)['snapshot_json'], true, 512, JSON_THROW_ON_ERROR);
        $this->assertSame('6', $oldSnapshot['settings']['rates']['pension_ee']);
    }

    public function testConsultancyGrossUpThroughARun(): void
    {
        // Spec §9 test 10, on a run: 400,000 net needs gross 571,429 at 30%
        $runId = $this->runs->createRun('CONSULTANCY', '2026-06-01', 'Consultancy June', self::PREPARER);
        $this->runs->addLine($runId, 101, '', ['target_net' => 400000], self::PREPARER, 'Agreed consultancy fee');
        $this->runs->calculate($runId, self::PREPARER);

        $line = $this->line($runId, 101);
        $this->assertSame(571429, (int) $line['total_gross']);
        $this->assertSame(400000, (int) $line['net_pay']);
        $this->assertSame(0, (int) $line['gross_up_residual']);
    }

    public function testPartTimeHourlyLineThroughARun(): void
    {
        // Spec §9 test 4, on a run: 80 hours at 6,291
        $runId = $this->runs->createRun('PART_TIME', '2026-06-01', 'Part-time June', self::PREPARER);
        $this->runs->addLine($runId, 102, 'EDU101', ['quantity' => '80', 'unit_rate' => 6291, 'tax_method' => 'FLAT_SECONDARY'],
            self::PREPARER, 'Module EDU101');
        $this->runs->calculate($runId, self::PREPARER);

        $line = $this->line($runId, 102);
        $this->assertSame(503280, (int) $line['total_gross']);
        $this->assertSame(318986, (int) $line['net_pay']);
    }

    public function testCreateRunRules(): void
    {
        $this->runs->createRun('PERMANENT', '2026-06-01', 'June', self::PREPARER);

        $cases = [
            'a second run for the same scheme and month' => fn () => $this->runs->createRun('PERMANENT', '2026-06-20', 'Again', self::PREPARER),
            'an unknown scheme' => fn () => $this->runs->createRun('NOPE', '2026-06-01', 'x', self::PREPARER),
            'a malformed period' => fn () => $this->runs->createRun('PERMANENT', '06/2026', 'x', self::PREPARER),
            'contract generation on an entered-gross scheme' => function () {
                $id = $this->runs->createRun('TRANSPORT', '2026-06-01', 'x', self::PREPARER);
                $this->runs->generateFromContracts($id, self::PREPARER);
            },
        ];
        foreach ($cases as $label => $case) {
            try {
                $case();
                $this->fail("expected refusal for {$label}");
            } catch (InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    public function testCasualWorkersCanBeTaxedDifferentlyOnTheSameRun(): void
    {
        // Spec §3.2 and §9 tests 6–7: the tax method is set per worker, not per run
        $runId = $this->runs->createRun('CASUAL', '2026-06-01', 'Casual June', self::PREPARER);
        $this->runs->addLine($runId, 101, '', ['quantity' => '2', 'unit_rate' => 75339, 'tax_method' => 'PROGRESSIVE'], self::PREPARER, 'two days');
        $this->runs->addLine($runId, 102, '', ['quantity' => '1', 'unit_rate' => 315550, 'tax_method' => 'CASUAL_LABOUR'], self::PREPARER, 'one day');
        $this->runs->calculate($runId, self::PREPARER);

        $this->assertSame(14136, (int) $this->line($runId, 101)['paye']);
        $this->assertSame(38333, (int) $this->line($runId, 102)['paye']);
    }

    public function testTransportAllowanceOnARunIsTaxedFlatAtThirtyPercent(): void
    {
        $runId = $this->runs->createRun('TRANSPORT', '2026-06-01', 'Transport June', self::PREPARER);
        $this->runs->addLine($runId, 103, '', ['entered_gross' => 416591], self::PREPARER, 'transport allowance');
        $this->runs->calculate($runId, self::PREPARER);

        $line = $this->line($runId, 103);
        $this->assertSame(124977, (int) $line['paye']);
        $this->assertSame(264042, (int) $line['net_pay']);
    }

    public function testDuplicateLineIsRefused(): void
    {
        $runId = $this->runs->createRun('CASUAL', '2026-06-01', 'Casual June', self::PREPARER);
        $this->runs->addLine($runId, 101, '', ['quantity' => '2', 'unit_rate' => 75339, 'tax_method' => 'PROGRESSIVE'], self::PREPARER, 'days worked');

        $this->expectException(InvalidArgumentException::class);
        $this->runs->addLine($runId, 101, '', ['quantity' => '1', 'unit_rate' => 1000], self::PREPARER, 'again');
    }
}

<?php

declare(strict_types=1);

namespace Tests\Payroll;

use App\Payroll\PartTime\PartTimeRules;
use App\Payroll\PartTime\PartTimeWorkflow;
use App\Payroll\Runs\PayrollRunService;
use App\Payroll\Runs\RunTransitionException;
use Core\Database;
use InvalidArgumentException;
use Tests\Payroll\Support\RunDatabase;

/** Spec §3.3 PART_TIME, §9 tests 4 and 5, and the part-time approval workflow. */
final class PartTimeTest extends PayrollTestCase
{
    private const REQUESTER = 1;
    private const DVCA = 2;
    private const PAYROLL = 3;

    private Database $db;
    private PayrollRunService $runs;
    private PartTimeWorkflow $workflow;

    protected function setUp(): void
    {
        $this->db = RunDatabase::create();
        RunDatabase::loadReference($this->db);
        RunDatabase::addEmployee($this->db, 102, 'Bob', 'Mugisha', 'Bank of Kigali', '2002');
        $this->runs = new PayrollRunService($this->db);
        $this->workflow = new PartTimeWorkflow($this->db, $this->runs);
    }

    private function request(int $credits = 20, string $grade = 'ASS', string $start = '2026-06-01', string $end = '2026-06-30'): int
    {
        return $this->workflow->request(102, [
            'module_code'  => 'EDU101',
            'module_title' => 'Introduction to Education',
            'programme'    => 'Day',
            'credits'      => $credits,
            'grade_code'   => $grade,
            'period_start' => $start,
            'period_end'   => $end,
        ], self::REQUESTER);
    }

    private function contracted(int $id): void
    {
        $this->workflow->advance($id, self::DVCA);
        $this->workflow->advance($id, self::PAYROLL);
        $this->workflow->advance($id, self::PAYROLL);
    }

    public function testFullPathToPayrollMatchesSpecTest4(): void
    {
        // Spec §9 test 4: 20 credits = 80 hours at the assistant lecturer rate 6,291
        $id = $this->request(20, 'ASS');
        $this->assertSame('80', $this->workflow->assignment($id)['hours_default']);
        $this->contracted($id);

        $runId = $this->runs->createRun('PART_TIME', '2026-06-01', 'Part-time June 2026', self::PAYROLL);
        $this->workflow->sendToPayroll($id, $runId, self::PAYROLL);
        $this->runs->calculate($runId, self::PAYROLL);

        $line = $this->runs->lines($runId)[0];
        $this->assertSame(503280, (int) $line['total_gross']);
        $this->assertSame(318986, (int) $line['net_pay']);
        $this->assertSame(PartTimeRules::SENT_TO_PAYROLL, $this->workflow->assignment($id)['status']);
        $this->assertSame($runId, (int) $this->workflow->assignment($id)['payroll_run_id']);
    }

    public function testHoursOverrideMatchesSpecTest5AndNeedsAReason(): void
    {
        // Spec §9 test 5: 36 hours at 5,857 (the tutorial rate) gives gross 210,852
        $id = $this->request(5, 'TUT'); // defaults to 20 hours, overridden to 36
        try {
            $this->workflow->overrideHours($id, '36', '  ');
            $this->fail('an override needs a reason');
        } catch (InvalidArgumentException) {
        }
        $this->workflow->overrideHours($id, '36', 'Practical sessions agreed with the Dean');
        $this->contracted($id);

        $runId = $this->runs->createRun('PART_TIME', '2026-06-01', 'June', self::PAYROLL);
        $this->workflow->sendToPayroll($id, $runId, self::PAYROLL);
        $this->runs->calculate($runId, self::PAYROLL);

        $this->assertSame(210852, (int) $this->runs->lines($runId)[0]['total_gross']);
    }

    public function testHoursAreLockedOnceWithPayroll(): void
    {
        $id = $this->request();
        $this->contracted($id);
        $runId = $this->runs->createRun('PART_TIME', '2026-06-01', 'June', self::PAYROLL);
        $this->workflow->sendToPayroll($id, $runId, self::PAYROLL);

        $this->expectException(RunTransitionException::class);
        $this->workflow->overrideHours($id, '10', 'too late');
    }

    public function testTheRequesterCannotApproveTheirOwnModule(): void
    {
        $id = $this->request();
        $this->expectException(RunTransitionException::class);
        $this->workflow->advance($id, self::REQUESTER);
    }

    public function testOnlyAContractedAssignmentGoesToPayrollInTheRightMonth(): void
    {
        $id = $this->request();
        $runId = $this->runs->createRun('PART_TIME', '2026-06-01', 'June', self::PAYROLL);

        try {
            $this->workflow->sendToPayroll($id, $runId, self::PAYROLL);
            $this->fail('a requested module cannot go to payroll');
        } catch (RunTransitionException) {
            $this->addToAssertionCount(1);
        }

        $this->contracted($id);
        $julyRun = $this->runs->createRun('PART_TIME', '2026-07-01', 'July', self::PAYROLL);
        try {
            $this->workflow->sendToPayroll($id, $julyRun, self::PAYROLL);
            $this->fail('a June module does not go on the July run');
        } catch (InvalidArgumentException) {
            $this->addToAssertionCount(1);
        }
    }

    public function testRequestValidatesProgrammeGradeAndPeriod(): void
    {
        $cases = [
            'an unknown programme' => fn () => $this->workflow->request(102, ['programme' => 'Night', 'credits' => 5, 'grade_code' => 'ASS',
                'period_start' => '2026-06-01', 'period_end' => '2026-06-30'], self::REQUESTER),
            'an unknown grade' => fn () => $this->request(5, 'XYZ'),
            'an end before the start' => fn () => $this->request(5, 'ASS', '2026-06-30', '2026-06-01'),
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

    public function testReimbursementUsesTheSettingsRates(): void
    {
        $id = $this->workflow->request(102, [
            'module_code' => 'EDU102', 'module_title' => 'Evaluation', 'programme' => 'Weekend', 'credits' => 5,
            'grade_code' => 'CCA', 'period_start' => '2026-06-01', 'period_end' => '2026-06-30',
            'from_outside_huye' => true, 'accommodation_nights' => 3,
            'transport_zone' => 'KIGALI', 'transport_trips' => 2,
        ], self::REQUESTER);

        $amounts = $this->workflow->reimbursement($this->workflow->assignment($id), $this->settings());
        $this->assertSame(['accommodation' => 26475, 'transport' => 14960, 'total' => 41435], $amounts);
    }

    public function testDefaultHoursAreCreditsTimesFour(): void
    {
        $this->assertSame('80', PartTimeRules::defaultHours(20));
        $this->assertSame('0', PartTimeRules::defaultHours(0));
    }

    public function testAllowancesRules(): void
    {
        $rates = $this->settings()['part_time_allowances'];

        // Living in Huye: no accommodation, even with nights entered
        $local = PartTimeRules::allowances(3, false, 'OTHER', 1, $rates);
        $this->assertSame(0, $local['accommodation']);
        $this->assertSame(4000, $local['transport']);

        $this->expectException(InvalidArgumentException::class);
        PartTimeRules::allowances(1, true, 'MARS', 1, $rates);
    }

    public function testWorkflowStepsRunInOrder(): void
    {
        $this->assertSame(PartTimeRules::DVCA_APPROVED, PartTimeRules::nextStatus(PartTimeRules::REQUESTED));
        $this->assertSame(PartTimeRules::SENT_TO_PAYROLL, PartTimeRules::nextStatus(PartTimeRules::CONTRACTED));
        $this->assertNull(PartTimeRules::nextStatus(PartTimeRules::SENT_TO_PAYROLL));
        $this->assertFalse(PartTimeRules::hoursCanChange(PartTimeRules::SENT_TO_PAYROLL));
        $this->assertTrue(PartTimeRules::hoursCanChange(PartTimeRules::INVITED));
    }
}

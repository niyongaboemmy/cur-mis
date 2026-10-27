<?php

declare(strict_types=1);

namespace App\Payroll\Runs;

use App\Payroll\Engine\PayrollEngine;
use App\Payroll\Money;
use App\Payroll\Settings\SettingsRepository;
use Core\Database;
use InvalidArgumentException;
use JsonException;

/**
 * Creates and moves payroll runs through their states (spec §7).
 *
 * Every change is written to payroll_audit_log with who, when, and before/after values.
 * Separation of duties: the person who verifies or approves a run cannot be the one who
 * prepared or verified it.
 */
final class PayrollRunService
{
    /** Value an input has when it was never entered: what the engine assumes for it. */
    private const UNSET_DEFAULTS = ['arrears' => 0, 'deductions' => 0];

    public function __construct(
        private Database $db,
        private ?SettingsRepository $settings = null,
    ) {
        $this->settings ??= new SettingsRepository($db);
    }

    /** Creates a DRAFT run for a scheme and month, freezing the settings in force on that date. */
    public function createRun(string $schemeCode, string $periodDate, string $title, int $actorId): int
    {
        $periodDate = $this->firstOfMonth($periodDate);
        $scheme = $this->db->fetchOne('SELECT `code` FROM `pay_schemes` WHERE `code` = ? AND `is_active` = 1', [$schemeCode]);
        if ($scheme === false) {
            throw new InvalidArgumentException("Unknown or inactive pay scheme: {$schemeCode}");
        }
        $exists = $this->db->fetchOne(
            'SELECT `id` FROM `payroll_runs` WHERE `scheme_code` = ? AND `period_date` = ?',
            [$schemeCode, $periodDate]
        );
        if ($exists !== false) {
            throw new InvalidArgumentException("A {$schemeCode} run already exists for {$periodDate}.");
        }

        $engineSettings = $this->settings->forDate($periodDate);
        $versionFrom = $this->db->fetchOne(
            'SELECT MAX(`effective_from`) AS `d` FROM `payroll_settings` WHERE `effective_from` <= ?',
            [$periodDate]
        )['d'];

        $snapshot = RunSnapshot::build(
            $engineSettings,
            $this->amountsAsOf('responsibility_roles', 'role_code', 'monthly_amount', $periodDate),
            $this->amountsAsOf('hourly_rates', 'grade_code', 'rate_per_hour', $periodDate),
        );

        $this->db->execute(
            'INSERT INTO `payroll_runs`
                (`scheme_code`, `period_date`, `title`, `status`, `settings_effective_from`, `snapshot_json`, `created_by`)
             VALUES (?, ?, ?, ?, ?, ?, ?)',
            [$schemeCode, $periodDate, $title, RunStatus::DRAFT, (string) $versionFrom, $snapshot, $actorId]
        );
        $runId = (int) $this->db->lastInsertId();
        $this->audit($actorId, 'run.created', $runId, null, ['scheme' => $schemeCode, 'period' => $periodDate]);
        return $runId;
    }

    /**
     * Adds a line for every active contract of a salaried scheme. People already on the run are skipped.
     *
     * @return int number of lines added
     */
    public function generateFromContracts(int $runId, int $actorId): int
    {
        $run = $this->editableRun($runId);
        $snapshot = RunSnapshot::read($run['snapshot_json']);
        $earnings = $snapshot['settings']['schemes'][$run['scheme_code']]['earnings'] ?? null;
        if ($earnings !== PayrollEngine::EARN_SALARY) {
            throw new InvalidArgumentException("{$run['scheme_code']} lines are added by hand or from part-time assignments.");
        }

        $periodEnd = date('Y-m-d', strtotime($run['period_date'] . ' +1 month -1 day'));
        $contracts = $this->db->fetchAll(
            'SELECT c.*, e.`employee_fname`, e.`employee_lname`, e.`employee_bank`, e.`employee_account`,
                    e.`insurance_type`, e.`insurance_premium`
               FROM `employment_contracts` c
               JOIN `employees` e ON e.`employee_id` = c.`employee_id`
              WHERE c.`scheme_code` = ? AND c.`status` = ?
                AND c.`start_date` <= ? AND (c.`end_date` IS NULL OR c.`end_date` >= ?)
                AND e.`account_status` = ?
              ORDER BY e.`employee_lname`, e.`employee_fname`',
            [$run['scheme_code'], 'Active', $periodEnd, $run['period_date'], 'Active']
        );

        $added = 0;
        foreach ($contracts as $contract) {
            if ($this->lineExists($runId, (int) $contract['employee_id'], '')) {
                continue;
            }
            $inputs = LineInputFactory::salaryInputs($contract, $contract, $snapshot['responsibility_amounts']);
            $this->insertLine($runId, $contract, '', $inputs);
            $added++;
        }

        $this->touchDraft($run, $actorId);
        $this->audit($actorId, 'run.generated', $runId, null, ['lines_added' => $added]);
        return $added;
    }

    /**
     * Adds a hand-entered line (casual, transport, PG incentive, consultancy, or an extra line).
     * The inputs are checked by a trial calculation before anything is saved.
     *
     * @param array<string, mixed> $inputs
     */
    public function addLine(int $runId, int $employeeId, string $lineRef, array $inputs, int $actorId, string $reason): int
    {
        $this->requireReason($reason);
        $run = $this->editableRun($runId);
        $snapshot = RunSnapshot::read($run['snapshot_json']);
        $engine = new PayrollEngine($snapshot['settings']);
        $engine->compute(LineInputFactory::fromStored($run['scheme_code'], $inputs));

        $employee = $this->employee($employeeId);
        if ($this->lineExists($runId, $employeeId, $lineRef)) {
            throw new InvalidArgumentException('This person already has a line on the run.');
        }

        $lineId = $this->insertLine($runId, null, $lineRef, $inputs, $employee);
        $this->touchDraft($run, $actorId);
        $this->audit($actorId, 'line.added', $runId, null, ['line_id' => $lineId, 'reason' => $reason]);
        return $lineId;
    }

    /**
     * Changes the inputs of a line. Each changed input is recorded as an adjustment with the reason.
     *
     * @param array<string, mixed> $changes input name => new value
     */
    public function updateLine(int $runId, int $lineId, array $changes, int $actorId, string $reason): void
    {
        $this->requireReason($reason);
        $run = $this->editableRun($runId);
        $line = $this->lineOf($runId, $lineId);
        $current = json_decode((string) $line['inputs_json'], true, 512, JSON_THROW_ON_ERROR);

        $snapshot = RunSnapshot::read($run['snapshot_json']);
        $merged = array_merge($current, $changes);
        (new PayrollEngine($snapshot['settings']))->compute(LineInputFactory::fromStored($run['scheme_code'], $merged));

        $this->db->transaction(function () use ($changes, $current, $runId, $lineId, $actorId, $reason, $merged): void {
            foreach ($changes as $component => $value) {
                $before = array_key_exists($component, $current) ? $current[$component] : self::UNSET_DEFAULTS[$component] ?? null;
                if ($before === $value) {
                    continue;
                }
                $this->db->execute(
                    'INSERT INTO `payroll_adjustments` (`run_id`, `line_id`, `component`, `old_value`, `new_value`, `reason`, `created_by`)
                     VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [$runId, $lineId, (string) $component, $this->scalar($before), $this->scalar($value), $reason, $actorId]
                );
            }
            $this->db->execute(
                'UPDATE `payroll_lines` SET `inputs_json` = ? WHERE `id` = ? AND `run_id` = ?',
                [json_encode($merged, JSON_THROW_ON_ERROR), $lineId, $runId]
            );
        });

        $this->touchDraft($run, $actorId);
        $this->audit($actorId, 'line.updated', $runId, $current, $merged);
    }

    /** Removes a line from an editable run. */
    public function removeLine(int $runId, int $lineId, int $actorId, string $reason): void
    {
        $this->requireReason($reason);
        $run = $this->editableRun($runId);
        $line = $this->lineOf($runId, $lineId);
        $this->db->execute('DELETE FROM `payroll_lines` WHERE `id` = ? AND `run_id` = ?', [$lineId, $runId]);
        $this->touchDraft($run, $actorId);
        $this->audit($actorId, 'line.removed', $runId, ['employee_id' => $line['employee_id'], 'line_ref' => $line['line_ref']], null, $reason);
    }

    /** Recalculates every line with the run's snapshot. Moves the run to CALCULATED. */
    public function calculate(int $runId, int $actorId): void
    {
        $run = $this->editableRun($runId);
        $snapshot = RunSnapshot::read($run['snapshot_json']);
        $engine = new PayrollEngine($snapshot['settings']);

        $lines = $this->db->fetchAll('SELECT * FROM `payroll_lines` WHERE `run_id` = ? ORDER BY `employee_name`, `line_ref`', [$runId]);

        $this->db->transaction(function () use ($engine, $lines, $run, $runId, $actorId): void {
            foreach ($lines as $line) {
                $inputs = json_decode((string) $line['inputs_json'], true, 512, JSON_THROW_ON_ERROR);
                $result = $engine->compute(LineInputFactory::fromStored($run['scheme_code'], $inputs));
                $this->saveResult((int) $line['id'], $result);
            }
            // A recalculation of a CALCULATED run keeps its state; DRAFT moves forward.
            if ($run['status'] !== RunStatus::CALCULATED) {
                RunStatus::assertMove($run['status'], RunStatus::CALCULATED);
            }
            $this->db->execute(
                'UPDATE `payroll_runs` SET `status` = ?, `calculated_at` = ? WHERE `id` = ?',
                [RunStatus::CALCULATED, $this->now(), $runId]
            );
        });

        $this->audit($actorId, 'run.calculated', $runId, ['status' => $run['status']], ['status' => RunStatus::CALCULATED, 'lines' => count($lines)]);
    }

    /** CALCULATED → VERIFIED (HR Director). The verifier cannot be the preparer. */
    public function verify(int $runId, int $actorId): void
    {
        $run = $this->run($runId);
        RunStatus::assertMove($run['status'], RunStatus::VERIFIED);
        if ((int) $run['created_by'] === $actorId) {
            throw new RunTransitionException('The person who prepared the run cannot verify it.');
        }
        $this->db->execute(
            'UPDATE `payroll_runs` SET `status` = ?, `verified_by` = ?, `verified_at` = ? WHERE `id` = ?',
            [RunStatus::VERIFIED, $actorId, $this->now(), $runId]
        );
        $this->audit($actorId, 'run.verified', $runId, ['status' => $run['status']], ['status' => RunStatus::VERIFIED]);
    }

    /** VERIFIED → CALCULATED, sent back to the preparer with a reason. */
    public function returnToPreparer(int $runId, int $actorId, string $reason): void
    {
        $this->requireReason($reason);
        $run = $this->run($runId);
        RunStatus::assertMove($run['status'], RunStatus::CALCULATED);
        $this->db->execute('UPDATE `payroll_runs` SET `status` = ? WHERE `id` = ?', [RunStatus::CALCULATED, $runId]);
        $this->audit($actorId, 'run.returned', $runId, ['status' => $run['status']], ['status' => RunStatus::CALCULATED], $reason);
    }

    /** VERIFIED → APPROVED (DAF). Locks the run. The approver cannot be the verifier or the preparer. */
    public function approve(int $runId, int $actorId): void
    {
        $run = $this->run($runId);
        RunStatus::assertMove($run['status'], RunStatus::APPROVED);
        if ((int) $run['verified_by'] === $actorId || (int) $run['created_by'] === $actorId) {
            throw new RunTransitionException('Approval needs a different person from the preparer and the verifier.');
        }
        $this->db->execute(
            'UPDATE `payroll_runs` SET `status` = ?, `approved_by` = ?, `approved_at` = ? WHERE `id` = ?',
            [RunStatus::APPROVED, $actorId, $this->now(), $runId]
        );
        $this->audit($actorId, 'run.approved', $runId, ['status' => $run['status']], ['status' => RunStatus::APPROVED]);
    }

    /**
     * APPROVED → PAID. Every line needs an account number, and no line may have a negative net.
     *
     * @throws RunTransitionException listing the problems
     */
    public function markPaid(int $runId, int $actorId): void
    {
        $run = $this->run($runId);
        RunStatus::assertMove($run['status'], RunStatus::PAID);

        $problems = [];
        foreach ($this->lines($runId) as $line) {
            if (trim((string) $line['account_number']) === '') {
                $problems[] = "{$line['employee_name']}: no account number";
            }
            if ((int) $line['net_pay'] < 0) {
                $problems[] = "{$line['employee_name']}: negative net pay";
            }
        }
        if ($problems !== []) {
            throw new RunTransitionException('The run cannot be marked paid: ' . implode('; ', $problems));
        }

        $this->db->execute(
            'UPDATE `payroll_runs` SET `status` = ?, `paid_by` = ?, `paid_at` = ? WHERE `id` = ?',
            [RunStatus::PAID, $actorId, $this->now(), $runId]
        );
        $this->audit($actorId, 'run.paid', $runId, ['status' => $run['status']], ['status' => RunStatus::PAID]);
    }

    /** APPROVED → CALCULATED with a reason. PAID runs cannot be reopened. */
    public function reopen(int $runId, int $actorId, string $reason): void
    {
        $this->requireReason($reason);
        $run = $this->run($runId);
        RunStatus::assertMove($run['status'], RunStatus::CALCULATED);
        $this->db->execute(
            'UPDATE `payroll_runs` SET `status` = ?, `reopen_reason` = ? WHERE `id` = ?',
            [RunStatus::CALCULATED, $reason, $runId]
        );
        $this->audit($actorId, 'run.reopened', $runId, ['status' => $run['status']], ['status' => RunStatus::CALCULATED], $reason);
    }

    /** @return array<string, mixed> */
    public function run(int $runId): array
    {
        $run = $this->db->fetchOne('SELECT * FROM `payroll_runs` WHERE `id` = ?', [$runId]);
        if ($run === false) {
            throw new InvalidArgumentException("Payroll run {$runId} not found.");
        }
        return $run;
    }

    /** @return list<array<string, mixed>> */
    public function lines(int $runId): array
    {
        return $this->db->fetchAll(
            'SELECT * FROM `payroll_lines` WHERE `run_id` = ? ORDER BY `employee_name`, `line_ref`',
            [$runId]
        );
    }

    /** Records that someone downloaded or printed run figures (exports, payslips). */
    public function recordAccess(int $actorId, string $action, int $runId, string $detail = ''): void
    {
        $this->audit($actorId, $action, $runId, null, ['detail' => $detail]);
    }

    /** @return array<string, mixed> run state, rates and figure totals */
    public function summary(int $runId): array
    {
        $run = $this->run($runId);
        $totals = [];
        foreach (PayrollLineColumns::MONEY as $column) {
            $totals[$column] = 0;
        }
        $lines = $this->lines($runId);
        foreach ($lines as $line) {
            foreach (PayrollLineColumns::MONEY as $column) {
                $totals[$column] += (int) $line[$column];
            }
        }
        return ['run' => $run, 'line_count' => count($lines), 'totals' => $totals];
    }

    /**
     * Editable run or an error. Locked runs (APPROVED, PAID) cannot change.
     *
     * @return array<string, mixed>
     */
    private function editableRun(int $runId): array
    {
        $run = $this->run($runId);
        if (!RunStatus::isEditable($run['status'])) {
            throw new RunTransitionException("This run is {$run['status']} and is locked. Reopen it with a reason to change it.");
        }
        return $run;
    }

    /** Any change to an editable run sends it back to DRAFT until it is calculated again. */
    private function touchDraft(array $run, int $actorId): void
    {
        if ($run['status'] !== RunStatus::DRAFT) {
            $this->db->execute('UPDATE `payroll_runs` SET `status` = ? WHERE `id` = ?', [RunStatus::DRAFT, (int) $run['id']]);
        }
    }

    /**
     * @param array<string, mixed>|null $contract       contract row (null for hand-entered lines)
     * @param array<string, mixed>|null $employee       employee row, read from the database if null
     * @param array<string, mixed>      $inputs
     */
    private function insertLine(int $runId, ?array $contract, string $lineRef, array $inputs, ?array $employee = null): int
    {
        $employee ??= $this->employee((int) ($contract['employee_id'] ?? 0));
        $this->db->execute(
            'INSERT INTO `payroll_lines`
                (`run_id`, `employee_id`, `contract_id`, `line_ref`, `employee_name`, `bank_name`, `account_number`, `inputs_json`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $runId,
                (int) $employee['employee_id'],
                $contract !== null ? (int) $contract['id'] : null,
                $lineRef,
                trim($employee['employee_lname'] . ' ' . $employee['employee_fname']),
                $employee['employee_bank'] ?: null,
                $employee['employee_account'] ?: null,
                json_encode($inputs, JSON_THROW_ON_ERROR),
            ]
        );
        return (int) $this->db->lastInsertId();
    }

    /** @param array<string, mixed> $result engine output */
    private function saveResult(int $lineId, array $result): void
    {
        $row = PayrollLineColumns::fromEngineLine($result);
        $sets = [];
        $values = [];
        foreach ($row as $column => $value) {
            $sets[] = "`{$column}` = ?";
            $values[] = $value;
        }
        $values[] = $lineId;
        $this->db->execute('UPDATE `payroll_lines` SET ' . implode(', ', $sets) . ' WHERE `id` = ?', $values);
    }

    /** @return array<string, mixed> */
    private function employee(int $employeeId): array
    {
        $row = $this->db->fetchOne(
            'SELECT `employee_id`, `employee_fname`, `employee_lname`, `employee_bank`, `employee_account`,
                    `insurance_type`, `insurance_premium`
               FROM `employees` WHERE `employee_id` = ? AND `account_status` = ?',
            [$employeeId, 'Active']
        );
        if ($row === false) {
            throw new InvalidArgumentException("No active employee {$employeeId}.");
        }
        return $row;
    }

    /** @return array<string, mixed> */
    private function lineOf(int $runId, int $lineId): array
    {
        $line = $this->db->fetchOne('SELECT * FROM `payroll_lines` WHERE `id` = ? AND `run_id` = ?', [$lineId, $runId]);
        if ($line === false) {
            throw new InvalidArgumentException("Line {$lineId} is not on run {$runId}.");
        }
        return $line;
    }

    private function lineExists(int $runId, int $employeeId, string $lineRef): bool
    {
        return $this->db->fetchOne(
            'SELECT `id` FROM `payroll_lines` WHERE `run_id` = ? AND `employee_id` = ? AND `line_ref` = ?',
            [$runId, $employeeId, $lineRef]
        ) !== false;
    }

    /**
     * Latest amount per code that took effect on or before the date.
     *
     * @return array<string, int>
     */
    private function amountsAsOf(string $table, string $codeColumn, string $amountColumn, string $asOf): array
    {
        $rows = $this->db->fetchAll(
            "SELECT t.`{$codeColumn}` AS code, t.`{$amountColumn}` AS amount
               FROM `{$table}` t
              WHERE t.`effective_from` = (
                    SELECT MAX(x.`effective_from`) FROM `{$table}` x
                     WHERE x.`{$codeColumn}` = t.`{$codeColumn}` AND x.`effective_from` <= ?)",
            [$asOf]
        );
        $amounts = [];
        foreach ($rows as $row) {
            $amounts[(string) $row['code']] = Money::round((string) $row['amount']);
        }
        return $amounts;
    }

    /** Every manual change to a payroll line needs a written reason (spec §4, §9). */
    private function requireReason(string $reason): void
    {
        if (trim($reason) === '') {
            throw new InvalidArgumentException('A reason is required for this change.');
        }
    }

    private function firstOfMonth(string $date): string
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            throw new InvalidArgumentException("Period must be YYYY-MM-DD, got {$date}.");
        }
        return substr($date, 0, 8) . '01';
    }

    private function now(): string
    {
        return date('Y-m-d H:i:s');
    }

    private function scalar(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }
        return is_scalar($value) ? (string) $value : json_encode($value, JSON_THROW_ON_ERROR);
    }

    /**
     * @param array<string, mixed>|null $before
     * @param array<string, mixed>|null $after
     */
    private function audit(int $actorId, string $action, int $runId, ?array $before, ?array $after, string $reason = ''): void
    {
        $afterJson = $after === null ? null : json_encode($after + ($reason !== '' ? ['reason' => $reason] : []), JSON_THROW_ON_ERROR);
        $this->db->execute(
            'INSERT INTO `payroll_audit_log` (`actor_user_id`, `action`, `entity_type`, `entity_id`, `before_json`, `after_json`)
             VALUES (?, ?, ?, ?, ?, ?)',
            [
                $actorId,
                $action,
                'payroll_run',
                (string) $runId,
                $before === null ? null : json_encode($before, JSON_THROW_ON_ERROR),
                $afterJson,
            ]
        );
    }
}

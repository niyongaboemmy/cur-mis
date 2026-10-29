<?php

declare(strict_types=1);

namespace App\Payroll\PartTime;

use App\Payroll\Runs\LineInputFactory;
use App\Payroll\Runs\PayrollRunService;
use App\Payroll\Runs\RunSnapshot;
use App\Payroll\Runs\RunStatus;
use App\Payroll\Runs\RunTransitionException;
use Core\Database;
use InvalidArgumentException;

/**
 * Part-time module assignments: request, approval, documents, and hand-off to a payroll run.
 */
final class PartTimeWorkflow
{
    public function __construct(
        private Database $db,
        private PayrollRunService $runs,
    ) {
    }

    /** @param array<string, mixed> $details */
    public function request(int $employeeId, array $details, int $actorId): int
    {
        $programme = (string) ($details['programme'] ?? '');
        if (!in_array($programme, PartTimeRules::PROGRAMMES, true)) {
            throw new InvalidArgumentException('Programme must be Day, Weekend or Holiday.');
        }
        $credits = (int) ($details['credits'] ?? 0);
        $grade = (string) ($details['grade_code'] ?? '');
        if ($grade === '' || $this->db->fetchOne('SELECT `grade_code` FROM `hourly_rates` WHERE `grade_code` = ?', [$grade]) === false) {
            throw new InvalidArgumentException("Unknown hourly grade {$grade}.");
        }
        $start = (string) ($details['period_start'] ?? '');
        $end = (string) ($details['period_end'] ?? '');
        if ($start === '' || $end === '' || $end < $start) {
            throw new InvalidArgumentException('The teaching period is missing or ends before it starts.');
        }
        $zone = $details['transport_zone'] ?? null;
        if ($zone !== null && !in_array($zone, PartTimeRules::ZONES, true)) {
            throw new InvalidArgumentException('Transport zone must be KIGALI or OTHER.');
        }

        $this->db->execute(
            'INSERT INTO `pt_assignments`
                (`employee_id`, `module_code`, `module_title`, `programme`, `credits`, `hours_default`, `students`,
                 `grade_code`, `period_start`, `period_end`, `home_institution`, `origin_place`, `from_outside_huye`,
                 `accommodation_nights`, `transport_zone`, `transport_trips`, `status`, `requested_by`)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $employeeId,
                (string) ($details['module_code'] ?? ''),
                (string) ($details['module_title'] ?? ''),
                $programme,
                $credits,
                PartTimeRules::defaultHours($credits),
                isset($details['students']) ? (int) $details['students'] : null,
                $grade,
                $start,
                $end,
                $details['home_institution'] ?? null,
                $details['origin_place'] ?? null,
                !empty($details['from_outside_huye']) ? 1 : 0,
                (int) ($details['accommodation_nights'] ?? 0),
                $zone,
                (int) ($details['transport_trips'] ?? 0),
                PartTimeRules::REQUESTED,
                $actorId,
            ]
        );
        return (int) $this->db->lastInsertId();
    }

    /** Overrides the paid hours. The reason is kept with the assignment. */
    public function overrideHours(int $id, string $hours, string $reason): void
    {
        if (trim($reason) === '') {
            throw new InvalidArgumentException('A reason is required to change the hours.');
        }
        $assignment = $this->assignment($id);
        if (!PartTimeRules::hoursCanChange($assignment['status'])) {
            throw new RunTransitionException('Hours are locked once the assignment is with payroll.');
        }
        if (bccomp($hours, '0', 2) < 0) {
            throw new InvalidArgumentException('Hours cannot be negative.');
        }
        $this->db->execute(
            'UPDATE `pt_assignments` SET `hours_paid` = ?, `hours_override_reason` = ? WHERE `id` = ?',
            [$hours, $reason, $id]
        );
    }

    /** Moves an assignment one step along the workflow. DVCA approval must be done by someone else than the requester. */
    public function advance(int $id, int $actorId): string
    {
        $assignment = $this->assignment($id);
        $next = PartTimeRules::nextStatus($assignment['status']);
        if ($next === null) {
            throw new RunTransitionException("Assignment is already {$assignment['status']}.");
        }
        if ($next === PartTimeRules::SENT_TO_PAYROLL) {
            throw new RunTransitionException('Use sendToPayroll() to pass an assignment to a payroll run.');
        }
        if ($next === PartTimeRules::DVCA_APPROVED && (int) $assignment['requested_by'] === $actorId) {
            throw new RunTransitionException('The person who requested the module cannot approve it.');
        }

        $stamp = date('Y-m-d H:i:s');
        $sets = ['`status` = ?'];
        $values = [$next];
        if ($next === PartTimeRules::DVCA_APPROVED) {
            $sets[] = '`dvca_approved_by` = ?';
            $sets[] = '`dvca_approved_at` = ?';
            array_push($values, $actorId, $stamp);
        } elseif ($next === PartTimeRules::INVITED) {
            $sets[] = '`invitation_at` = ?';
            $values[] = $stamp;
        } elseif ($next === PartTimeRules::CONTRACTED) {
            $sets[] = '`contract_at` = ?';
            $values[] = $stamp;
        }
        $values[] = $id;
        $this->db->execute('UPDATE `pt_assignments` SET ' . implode(', ', $sets) . ' WHERE `id` = ?', $values);
        return $next;
    }

    /**
     * Adds the assignment as a line on a part-time run for the same month and marks it as sent.
     */
    public function sendToPayroll(int $id, int $runId, int $actorId): int
    {
        $assignment = $this->assignment($id);
        if ($assignment['status'] !== PartTimeRules::CONTRACTED) {
            throw new RunTransitionException('Only a contracted assignment can go to payroll.');
        }

        $run = $this->runs->run($runId);
        if ($run['scheme_code'] !== 'PART_TIME') {
            throw new InvalidArgumentException('Part-time assignments go to a PART_TIME run.');
        }
        if (substr((string) $assignment['period_start'], 0, 7) !== substr((string) $run['period_date'], 0, 7)) {
            throw new InvalidArgumentException('The module is not taught in the month of this run.');
        }

        $snapshot = RunSnapshot::read($run['snapshot_json']);
        $inputs = LineInputFactory::partTimeInputs($assignment, $snapshot['hourly_rates']);
        $lineId = $this->runs->addLine(
            $runId,
            (int) $assignment['employee_id'],
            (string) $assignment['module_code'],
            $inputs,
            $actorId,
            "Part-time assignment {$id}: {$assignment['module_code']}"
        );

        $this->db->execute(
            'UPDATE `pt_assignments` SET `status` = ?, `payroll_run_id` = ? WHERE `id` = ?',
            [PartTimeRules::SENT_TO_PAYROLL, $runId, $id]
        );
        return $lineId;
    }

    /** @return array<string, mixed> */
    public function assignment(int $id): array
    {
        $row = $this->db->fetchOne('SELECT * FROM `pt_assignments` WHERE `id` = ?', [$id]);
        if ($row === false) {
            throw new InvalidArgumentException("Part-time assignment {$id} not found.");
        }
        return $row;
    }

    /**
     * Reimbursement owed for an assignment (accommodation and transport), from the settings.
     *
     * @param array<string, mixed> $assignment
     * @param array<string, mixed> $settings   engine settings (contains part_time_allowances)
     * @return array{accommodation: int, transport: int, total: int}
     */
    public function reimbursement(array $assignment, array $settings): array
    {
        return PartTimeRules::allowances(
            (int) $assignment['accommodation_nights'],
            (bool) $assignment['from_outside_huye'],
            (string) ($assignment['transport_zone'] ?? 'OTHER'),
            (int) $assignment['transport_trips'],
            $settings['part_time_allowances'] ?? throw new InvalidArgumentException('Settings have no part_time_allowances.'),
        );
    }
}

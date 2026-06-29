<?php

declare(strict_types=1);

namespace App\Services;

use Core\Database;
use App\Models\FeeInvoiceModel;
use App\Models\ClearanceModel;

/**
 * ClearanceService — computes and stores financial clearance status.
 *
 * A student is AUTO-CLEARED when:
 *   (total_due - total_paid - total_bursary) <= CLEARANCE_THRESHOLD
 * The default threshold is 0 RWF.
 */
class ClearanceService
{
    private FeeInvoiceModel $invoiceModel;
    private ClearanceModel  $clearanceModel;
    private Database        $db;

    public function __construct()
    {
        $this->invoiceModel   = new FeeInvoiceModel();
        $this->clearanceModel = new ClearanceModel();
        $this->db             = Database::getInstance();
    }

    /**
     * Compute clearance status for a student in a given year.
     * Auto-saves to student_clearances if auto-clearable.
     *
     * @return array{status:string, balance:float, threshold:int, record:array|null}
     */
    public function computeAndSave(string $studentId, int $yearId, ?int $semester, int $actorId): array
    {
        $totals = $this->invoiceModel->getStudentLedgerTotals($studentId, $yearId);
        $balance = (float)(
            ($totals['total_due'] ?? 0) -
            ($totals['total_paid'] ?? 0) -
            ($totals['total_bursary'] ?? 0)
        );

        $threshold = $this->getThreshold($yearId);
        $autoCleared = $balance <= $threshold;
        $status      = $autoCleared ? 'cleared' : 'not_cleared';

        // Upsert record
        $this->clearanceModel->upsert([
            'student_id'           => $studentId,
            'academic_year_id'     => $yearId,
            'semester'             => $semester,
            'status'               => $status,
            'balance_at_clearance' => $balance,
            'auto_cleared'         => $autoCleared ? 1 : 0,
            'cleared_by'           => $autoCleared ? null : null,
            'cleared_at'           => $autoCleared ? date('Y-m-d H:i:s') : null,
        ]);

        $record = $this->clearanceModel->getForStudent($studentId, $yearId, $semester);

        return [
            'status'    => $status,
            'balance'   => $balance,
            'threshold' => $threshold,
            'record'    => $record,
        ];
    }

    /**
     * Manually grant clearance (override) for a student.
     */
    public function grantManual(
        string $studentId,
        int    $yearId,
        ?int   $semester,
        int    $actorId,
        string $notes = ''
    ): array {
        $totals  = $this->invoiceModel->getStudentLedgerTotals($studentId, $yearId);
        $balance = (float)(
            ($totals['total_due'] ?? 0) -
            ($totals['total_paid'] ?? 0) -
            ($totals['total_bursary'] ?? 0)
        );

        $this->clearanceModel->upsert([
            'student_id'           => $studentId,
            'academic_year_id'     => $yearId,
            'semester'             => $semester,
            'status'               => 'conditional',
            'balance_at_clearance' => $balance,
            'notes'                => $notes,
            'cleared_by'           => $actorId,
            'cleared_at'           => date('Y-m-d H:i:s'),
            'auto_cleared'         => 0,
        ]);

        return $this->clearanceModel->getForStudent($studentId, $yearId, $semester) ?? [];
    }

    /**
     * Run clearance computation for ALL students who have invoices in a year.
     * Returns counts of cleared / not_cleared.
     */
    public function runBulkClearance(int $yearId, int $actorId): array
    {
        $students = $this->db->fetchAll(
            "SELECT DISTINCT student_id FROM `fee_invoices`
             WHERE academic_year_id = ? AND fee_type != 'BURSARY_CREDIT'",
            [$yearId]
        );

        $cleared   = 0;
        $notCleared = 0;

        foreach ($students as $row) {
            $result = $this->computeAndSave($row['student_id'], $yearId, null, $actorId);
            $result['status'] === 'cleared' ? $cleared++ : $notCleared++;
        }

        return [
            'total'       => count($students),
            'cleared'     => $cleared,
            'not_cleared' => $notCleared,
        ];
    }

    /**
     * Get clearance status for a student without saving.
     * When $semester is provided, also computes payment-plan-aware exam eligibility.
     */
    public function getStatus(string $studentId, int $yearId, ?int $semester): array
    {
        $record = $this->clearanceModel->getForStudent($studentId, $yearId, $semester);

        $totals  = $this->invoiceModel->getStudentLedgerTotals($studentId, $yearId);
        $balance = (float)(
            ($totals['total_due'] ?? 0) -
            ($totals['total_paid'] ?? 0) -
            ($totals['total_bursary'] ?? 0)
        );

        $threshold = $this->getThreshold($yearId);

        $result = [
            'status'    => $record['status'] ?? ($balance <= $threshold ? 'cleared' : 'not_cleared'),
            'balance'   => $balance,
            'threshold' => $threshold,
            'record'    => $record,
            'totals'    => $totals,
        ];

        if ($semester !== null) {
            $result['exam_eligibility'] = $this->getExamEligibility($studentId, $yearId, $semester);
        }

        return $result;
    }

    /**
     * Compute payment-plan-aware exam eligibility for a semester.
     *
     * For each fee type the student has been invoiced:
     *   - full_year       : 100% must be paid before any exam
     *   - per_semester    : 50% for S1, 100% for S2
     *   - per_installment : floor(N × semester/2) / N  of annual fee
     *
     * "total_covered" = confirmed payments + confirmed bursary credits.
     */
    public function getExamEligibility(string $studentId, int $yearId, int $semester): array
    {
        $rows = $this->db->fetchAll(
            "SELECT fi.fee_type,
                    fi.fee_structure_id,
                    COALESCE(fs.payment_plan, 'full_year')   AS payment_plan,
                    COALESCE(fs.installment_count, 2)        AS installment_count,
                    COALESCE(fs.label, fi.fee_type)          AS structure_label,
                    fs.amount                                 AS structure_amount,
                    SUM(fi.amount_due)                        AS total_billed,
                    SUM(fi.amount_paid)                       AS total_paid,
                    SUM(fi.bursary_applied)                   AS total_bursary
             FROM `fee_invoices` fi
             LEFT JOIN `fee_structures` fs ON fs.id = fi.fee_structure_id
             WHERE fi.student_id       = ?
               AND fi.academic_year_id = ?
               AND fi.fee_type NOT IN ('ARREARS','BURSARY_CREDIT')
             GROUP BY fi.fee_type, fi.fee_structure_id",
            [$studentId, $yearId]
        );

        $items         = [];
        $totalRequired = 0.0;
        $totalCovered  = 0.0;
        $allEligible   = true;

        foreach ($rows as $row) {
            $plan    = $row['payment_plan'];
            $count   = max(2, (int)$row['installment_count']);
            $billed  = (float)$row['total_billed'];
            $covered = (float)$row['total_paid'] + (float)$row['total_bursary'];

            // Minimum amount that must be paid to sit exams this semester
            $minRequired = match ($plan) {
                'per_semester'    => $billed * ($semester / 2),
                'per_installment' => $billed * ((int)floor($count * $semester / 2) / $count),
                default           => $billed,  // full_year: pay everything first
            };

            $shortfall = max(0.0, round($minRequired - $covered, 2));
            $eligible  = $shortfall <= 0;
            if (!$eligible) $allEligible = false;

            // Build installment schedule for the UI
            $schedule = $this->buildInstallmentSchedule($plan, $count, $billed, $covered, $semester);

            $items[] = [
                'fee_type'          => $row['fee_type'],
                'label'             => $row['structure_label'],
                'payment_plan'      => $plan,
                'installment_count' => $count,
                'total_billed'      => $billed,
                'min_required'      => round($minRequired, 2),
                'total_covered'     => round($covered, 2),
                'shortfall'         => $shortfall,
                'eligible'          => $eligible,
                'schedule'          => $schedule,
            ];

            $totalRequired += $minRequired;
            $totalCovered  += $covered;
        }

        $totalShortfall = max(0.0, round($totalRequired - $totalCovered, 2));

        return [
            'semester'        => $semester,
            'eligible'        => $allEligible && count($items) > 0,
            'total_required'  => round($totalRequired, 2),
            'total_covered'   => round($totalCovered, 2),
            'total_shortfall' => $totalShortfall,
            'items'           => $items,
        ];
    }

    /**
     * Build an installment schedule array so the frontend can render
     * which installments are covered vs pending.
     */
    private function buildInstallmentSchedule(
        string $plan,
        int    $count,
        float  $billed,
        float  $covered,
        int    $examSemester
    ): array {
        if ($plan === 'full_year') {
            return [[
                'label'       => 'Full year',
                'amount'      => $billed,
                'cumulative'  => $billed,
                'for_exam_s'  => 1,   // required before S1 exams
                'covered'     => $covered >= $billed,
            ]];
        }

        $baseAmt   = (int)floor($billed / $count);
        $remainder = $billed - $baseAmt * ($count - 1);
        $cumulative = 0.0;
        $schedule   = [];

        for ($i = 1; $i <= $count; $i++) {
            $amount     = ($i === $count) ? $remainder : $baseAmt;
            $cumulative += $amount;

            // Which exam semester does this installment feed?
            $forExam = ($i <= (int)floor($count / 2)) ? 1 : 2;

            $schedule[] = [
                'label'      => $plan === 'per_semester'
                    ? "Semester {$i}"
                    : "Installment {$i}",
                'amount'     => $amount,
                'cumulative' => $cumulative,
                'for_exam_s' => $forExam,
                'covered'    => $covered >= $cumulative,
            ];
        }

        return $schedule;
    }

    /**
     * Generate a clearance report for all students in a fee structure + period.
     *
     * Period values:
     *   full_year        — 100 % of annual amount required
     *   semester_1       — amount due by end of Semester 1
     *   semester_2       — amount due by end of Semester 2 (= full annual)
     *   installment_N    — cumulative amount due through installment N
     */
    public function getReport(int $yearId, int $feeStructureId, string $period): array
    {
        $structure = $this->db->fetchOne(
            "SELECT fs.*, ay.label AS academic_year_label,
                    d.dep_name AS department_name, l.name AS level_name
             FROM `fee_structures` fs
             LEFT JOIN `academic_years` ay ON ay.id    = fs.academic_year_id
             LEFT JOIN `departements`   d  ON d.dep_id = fs.department_id
             LEFT JOIN `levels`         l  ON l.id     = fs.level_id
             WHERE fs.id = ?",
            [$feeStructureId]
        );

        if (!$structure) {
            throw new \InvalidArgumentException("Fee structure #{$feeStructureId} not found.");
        }

        $plan        = $structure['payment_plan'] ?? 'full_year';
        $count       = max(2, (int)($structure['installment_count'] ?? 2));
        $annualAmt   = (float)$structure['amount'];
        $requiredAmt = $this->computePeriodRequired($plan, $count, $annualAmt, $period);
        $periodLabel = $this->resolvePeriodLabel($period);

        $rows = $this->db->fetchAll(
            "SELECT fi.student_id,
                    s.regnumber, s.fname, s.lname,
                    dep.dep_name                    AS department_name,
                    SUM(fi.amount_due)              AS amount_billed,
                    SUM(fi.amount_paid)             AS amount_paid,
                    SUM(fi.bursary_applied)         AS bursary_applied
             FROM `fee_invoices` fi
             JOIN  `student` s         ON s.regnumber = fi.student_id COLLATE utf8mb4_unicode_ci
             LEFT JOIN `departements` dep ON dep.dep_id = s.department
             WHERE fi.academic_year_id = ?
               AND fi.fee_structure_id = ?
               AND fi.fee_type NOT IN ('ARREARS','BURSARY_CREDIT')
             GROUP BY fi.student_id, s.regnumber, s.fname, s.lname, dep.dep_name
             ORDER BY
               CASE WHEN (SUM(fi.amount_paid)+SUM(fi.bursary_applied)) = 0 THEN 0
                    WHEN (SUM(fi.amount_paid)+SUM(fi.bursary_applied)) < ? THEN 1
                    ELSE 2 END ASC,
               s.lname ASC, s.fname ASC",
            [$yearId, $feeStructureId, $requiredAmt]
        );

        $students       = [];
        $countCleared   = 0;
        $countPartial   = 0;
        $countNotPaid   = 0;
        $totalBilled    = 0.0;
        $totalCollected = 0.0;

        foreach ($rows as $row) {
            $covered   = (float)$row['amount_paid'] + (float)$row['bursary_applied'];
            $billed    = (float)$row['amount_billed'];
            $shortfall = $requiredAmt > 0 ? max(0.0, round($requiredAmt - $covered, 2)) : 0.0;

            if ($shortfall <= 0) {
                $status = 'cleared';
                $countCleared++;
            } elseif ($covered > 0) {
                $status = 'partial';
                $countPartial++;
            } else {
                $status = 'not_paid';
                $countNotPaid++;
            }

            $totalBilled    += $billed;
            $totalCollected += $covered;

            $students[] = [
                'student_id'           => $row['student_id'],
                'regnumber'            => $row['regnumber'],
                'fname'                => $row['fname'],
                'lname'                => $row['lname'],
                'department_name'      => $row['department_name'],
                'amount_billed'        => $billed,
                'amount_paid'          => (float)$row['amount_paid'],
                'bursary_applied'      => (float)$row['bursary_applied'],
                'total_covered'        => round($covered, 2),
                'required_this_period' => $requiredAmt,
                'shortfall'            => $shortfall,
                'status'               => $status,
            ];
        }

        return [
            'fee_structure'   => $structure,
            'period'          => $period,
            'period_label'    => $periodLabel,
            'required_amount' => $requiredAmt,
            'summary'         => [
                'total'           => count($students),
                'cleared'         => $countCleared,
                'partial'         => $countPartial,
                'not_paid'        => $countNotPaid,
                'total_billed'    => round($totalBilled, 2),
                'total_collected' => round($totalCollected, 2),
            ],
            'students'        => $students,
        ];
    }

    private function computePeriodRequired(string $plan, int $count, float $annual, string $period): float
    {
        if ($period === 'full_year') return $annual;

        if (preg_match('/^semester_(\d+)$/', $period, $m)) {
            $sem = (int)$m[1];
            return match ($plan) {
                'per_semester'    => $annual * ($sem / 2),
                'per_installment' => $this->cumulativeInstallments($count, $annual, (int)floor($count * $sem / 2)),
                default           => $annual,
            };
        }

        if (preg_match('/^installment_(\d+)$/', $period, $m)) {
            return $this->cumulativeInstallments($count, $annual, min((int)$m[1], $count));
        }

        return $annual;
    }

    private function cumulativeInstallments(int $count, float $annual, int $upTo): float
    {
        $base      = (int)floor($annual / $count);
        $remainder = $annual - $base * ($count - 1);
        $total     = 0.0;
        for ($i = 1; $i <= $upTo && $i <= $count; $i++) {
            $total += ($i === $count) ? $remainder : $base;
        }
        return $total;
    }

    private function resolvePeriodLabel(string $period): string
    {
        if ($period === 'full_year') return 'Full Year';
        if (preg_match('/^semester_(\d+)$/', $period, $m)) return "Semester {$m[1]}";
        if (preg_match('/^installment_(\d+)$/', $period, $m)) return "Installment {$m[1]}";
        return 'Full Year';
    }

    private function getThreshold(int $yearId): float
    {
        $year = (new \App\Models\AcademicYearModel())->find($yearId);
        return (float)($year['clearance_threshold'] ?? 0);
    }
}

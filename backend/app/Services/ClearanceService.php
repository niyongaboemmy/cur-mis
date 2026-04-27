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
     */
    public function getStatus(string $studentId, int $yearId, ?int $semester): array
    {
        // Check if a saved record exists
        $record = $this->clearanceModel->getForStudent($studentId, $yearId, $semester);

        // Also compute live balance
        $totals  = $this->invoiceModel->getStudentLedgerTotals($studentId, $yearId);
        $balance = (float)(
            ($totals['total_due'] ?? 0) -
            ($totals['total_paid'] ?? 0) -
            ($totals['total_bursary'] ?? 0)
        );

        $threshold = $this->getThreshold($yearId);

        return [
            'status'    => $record['status'] ?? ($balance <= $threshold ? 'cleared' : 'not_cleared'),
            'balance'   => $balance,
            'threshold' => $threshold,
            'record'    => $record,
            'totals'    => $totals,
        ];
    }

    private function getThreshold(int $yearId): float
    {
        $year = (new \App\Models\AcademicYearModel())->find($yearId);
        return (float)($year['clearance_threshold'] ?? 0);
    }
}

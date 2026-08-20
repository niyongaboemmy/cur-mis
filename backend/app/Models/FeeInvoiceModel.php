<?php

declare(strict_types=1);

namespace App\Models;

class FeeInvoiceModel extends BaseModel
{
    protected string $table = 'fee_invoices';
    protected array $fillable = [
        'invoice_number', 'student_id', 'fee_structure_id', 'academic_year_id',
        'semester', 'fee_type', 'description', 'amount_due', 'amount_paid',
        'bursary_applied', 'due_date', 'status', 'is_system_generated',
        'module_id', 'created_by',
    ];

    /** @param array{student_id?:string,academic_year_id?:int,semester?:int,fee_type?:string,status?:string} $filters */
    public function listWithDetails(array $filters = []): array
    {
        $where    = [];
        $bindings = [];

        if (!empty($filters['student_id'])) {
            $where[]    = 'fi.student_id COLLATE utf8mb4_unicode_ci = ?';
            $bindings[] = $filters['student_id'];
        }
        if (!empty($filters['academic_year_id'])) {
            $where[]    = 'fi.academic_year_id = ?';
            $bindings[] = (int)$filters['academic_year_id'];
        }
        if (!empty($filters['semester'])) {
            $where[]    = 'fi.semester = ?';
            $bindings[] = (int)$filters['semester'];
        }
        if (!empty($filters['fee_type'])) {
            $where[]    = 'fi.fee_type = ?';
            $bindings[] = $filters['fee_type'];
        }
        if (!empty($filters['status'])) {
            $where[]    = 'fi.status = ?';
            $bindings[] = $filters['status'];
        }

        $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

        return $this->db->fetchAll(
            "SELECT fi.*,
                    ay.label AS academic_year_label
             FROM `fee_invoices` fi
             LEFT JOIN `academic_years` ay ON ay.id = fi.academic_year_id
             {$whereSql}
             ORDER BY fi.created_at DESC",
            $bindings
        );
    }

    /** Student ledger: all invoices + running balance totals. */
    public function getStudentLedgerTotals(string $studentId, int $academicYearId): array
    {
        return $this->db->fetchOne(
            "SELECT
               SUM(fi.amount_due)                                           AS total_due,
               SUM(fi.amount_paid)                                          AS total_paid,
               SUM(fi.bursary_applied)                                      AS total_bursary,
               SUM(fi.amount_due - fi.amount_paid - fi.bursary_applied)     AS balance,
               SUM(CASE WHEN fi.status IN ('unpaid','overdue') THEN 1 ELSE 0 END) AS unpaid_count,
               (SELECT COALESCE(SUM(fp.amount),0) FROM fee_payments fp
                  WHERE fp.student_id COLLATE utf8mb4_unicode_ci = ? AND fp.status = 'confirmed' AND fp.source = 'GATEWAY') AS total_paid_gateway,
               (SELECT COALESCE(SUM(fp.amount),0) FROM fee_payments fp
                  WHERE fp.student_id COLLATE utf8mb4_unicode_ci = ? AND fp.status = 'confirmed' AND COALESCE(fp.source,'MANUAL') != 'GATEWAY') AS total_paid_manual
             FROM `fee_invoices` fi
             WHERE fi.student_id COLLATE utf8mb4_unicode_ci = ? AND fi.academic_year_id = ? AND fi.fee_type != 'BURSARY_CREDIT'",
            [$studentId, $studentId, $studentId, $academicYearId]
        ) ?: ['total_due' => 0, 'total_paid' => 0, 'total_bursary' => 0, 'balance' => 0, 'unpaid_count' => 0, 'total_paid_gateway' => 0, 'total_paid_manual' => 0];
    }

    /** Check if a student already has a system-generated invoice of this type for the year. */
    public function studentHasInvoice(
        string $studentId,
        int $academicYearId,
        string $feeType,
        ?int $moduleId = null
    ): bool {
        $sql      = "SELECT id FROM `fee_invoices`
                     WHERE student_id COLLATE utf8mb4_unicode_ci = ? AND academic_year_id = ? AND fee_type = ?";
        $bindings = [$studentId, $academicYearId, $feeType];

        if ($moduleId !== null) {
            $sql      .= ' AND module_id = ?';
            $bindings[] = $moduleId;
        }

        return (bool)$this->db->fetchOne($sql . ' LIMIT 1', $bindings);


    }

    /** Recalculate and save the status of an invoice after a payment. */
    public function recalculateStatus(int $invoiceId): void
    {
        $invoice = $this->find($invoiceId);
        if (!$invoice) {
            return;
        }

        $amountDue  = (float)$invoice['amount_due'];
        $amountPaid = (float)$invoice['amount_paid'];
        $bursary    = (float)$invoice['bursary_applied'];
        $remaining  = $amountDue - $amountPaid - $bursary;

        if ($invoice['status'] === 'waived') {
            return;
        }

        if ($remaining <= 0) {
            $status = 'paid';
        } elseif ($amountPaid > 0 || $bursary > 0) {
            $status = 'partial';
        } elseif ($invoice['due_date'] && $invoice['due_date'] < date('Y-m-d')) {
            $status = 'overdue';
        } else {
            $status = 'unpaid';
        }

        $this->db->execute(
            "UPDATE `fee_invoices` SET status = ?, updated_at = NOW() WHERE id = ?",
            [$status, $invoiceId]
        );
    }

    /** All overdue invoices (for dashboard alerts). */
    public function getOverdueInvoices(int $limit = 100): array
    {
        return $this->db->fetchAll(
            "SELECT fi.*, s.fname, s.lname, ay.label AS academic_year_label
             FROM `fee_invoices` fi
             LEFT JOIN `student` s       ON s.regnumber COLLATE utf8mb4_unicode_ci = fi.student_id COLLATE utf8mb4_unicode_ci
             LEFT JOIN `academic_years` ay ON ay.id = fi.academic_year_id
             WHERE fi.due_date < CURDATE()
               AND fi.status IN ('unpaid', 'partial')
               AND fi.fee_type != 'BURSARY_CREDIT'
             ORDER BY fi.due_date ASC
             LIMIT ?",
            [$limit]
        );
    }

    /** Revenue summary grouped by fee_type for a given year. */
    public function getRevenueSummary(int $academicYearId): array
    {
        return $this->db->fetchAll(
            "SELECT fi.fee_type,
                    COUNT(fi.id)                                              AS invoice_count,
                    SUM(fi.amount_due)                                        AS total_expected,
                    SUM(fi.amount_paid)                                       AS total_collected,
                    SUM(fi.bursary_applied)                                   AS total_bursary,
                    COALESCE(SUM(CASE WHEN fp.source = 'APPLICATION_TRANSFER'
                                      THEN fp.amount END), 0)                 AS app_transfer_amount,
                    COUNT(DISTINCT CASE WHEN fp.source = 'APPLICATION_TRANSFER'
                                        THEN fp.id END)                       AS app_transfer_count
             FROM `fee_invoices` fi
             LEFT JOIN `fee_payments` fp
                    ON fp.invoice_id = fi.id
                   AND fp.status     = 'confirmed'
             WHERE fi.academic_year_id = ? AND fi.fee_type != 'BURSARY_CREDIT'
             GROUP BY fi.fee_type
             ORDER BY total_collected DESC",
            [$academicYearId]
        );
    }
    /** Apply a confirmed payment amount to an invoice. */
    public function applyPayment(int $invoiceId, float $amount): void
    {
        $this->db->execute(
            "UPDATE `fee_invoices` SET amount_paid = amount_paid + ?, updated_at = NOW() WHERE id = ?",
            [$amount, $invoiceId]
        );
        $this->recalculateStatus($invoiceId);
    }
}

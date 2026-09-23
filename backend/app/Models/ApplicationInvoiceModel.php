<?php

declare(strict_types=1);

namespace App\Models;

/**
 * ApplicationInvoiceModel
 *
 * The fees an ADMITTED APPLICANT owes between the admission offer and the
 * registration number (migration 140) — Registration and CURSU by default.
 *
 * Deliberately separate from `fee_invoices`: that table keys on a regnumber,
 * and an applicant has no regnumber until enrollment, which is precisely the
 * step these bills gate. Once the applicant enrolls, FeeService credits what
 * they paid here onto the real invoices.
 */
class ApplicationInvoiceModel extends BaseModel
{
    protected string $table = 'application_invoices';
    protected array $fillable = [
        'application_id', 'fee_structure_id', 'fee_type', 'label', 'service_code',
        'amount_due', 'amount_paid', 'currency', 'status',
        'transaction_id', 'paid_at', 'billed_by', 'billed_at',
    ];
    protected array $hidden = [];

    /** Every bill on an application, in the order they were raised. */
    public function forApplication(int $applicationId): array
    {
        return $this->db->fetchAll(
            "SELECT * FROM `application_invoices`
              WHERE application_id = ? AND status <> 'cancelled'
              ORDER BY id ASC",
            [$applicationId]
        );
    }

    /** Bills with money still owed, oldest first. */
    public function openForApplication(int $applicationId): array
    {
        return $this->db->fetchAll(
            "SELECT * FROM `application_invoices`
              WHERE application_id = ?
                AND status IN ('unpaid', 'partial')
                AND amount_due > amount_paid
              ORDER BY id ASC",
            [$applicationId]
        );
    }

    public function findByFeeType(int $applicationId, string $feeType): array|false
    {
        return $this->db->fetchOne(
            "SELECT * FROM `application_invoices`
              WHERE application_id = ? AND fee_type = ? LIMIT 1",
            [$applicationId, $feeType]
        );
    }

    /**
     * Add $amount to a bill and recompute its status in the same statement, so
     * two callbacks landing together cannot both read the old amount_paid and
     * each write a half-settled total.
     *
     * ORDER OF THE SET CLAUSES IS LOAD-BEARING. MySQL evaluates assignments
     * left to right and later expressions see values already written by earlier
     * ones, so `status` and `paid_at` — which need the balance BEFORE this
     * payment — must be assigned before `amount_paid`. With `amount_paid` first,
     * `amount_paid + ?` counts the payment twice and a 30,000 part-payment on a
     * 50,000 bill marks it 'paid', which would walk the applicant straight
     * through the enrollment gate still owing 20,000.
     */
    public function applyPayment(int $invoiceId, float $amount, string $txCode, string $paidAt): void
    {
        $this->db->execute(
            "UPDATE `application_invoices`
                SET status         = CASE
                                       WHEN amount_paid + ? >= amount_due THEN 'paid'
                                       ELSE 'partial'
                                     END,
                    paid_at        = CASE
                                       WHEN amount_paid + ? >= amount_due THEN ?
                                       ELSE paid_at
                                     END,
                    transaction_id = ?,
                    amount_paid    = LEAST(amount_due, amount_paid + ?),
                    updated_at     = NOW()
              WHERE id = ?",
            [$amount, $amount, $paidAt, $txCode, $amount, $invoiceId]
        );
    }

    /**
     * Totals across an application's live bills.
     *
     * `fully_paid` is false when nothing has been billed at all — "no bills" is
     * not "all bills settled", and letting it read as settled would open the
     * enrollment gate on an applicant who has paid nothing.
     *
     * @return array{total_due:float,total_paid:float,balance:float,count:int,paid_count:int,fully_paid:bool}
     */
    public function summaryFor(int $applicationId): array
    {
        $row = $this->db->fetchOne(
            "SELECT COUNT(*)                                            AS cnt,
                    COALESCE(SUM(amount_due), 0)                        AS total_due,
                    COALESCE(SUM(amount_paid), 0)                       AS total_paid,
                    COALESCE(SUM(status = 'paid'), 0)                   AS paid_count
               FROM `application_invoices`
              WHERE application_id = ? AND status <> 'cancelled'",
            [$applicationId]
        ) ?: [];

        $count     = (int)($row['cnt'] ?? 0);
        $totalDue  = (float)($row['total_due'] ?? 0);
        $totalPaid = (float)($row['total_paid'] ?? 0);

        return [
            'total_due'  => $totalDue,
            'total_paid' => $totalPaid,
            'balance'    => max(0.0, round($totalDue - $totalPaid, 2)),
            'count'      => $count,
            'paid_count' => (int)($row['paid_count'] ?? 0),
            'fully_paid' => $count > 0 && $totalPaid + 0.001 >= $totalDue,
        ];
    }
}

<?php

declare(strict_types=1);

namespace App\Models;

class FeePaymentModel extends BaseModel
{
    protected string $table = 'fee_payments';
    protected array $fillable = [
        'invoice_id', 'student_id', 'amount', 'payment_method', 'payment_sub_method',
        'reference_number', 'bank_slip_file_id', 'receipt_number',
        'status', 'notes', 'recorded_by', 'paid_at',
        'confirmed_by', 'confirmed_at', 'rejection_reason',
    ];

    /** @param array{student_id?:string,invoice_id?:int,payment_method?:string,status?:string,from_date?:string,to_date?:string} $filters */
    public function listWithDetails(array $filters = [], int $page = 1, int $perPage = 20): array
    {
        $where    = [];
        $bindings = [];

        if (!empty($filters['student_id'])) {
            $where[]    = 'fp.student_id = ?';
            $bindings[] = $filters['student_id'];
        }
        if (!empty($filters['invoice_id'])) {
            $where[]    = 'fp.invoice_id = ?';
            $bindings[] = (int)$filters['invoice_id'];
        }
        if (!empty($filters['payment_method'])) {
            $where[]    = 'fp.payment_method = ?';
            $bindings[] = $filters['payment_method'];
        }
        if (!empty($filters['status'])) {
            $where[]    = 'fp.status = ?';
            $bindings[] = $filters['status'];
        }
        if (!empty($filters['from_date'])) {
            $where[]    = 'DATE(fp.paid_at) >= ?';
            $bindings[] = $filters['from_date'];
        }
        if (!empty($filters['to_date'])) {
            $where[]    = 'DATE(fp.paid_at) <= ?';
            $bindings[] = $filters['to_date'];
        }

        $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';
        $offset   = ($page - 1) * $perPage;

        $total = (int)($this->db->fetchOne(
            "SELECT COUNT(*) AS cnt FROM `fee_payments` fp {$whereSql}",
            $bindings
        )['cnt'] ?? 0);

        $rows = $this->db->fetchAll(
            "SELECT fp.*,
                    fi.invoice_number, fi.fee_type, fi.description AS invoice_description,
                    fi.academic_year_id,
                    s.fname AS student_fname, s.lname AS student_lname,
                    u.full_name  AS recorded_by_name
             FROM `fee_payments` fp
             LEFT JOIN `fee_invoices` fi ON fi.id = fp.invoice_id
             LEFT JOIN `student` s       ON s.regnumber = fp.student_id
             LEFT JOIN `users` u         ON u.id = fp.recorded_by
             {$whereSql}
             ORDER BY fp.paid_at DESC
             LIMIT {$perPage} OFFSET {$offset}",
            $bindings
        );

        return [
            'data'         => $rows,
            'total'        => $total,
            'per_page'     => $perPage,
            'current_page' => $page,
            'last_page'    => (int)ceil($total / $perPage),
        ];
    }

    /** Full receipt data for PDF generation. */
    public function getReceiptData(int $paymentId): array|false
    {
        return $this->db->fetchOne(
            "SELECT fp.*,
                    fi.invoice_number, fi.fee_type, fi.description AS invoice_description,
                    fi.academic_year_id,
                    ay.label AS academic_year_label,
                    s.fname, s.lname, s.regnumber,
                    f.fac_name  AS faculty_name,
                    d.dep_name  AS department_name,
                    s.combination AS option_name,
                    l.name      AS level_name,
                    u.full_name  AS recorded_by_name
             FROM `fee_payments` fp
             JOIN  `fee_invoices`  fi ON fi.id = fp.invoice_id
             LEFT JOIN `academic_years` ay ON ay.id   = fi.academic_year_id
             LEFT JOIN `student`    s  ON s.regnumber = fp.student_id
             LEFT JOIN `faculty`      f  ON f.fac_id   = s.faculty
             LEFT JOIN `departements` d  ON d.dep_id  = COALESCE(
                 NULLIF(CAST(s.department AS UNSIGNED), 0),
                 (SELECT dep_id FROM `departements` WHERE dep_acronym = s.department LIMIT 1)
             )
             LEFT JOIN `levels`       l  ON l.id      = CAST(s.current_level AS UNSIGNED)
             LEFT JOIN `users`      u  ON u.id        = fp.recorded_by
             WHERE fp.id = ?
             LIMIT 1",
            [$paymentId]
        );
    }

    /** Total collected for a student in a given academic year. */
    public function totalPaidByStudent(string $studentId, int $academicYearId): float
    {
        $row = $this->db->fetchOne(
            "SELECT SUM(fp.amount) AS total
             FROM `fee_payments` fp
             JOIN `fee_invoices` fi ON fi.id = fp.invoice_id
             WHERE fp.student_id = ? AND fi.academic_year_id = ? AND fp.status = 'confirmed'",
            [$studentId, $academicYearId]
        );
        return (float)($row['total'] ?? 0);
    }

    /** Count payments awaiting approval. */
    public function getPendingCount(): int
    {
        $row = $this->db->fetchOne("SELECT COUNT(*) AS cnt FROM `fee_payments` WHERE status = 'pending'", []);
        return (int)($row['cnt'] ?? 0);
    }
}

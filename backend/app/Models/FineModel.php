<?php

declare(strict_types=1);

namespace App\Models;

class FineModel extends BaseModel
{
    protected string $table = 'fee_fines';
    protected array $fillable = [
        'student_id', 'fine_type', 'reason', 'amount', 'status',
        'invoice_id', 'notes', 'issued_by', 'waived_by', 'waived_at',
    ];

    /** @param array{student_id?:string,status?:string,fine_type?:string} $filters */
    public function listWithDetails(array $filters = [], int $page = 1, int $perPage = 50): array
    {
        $where    = [];
        $bindings = [];

        if (!empty($filters['student_id'])) {
            $where[]    = 'ff.student_id COLLATE utf8mb4_unicode_ci = ?';
            $bindings[] = $filters['student_id'];
        }
        if (!empty($filters['status'])) {
            $where[]    = 'ff.status = ?';
            $bindings[] = $filters['status'];
        }
        if (!empty($filters['fine_type'])) {
            $where[]    = 'ff.fine_type = ?';
            $bindings[] = $filters['fine_type'];
        }
        if (!empty($filters['search'])) {
            $where[]    = '(s.fname LIKE ? OR s.lname LIKE ? OR ff.student_id LIKE ? OR ff.reason LIKE ?)';
            $term       = '%' . $filters['search'] . '%';
            $bindings   = array_merge($bindings, [$term, $term, $term, $term]);
        }

        $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';
        $offset   = ($page - 1) * $perPage;

        $countRow = $this->db->fetchOne(
            "SELECT COUNT(*) AS cnt
             FROM `fee_fines` ff
             LEFT JOIN `student` s ON s.regnumber = ff.student_id COLLATE utf8mb4_unicode_ci
             {$whereSql}",
            $bindings
        );
        $total = (int)($countRow['cnt'] ?? 0);

        $rows = $this->db->fetchAll(
            "SELECT ff.*,
                    CONCAT(s.fname, ' ', s.lname) AS student_name,
                    s.email                        AS student_email,
                    fi.invoice_number,
                    fi.status                      AS invoice_status,
                    fi.amount_due                  AS invoice_amount_due,
                    fi.amount_paid                 AS invoice_amount_paid,
                    u.full_name                    AS issued_by_name,
                    w.full_name                    AS waived_by_name
             FROM `fee_fines` ff
             LEFT JOIN `student` s     ON s.regnumber = ff.student_id
             LEFT JOIN `fee_invoices` fi ON fi.id = ff.invoice_id
             LEFT JOIN `users` u       ON u.id = ff.issued_by
             LEFT JOIN `users` w       ON w.id = ff.waived_by
             {$whereSql}
             ORDER BY ff.created_at DESC
             LIMIT ? OFFSET ?",
            array_merge($bindings, [$perPage, $offset])
        );

        return [
            'data'         => $rows,
            'total'        => $total,
            'per_page'     => $perPage,
            'current_page' => $page,
            'last_page'    => (int)ceil($total / $perPage),
        ];
    }

    public function findWithDetails(int $id): ?array
    {
        return $this->db->fetchOne(
            "SELECT ff.*,
                    CONCAT(s.fname, ' ', s.lname) AS student_name,
                    s.email                        AS student_email,
                    fi.invoice_number,
                    fi.status                      AS invoice_status
             FROM `fee_fines` ff
             LEFT JOIN `student` s     ON s.regnumber = ff.student_id
             LEFT JOIN `fee_invoices` fi ON fi.id = ff.invoice_id
             WHERE ff.id = ?",
            [$id]
        ) ?: null;
    }

    public function getSummary(): array
    {
        return $this->db->fetchOne(
            "SELECT
               COUNT(*) AS total_fines,
               SUM(amount) AS total_amount,
               SUM(CASE WHEN status = 'pending'  THEN 1 ELSE 0 END) AS pending_count,
               SUM(CASE WHEN status = 'invoiced' THEN 1 ELSE 0 END) AS invoiced_count,
               SUM(CASE WHEN status = 'waived'   THEN 1 ELSE 0 END) AS waived_count,
               SUM(CASE WHEN status = 'paid'     THEN 1 ELSE 0 END) AS paid_count,
               SUM(CASE WHEN status = 'pending'  THEN amount ELSE 0 END) AS pending_amount,
               SUM(CASE WHEN status = 'invoiced' THEN amount ELSE 0 END) AS invoiced_amount,
               SUM(CASE WHEN status = 'paid'     THEN amount ELSE 0 END) AS collected_amount
             FROM `fee_fines`"
        ) ?: [];
    }
}

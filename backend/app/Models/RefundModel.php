<?php

declare(strict_types=1);

namespace App\Models;

class RefundModel extends BaseModel
{
    protected string $table = 'fee_refunds';
    protected array $fillable = [
        'student_id', 'payment_id', 'amount', 'category', 'reason', 'status', 'processed_by', 'notes',
    ];

    /** List refunds with student name join, paginated. */
    public function listWithDetails(array $filters = [], int $page = 1, int $perPage = 20): array
    {
        $where    = [];
        $bindings = [];

        if (!empty($filters['student_id'])) {
            $where[]    = 'fr.student_id COLLATE utf8mb4_unicode_ci = ?';
            $bindings[] = $filters['student_id'];
        }
        if (!empty($filters['status'])) {
            $where[]    = 'fr.status = ?';
            $bindings[] = $filters['status'];
        }
        if (!empty($filters['category'])) {
            $where[]    = 'fr.category = ?';
            $bindings[] = $filters['category'];
        }

        $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';
        $offset   = ($page - 1) * $perPage;

        $total = (int)($this->db->fetchOne(
            "SELECT COUNT(*) AS n FROM `fee_refunds` fr {$whereSql}",
            $bindings
        )['n'] ?? 0);

        $rows = $this->db->fetchAll(
            "SELECT fr.*,
                    s.fname  AS student_fname,
                    s.lname  AS student_lname,
                    u.full_name AS processed_by_name
             FROM `fee_refunds` fr
             LEFT JOIN `student` s ON s.regnumber COLLATE utf8mb4_unicode_ci = fr.student_id COLLATE utf8mb4_unicode_ci
             LEFT JOIN `users`   u ON u.id = fr.processed_by
             {$whereSql}
             ORDER BY fr.created_at DESC
             LIMIT {$perPage} OFFSET {$offset}",
            $bindings
        );

        return [
            'data'         => $rows,
            'total'        => $total,
            'per_page'     => $perPage,
            'current_page' => $page,
            'last_page'    => (int)ceil($total / max(1, $perPage)),
        ];
    }
}

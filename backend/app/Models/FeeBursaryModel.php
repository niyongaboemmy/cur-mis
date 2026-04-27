<?php

declare(strict_types=1);

namespace App\Models;

class FeeBursaryModel extends BaseModel
{
    protected string $table = 'fee_bursaries';
    protected array $fillable = [
        'student_id', 'academic_year_id', 'bursary_type',
        'amount', 'coverage_pct', 'approved_by', 'notes',
        'status', 'confirmed_at', 'confirmed_by',
    ];

    /** @param array{student_id?:string,academic_year_id?:int} $filters */
    public function listWithDetails(array $filters = [], int $page = 1, int $perPage = 20): array
    {
        $where    = [];
        $bindings = [];

        if (!empty($filters['student_id'])) {
            $where[]    = 'fb.student_id = ?';
            $bindings[] = $filters['student_id'];
        }
        if (!empty($filters['academic_year_id'])) {
            $where[]    = 'fb.academic_year_id = ?';
            $bindings[] = (int)$filters['academic_year_id'];
        }

        $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';
        $offset   = ($page - 1) * $perPage;

        $total = (int)($this->db->fetchOne(
            "SELECT COUNT(*) AS cnt FROM `fee_bursaries` fb {$whereSql}",
            $bindings
        )['cnt'] ?? 0);

        $rows = $this->db->fetchAll(
            "SELECT fb.*,
                    s.fname AS student_fname, s.lname AS student_lname,
                    ay.label AS academic_year_label,
                    u.full_name   AS approved_by_name,
                    u2.full_name  AS confirmed_by_name
             FROM `fee_bursaries` fb
             LEFT JOIN `student`       s  ON s.regnumber = fb.student_id
             LEFT JOIN `academic_years` ay ON ay.id = fb.academic_year_id
             LEFT JOIN `users`         u  ON u.id = fb.approved_by
             LEFT JOIN `users`         u2 ON u2.id = fb.confirmed_by
             {$whereSql}
             ORDER BY fb.created_at DESC
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

    /** Total bursary allocated to a student for the year. */
    public function totalForStudent(string $studentId, int $academicYearId): float
    {
        $row = $this->db->fetchOne(
            "SELECT SUM(amount) AS total FROM `fee_bursaries`
             WHERE student_id = ? AND academic_year_id = ? AND status = 'confirmed'",
            [$studentId, $academicYearId]
        );
        return (float)($row['total'] ?? 0);
    }
}

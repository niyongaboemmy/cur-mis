<?php

declare(strict_types=1);

namespace App\Models;

class FeeBursaryModel extends BaseModel
{
    protected string $table = 'fee_bursaries';
    protected array $fillable = [
        'student_id', 'academic_year_id', 'bursary_type',
        'amount', 'coverage_pct', 'approved_by', 'notes', 'sponsor_id',
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
        if (!empty($filters['status'])) {
            $where[]    = 'fb.status = ?';
            $bindings[] = $filters['status'];
        }
        if (!empty($filters['bursary_type'])) {
            $where[]    = 'fb.bursary_type = ?';
            $bindings[] = $filters['bursary_type'];
        }
        if (isset($filters['sponsor_id']) && $filters['sponsor_id'] !== '' && $filters['sponsor_id'] !== null) {
            $sid = $filters['sponsor_id'];
            if ($sid === 'unassigned' || $sid === 'none' || $sid === '0' || $sid === 0) {
                $where[] = '(fb.sponsor_id IS NULL OR fb.sponsor_id = 0)';
            } else {
                $where[]    = 'fb.sponsor_id = ?';
                $bindings[] = (int)$sid;
            }
        }

        $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';
        $offset   = ($page - 1) * $perPage;

        $agg = $this->db->fetchOne(
            "SELECT
                COUNT(*)                                                       AS total_count,
                COUNT(DISTINCT fb.student_id)                                  AS distinct_students,
                COALESCE(SUM(fb.amount), 0)                                    AS total_amount,
                COALESCE(SUM(CASE WHEN fb.status='confirmed' THEN fb.amount ELSE 0 END), 0) AS confirmed_amount,
                COALESCE(SUM(CASE WHEN fb.status='pending'   THEN fb.amount ELSE 0 END), 0) AS pending_amount,
                COALESCE(SUM(CASE WHEN fb.status='cancelled' THEN fb.amount ELSE 0 END), 0) AS cancelled_amount,
                COUNT(CASE WHEN fb.status='confirmed' THEN 1 END)              AS confirmed_count,
                COUNT(CASE WHEN fb.status='pending'   THEN 1 END)              AS pending_count,
                COUNT(CASE WHEN fb.status='cancelled' THEN 1 END)              AS cancelled_count
             FROM `fee_bursaries` fb
             {$whereSql}",
            $bindings
        );

        $total = (int)($agg['total_count'] ?? 0);

        $rows = $this->db->fetchAll(
            "SELECT fb.*,
                    s.fname  AS student_fname, s.lname AS student_lname,
                    ay.label AS academic_year_label,
                    u.full_name  AS approved_by_name,
                    u2.full_name AS confirmed_by_name,
                    sp.name      AS sponsor_name
             FROM `fee_bursaries` fb
             LEFT JOIN `student`        s  ON s.regnumber = fb.student_id
             LEFT JOIN `academic_years` ay ON ay.id       = fb.academic_year_id
             LEFT JOIN `users`          u  ON u.id        = fb.approved_by
             LEFT JOIN `users`          u2 ON u2.id       = fb.confirmed_by
             LEFT JOIN `sponsors`       sp ON sp.id       = fb.sponsor_id
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
            'aggregates'   => [
                'total_count'        => $total,
                'distinct_students'  => (int)($agg['distinct_students']  ?? 0),
                'total_amount'       => (float)($agg['total_amount']      ?? 0),
                'confirmed_amount'   => (float)($agg['confirmed_amount']  ?? 0),
                'pending_amount'     => (float)($agg['pending_amount']    ?? 0),
                'cancelled_amount'   => (float)($agg['cancelled_amount']  ?? 0),
                'confirmed_count'    => (int)($agg['confirmed_count']     ?? 0),
                'pending_count'      => (int)($agg['pending_count']       ?? 0),
                'cancelled_count'    => (int)($agg['cancelled_count']     ?? 0),
            ],
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

    /** Summary of bursaries not linked to any sponsor for a given year. */
    public function getUnassignedSummary(int $academicYearId): array
    {
        return $this->db->fetchOne(
            "SELECT 
                COALESCE(SUM(amount), 0) AS total_amount,
                COALESCE(SUM(CASE WHEN status='confirmed' THEN amount ELSE 0 END), 0) AS confirmed_amount,
                COUNT(id) AS bursary_count,
                COUNT(DISTINCT student_id) AS student_count
             FROM `fee_bursaries`
             WHERE academic_year_id = ? AND (sponsor_id IS NULL OR sponsor_id = 0)",
            [$academicYearId]
        );
    }
}

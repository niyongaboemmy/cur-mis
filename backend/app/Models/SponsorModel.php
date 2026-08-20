<?php

declare(strict_types=1);

namespace App\Models;

class SponsorModel extends BaseModel
{
    protected string $table = 'sponsors';
    protected array $fillable = ['name', 'email', 'phone', 'is_active'];

    /** Return all sponsors, optionally filtered to active-only. */
    public function listAll(bool $activeOnly = false): array
    {
        $where = $activeOnly ? 'WHERE is_active = 1' : '';
        return $this->db->fetchAll(
            "SELECT * FROM `sponsors` {$where} ORDER BY name ASC"
        );
    }

    /** Return sponsors with bursary aggregates for a given year. */
    public function listWithSummaries(int $academicYearId, bool $activeOnly = false): array
    {
        $where = $activeOnly ? 'AND s.is_active = 1' : '';
        return $this->db->fetchAll(
            "SELECT s.*,
                COALESCE(SUM(fb.amount), 0) AS total_amount,
                COALESCE(SUM(CASE WHEN fb.status='confirmed' THEN fb.amount ELSE 0 END), 0) AS confirmed_amount,
                COUNT(fb.id) AS bursary_count,
                COUNT(DISTINCT fb.student_id) AS student_count
             FROM `sponsors` s
             LEFT JOIN `fee_bursaries` fb ON fb.sponsor_id = s.id AND fb.academic_year_id = ?
             WHERE 1=1 {$where}
             GROUP BY s.id
             ORDER BY s.name ASC",
            [$academicYearId]
        );
    }
}

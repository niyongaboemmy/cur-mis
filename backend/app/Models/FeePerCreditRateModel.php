<?php

declare(strict_types=1);

namespace App\Models;

class FeePerCreditRateModel extends BaseModel
{
    protected string $table = 'fee_per_credit_rates';
    protected array $fillable = [
        'academic_year_id', 'faculty_id', 'amount_per_credit', 'is_active', 'created_by',
    ];

    /** @param array{academic_year_id?:int,faculty_id?:int,is_active?:bool} $filters */
    public function listWithJoins(array $filters = []): array
    {
        $where    = [];
        $bindings = [];

        if (!empty($filters['academic_year_id'])) {
            $where[]    = 'fpcr.academic_year_id = ?';
            $bindings[] = (int)$filters['academic_year_id'];
        }
        if (isset($filters['faculty_id'])) {
            $where[]    = 'fpcr.faculty_id = ?';
            $bindings[] = $filters['faculty_id'] ? (int)$filters['faculty_id'] : null;
        }
        if (isset($filters['is_active'])) {
            $where[]    = 'fpcr.is_active = ?';
            $bindings[] = (int)$filters['is_active'];
        }

        $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

        return $this->db->fetchAll(
            "SELECT fpcr.*,
                    ay.label  AS academic_year_label,
                    f.fac_name AS faculty_name
             FROM `fee_per_credit_rates` fpcr
             LEFT JOIN `academic_years` ay ON ay.id = fpcr.academic_year_id
             LEFT JOIN `faculty`        f  ON f.fac_id = fpcr.faculty_id
             {$whereSql}
             ORDER BY fpcr.academic_year_id DESC, f.fac_name ASC",
            $bindings
        );
    }

    /**
     * Find the per-credit rate for a specific faculty and academic year.
     */
    public function findForFaculty(int $academicYearId, int $facultyId): array|false
    {
        return $this->db->fetchOne(
            "SELECT * FROM `fee_per_credit_rates`
             WHERE academic_year_id = ? AND faculty_id = ? AND is_active = 1
             LIMIT 1",
            [$academicYearId, $facultyId]
        );
    }
}

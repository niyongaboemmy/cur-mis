<?php

declare(strict_types=1);

namespace App\Models;

class FeeStructureModel extends BaseModel
{
    protected string $table = 'fee_structures';
    protected array $fillable = [
        'academic_year_id', 'department_id', 'level_id',
        'fee_type', 'label', 'amount', 'semester', 'is_active', 'created_by',
    ];

    /** @param array{academic_year_id?:int,department_id?:int,level_id?:int,fee_type?:string,is_active?:bool} $filters */
    public function listWithJoins(array $filters = []): array
    {
        $where    = [];
        $bindings = [];

        if (!empty($filters['academic_year_id'])) {
            $where[]    = 'fs.academic_year_id = ?';
            $bindings[] = (int)$filters['academic_year_id'];
        }
        if (isset($filters['department_id'])) {
            $where[]    = 'fs.department_id = ?';
            $bindings[] = $filters['department_id'] ? (int)$filters['department_id'] : null;
        }
        if (isset($filters['level_id'])) {
            $where[]    = 'fs.level_id = ?';
            $bindings[] = $filters['level_id'] ? (int)$filters['level_id'] : null;
        }
        if (!empty($filters['fee_type'])) {
            $where[]    = 'fs.fee_type = ?';
            $bindings[] = $filters['fee_type'];
        }
        if (isset($filters['is_active'])) {
            $where[]    = 'fs.is_active = ?';
            $bindings[] = (int)$filters['is_active'];
        }

        $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

        return $this->db->fetchAll(
            "SELECT fs.*,
                    ay.label  AS academic_year_label,
                    d.dep_name AS department_name,
                    l.name    AS level_name
             FROM `fee_structures` fs
             LEFT JOIN `academic_years` ay ON ay.id  = fs.academic_year_id
             LEFT JOIN `departements`   d  ON d.dep_id = fs.department_id
             LEFT JOIN `levels`         l  ON l.id   = fs.level_id
             {$whereSql}
             ORDER BY fs.fee_type, fs.label",
            $bindings
        );
    }

    /**
     * Find the best-matching fee structure for a student's profile.
     * Prefers the most specific match (department + level) over generic ones.
     */
    public function findBestMatch(
        int $academicYearId,
        string $feeType,
        ?int $departmentId,
        ?int $levelId,
        ?int $semester = null
    ): array|false {
        $semesterSql = $semester !== null ? 'AND (fs.semester = ? OR fs.semester IS NULL)' : 'AND fs.semester IS NULL';
        $bindings    = [$academicYearId, $feeType];
        if ($semester !== null) {
            $bindings[] = $semester;
        }
        $bindings = array_merge($bindings, [
            $departmentId, $levelId,
            $departmentId,
            $levelId,
        ]);

        return $this->db->fetchOne(
            "SELECT fs.*
             FROM `fee_structures` fs
             WHERE fs.academic_year_id = ?
               AND fs.fee_type = ?
               AND fs.is_active = 1
               {$semesterSql}
               AND (fs.department_id = ? OR fs.department_id IS NULL)
               AND (fs.level_id = ? OR fs.level_id IS NULL)
             ORDER BY
               (fs.department_id = ?) DESC,
               (fs.level_id = ?) DESC
             LIMIT 1",
            $bindings
        );
    }
}

<?php

declare(strict_types=1);

namespace App\Models;

class FeeStructureModel extends BaseModel
{
    protected string $table = 'fee_structures';
    protected array $fillable = [
        'academic_year_id', 'department_id', 'level_id', 'campus_id',
        'fee_type', 'label', 'amount', 'semester', 'payment_plan', 'installment_count',
        'is_active',
    ];

    /** @param array{academic_year_id?:int,department_id?:int,level_id?:int,campus_id?:int,fee_type?:string,is_active?:bool} $filters */
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
        if (isset($filters['campus_id'])) {
            $where[]    = 'fs.campus_id = ?';
            $bindings[] = $filters['campus_id'] ? (int)$filters['campus_id'] : null;
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
                    l.name    AS level_name,
                    c.name    AS campus_name,
                    GROUP_CONCAT(DISTINCT fsd.department_id ORDER BY fsd.department_id) AS dept_ids,
                    GROUP_CONCAT(DISTINCT fso.option_id ORDER BY fso.option_id) AS option_ids
             FROM `fee_structures` fs
             LEFT JOIN `academic_years`          ay  ON ay.id    = fs.academic_year_id
             LEFT JOIN `departements`            d   ON d.dep_id = fs.department_id
             LEFT JOIN `levels`                  l   ON l.id     = fs.level_id
             LEFT JOIN `campuses`                c   ON c.id     = fs.campus_id
             LEFT JOIN `fee_structure_departments` fsd ON fsd.fee_structure_id = fs.id
             LEFT JOIN `fee_structure_options`     fso ON fso.fee_structure_id = fs.id
             {$whereSql}
             GROUP BY fs.id
             ORDER BY fs.fee_type, fs.label",
            $bindings
        );
    }

    /**
     * Find the best-matching fee structure for a student's profile.
     * Checks both the legacy department_id column and the fee_structure_departments join table.
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

        // dept match bindings: used in WHERE (×2 for EXISTS) and ORDER BY (×2)
        $bindings = array_merge($bindings, [
            $departmentId, $departmentId,  // WHERE dept check
            $levelId,                       // WHERE level check
            $departmentId, $departmentId,  // ORDER BY dept priority
            $levelId,                       // ORDER BY level priority
        ]);

        return $this->db->fetchOne(
            "SELECT fs.*
             FROM `fee_structures` fs
             WHERE fs.academic_year_id = ?
               AND fs.fee_type = ?
               AND fs.is_active = 1
               {$semesterSql}
               AND (
                     fs.department_id = ?
                  OR fs.department_id IS NULL
                  OR EXISTS (
                       SELECT 1 FROM `fee_structure_departments` fsd2
                       WHERE fsd2.fee_structure_id = fs.id AND fsd2.department_id = ?
                     )
               )
               AND (fs.level_id = ? OR fs.level_id IS NULL)
             ORDER BY
               (fs.department_id = ? OR EXISTS (
                  SELECT 1 FROM `fee_structure_departments` fsd3
                  WHERE fsd3.fee_structure_id = fs.id AND fsd3.department_id = ?
               )) DESC,
               (fs.level_id = ?) DESC
             LIMIT 1",
            $bindings
        );
    }

    /**
     * Replace all department links for a fee structure.
     * Called after create or update when department_ids array is provided.
     */
    public function insertDepartmentLinks(int $structureId, array $departmentIds): void
    {
        $this->db->execute(
            "DELETE FROM `fee_structure_departments` WHERE fee_structure_id = ?",
            [$structureId]
        );

        foreach ($departmentIds as $deptId) {
            $deptId = (int)$deptId;
            if ($deptId <= 0) {
                continue;
            }
            $this->db->execute(
                "INSERT IGNORE INTO `fee_structure_departments` (fee_structure_id, department_id)
                 VALUES (?, ?)",
                [$structureId, $deptId]
            );
        }
    }

    /**
     * Replace all option links for a fee structure.
     * Called after create or update when option_ids array is provided.
     */
    public function insertOptionLinks(int $structureId, array $optionIds): void
    {
        $this->db->execute(
            "DELETE FROM `fee_structure_options` WHERE fee_structure_id = ?",
            [$structureId]
        );

        foreach ($optionIds as $optionId) {
            $optionId = (int)$optionId;
            if ($optionId <= 0) {
                continue;
            }
            $this->db->execute(
                "INSERT IGNORE INTO `fee_structure_options` (fee_structure_id, option_id)
                 VALUES (?, ?)",
                [$structureId, $optionId]
            );
        }
    }
}

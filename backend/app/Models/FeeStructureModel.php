<?php

declare(strict_types=1);

namespace App\Models;

class FeeStructureModel extends BaseModel
{
    protected string $table = 'fee_structures';
    protected array $fillable = [
        'academic_year_id', 'department_id', 'level_id', 'campus_id', 'student_category', 'programme_category',
        'fee_type', 'label', 'amount', 'currency', 'semester', 'payment_plan', 'installment_count',
        'is_active',
    ];

    /** @param array{academic_year_id?:int,department_id?:int,level_id?:int,campus_id?:int,student_category?:string,fee_type?:string,is_active?:bool} $filters */
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
        if (!empty($filters['student_category'])) {
            $where[]    = 'fs.student_category = ?';
            $bindings[] = $filters['student_category'];
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
     *
     * $studentCategory resolution mirrors $semester: passing null only matches structures with
     * student_category IS NULL (category-agnostic); passing a value matches that value OR NULL,
     * with an exact match ranked above a NULL (universal) structure.
     *
     * $programmeCategory (undergraduate | postgraduate | masters) works the same way and is
     * ranked first: a structure priced for the applicant's programme always beats a
     * programme-agnostic one, whatever its department or level.
     */
    public function findBestMatch(
        int $academicYearId,
        string $feeType,
        ?int $departmentId,
        ?int $levelId,
        ?int $semester = null,
        ?string $studentCategory = null,
        ?string $programmeCategory = null
    ): array|false {
        $semesterSql = $semester !== null ? 'AND (fs.semester = ? OR fs.semester IS NULL)' : 'AND fs.semester IS NULL';
        $categorySql = $studentCategory !== null ? 'AND (fs.student_category = ? OR fs.student_category IS NULL)' : 'AND fs.student_category IS NULL';
        $categoryOrderSql = $studentCategory !== null ? ', (fs.student_category = ?) DESC' : '';
        $programmeSql = $programmeCategory !== null ? 'AND (fs.programme_category = ? OR fs.programme_category IS NULL)' : '';
        $programmeOrderSql = $programmeCategory !== null ? '(fs.programme_category = ?) DESC,' : '';

        $bindings = [$academicYearId, $feeType];
        if ($semester !== null) {
            $bindings[] = $semester;
        }
        if ($studentCategory !== null) {
            $bindings[] = $studentCategory;
        }
        if ($programmeCategory !== null) {
            $bindings[] = $programmeCategory;
        }

        // dept match bindings: used in WHERE (×2 for EXISTS) and ORDER BY (×2)
        $bindings = array_merge($bindings, [
            $departmentId, $departmentId,  // WHERE dept check
            $levelId,                       // WHERE level check
        ]);
        if ($programmeCategory !== null) {
            $bindings[] = $programmeCategory; // ORDER BY programme priority (first)
        }
        $bindings = array_merge($bindings, [
            $departmentId, $departmentId,  // ORDER BY dept priority
            $levelId,                       // ORDER BY level priority
        ]);
        if ($studentCategory !== null) {
            $bindings[] = $studentCategory; // ORDER BY category priority
        }

        return $this->db->fetchOne(
            "SELECT fs.*
             FROM `fee_structures` fs
             WHERE fs.academic_year_id = ?
               AND fs.fee_type = ?
               AND fs.is_active = 1
               {$semesterSql}
               {$categorySql}
               {$programmeSql}
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
               {$programmeOrderSql}
               (fs.department_id = ? OR EXISTS (
                  SELECT 1 FROM `fee_structure_departments` fsd3
                  WHERE fsd3.fee_structure_id = fs.id AND fsd3.department_id = ?
               )) DESC,
               (fs.level_id = ?) DESC
               {$categoryOrderSql}
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

    /**
     * Pivot fee structures into a schedule export format: one row per program,
     * with columns for each fee type (APPLICATION, REGISTRATION, CURSU, etc).
     * Grouped by faculty and ordered by faculty → option name.
     * Returns: [{fac_name, option_name, semester, application_fee, registration_fee, ..., tuition_per_year}, ...]
     */
    /**
     * Pivot fee structures into a schedule export format: one row per department, with
     * columns for each fee type (APPLICATION, REGISTRATION, CURSU, etc). Grouped by faculty
     * and ordered by faculty → department name.
     *
     * Joins directly on `fee_structures.department_id` (added in migration 091) rather than
     * the legacy `fee_structure_options` → `options` join table, which in practice is almost
     * never populated (a handful of stale/orphaned links) and produced incomplete or
     * mislabeled "Unknown"/"Ungrouped" rows that blended unrelated programs' amounts together
     * via MAX() once every department-scoped row's option_id came back NULL.
     *
     * Rows with no department_id (fees that apply to all departments, e.g. shared document
     * fees) are intentionally excluded here — see {@see generalFeeRows()}.
     */
    public function scheduleExport(int $academicYearId): array
    {
        $rows = $this->db->fetchAll(
            "SELECT
                    f.fac_name,
                    f.fac_id,
                    d.dep_id as option_id,
                    d.dep_name as option_name,
                    fs.semester,
                    fs.level_id,
                    l.name as level_name,
                    MAX(CASE WHEN fs.fee_type = 'APPLICATION' THEN fs.amount ELSE NULL END) as application_fee,
                    MAX(CASE WHEN fs.fee_type = 'REGISTRATION' THEN fs.amount ELSE NULL END) as registration_fee,
                    MAX(CASE WHEN fs.fee_type = 'CURSU' THEN fs.amount ELSE NULL END) as cursu_fee,
                    MAX(CASE WHEN fs.fee_type = 'TUITION' THEN fs.amount ELSE NULL END) as tuition_fee,
                    MAX(CASE WHEN fs.fee_type = 'INTERNSHIP' THEN fs.amount ELSE NULL END) as internship_fee,
                    MAX(CASE WHEN fs.fee_type = 'FINAL_PROJECT' THEN fs.amount ELSE NULL END) as final_project_fee,
                    MAX(CASE WHEN fs.fee_type = 'GRADUATION' THEN fs.amount ELSE NULL END) as graduation_fee
             FROM `fee_structures` fs
             INNER JOIN `departements` d ON d.dep_id = fs.department_id
             LEFT JOIN `faculty` f ON f.fac_id = d.fac_id
             LEFT JOIN `levels` l ON l.id = fs.level_id
             WHERE fs.academic_year_id = ? AND fs.is_active = 1
             GROUP BY f.fac_id, d.dep_id, fs.semester, fs.level_id
             ORDER BY f.fac_name ASC, d.dep_name ASC",
            [$academicYearId]
        );

        return $rows ?? [];
    }

    /**
     * Fee rows that apply to ALL departments (department_id IS NULL), listed individually
     * rather than pivoted/aggregated — these are typically one-off or shared fees (document
     * fees, generic placeholders) and don't belong to any single program's row.
     */
    public function generalFeeRows(int $academicYearId): array
    {
        $rows = $this->db->fetchAll(
            "SELECT fee_type, label, amount, currency, student_category
             FROM `fee_structures`
             WHERE academic_year_id = ?
               AND department_id IS NULL
               AND is_active = 1
             ORDER BY fee_type ASC",
            [$academicYearId]
        );

        return $rows ?? [];
    }

    /**
     * Pivot postgraduate (local/EAC) fee rows into a schedule export format: one row per
     * postgraduate department, with columns for each fee type. Mirrors the signed Finance
     * "Academic Fees Structure — Postgraduate Studies (Rwandan and EAC students)" schedule.
     * Direct department_id join (not via the options table used by scheduleExport()), since
     * postgraduate departments have no combination/options structure.
     */
    public function postgraduateScheduleExport(int $academicYearId): array
    {
        $rows = $this->db->fetchAll(
            "SELECT
                    d.dep_id as department_id,
                    d.dep_name as department_name,
                    MAX(CASE WHEN fs.fee_type = 'APPLICATION'  THEN fs.amount ELSE NULL END) as application_fee,
                    MAX(CASE WHEN fs.fee_type = 'REGISTRATION' THEN fs.amount ELSE NULL END) as registration_fee,
                    MAX(CASE WHEN fs.fee_type = 'CURSU'        THEN fs.amount ELSE NULL END) as cursu_fee,
                    MAX(CASE WHEN fs.fee_type = 'INTERNSHIP'   THEN fs.amount ELSE NULL END) as internship_fee,
                    MAX(CASE WHEN fs.fee_type = 'TUITION'      THEN fs.amount ELSE NULL END) as tuition_fee_per_semester,
                    MAX(CASE WHEN fs.fee_type = 'GRADUATION'   THEN fs.amount ELSE NULL END) as graduation_fee
             FROM `fee_structures` fs
             INNER JOIN `departements` d ON d.dep_id = fs.department_id
             WHERE fs.academic_year_id = ?
               AND fs.student_category = 'local'
               AND d.program_level = 'postgraduate'
               AND fs.is_active = 1
             GROUP BY d.dep_id, d.dep_name
             ORDER BY d.dep_name ASC",
            [$academicYearId]
        );

        return $rows ?? [];
    }

    /**
     * The three "Other Fees / Document Fees" rows shared by all postgraduate students
     * (department_id / student_category = NULL = applies to all).
     */
    public function postgraduateOtherFees(int $academicYearId): array
    {
        $rows = $this->db->fetchAll(
            "SELECT fee_type, label, amount, currency
             FROM `fee_structures`
             WHERE academic_year_id = ?
               AND department_id IS NULL
               AND fee_type IN ('TO_WHOM', 'ENGLISH_CERTIFICATE', 'TRANSCRIPT')
               AND is_active = 1
             ORDER BY fee_type ASC",
            [$academicYearId]
        );

        return $rows ?? [];
    }
}

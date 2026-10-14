<?php

declare(strict_types=1);

namespace App\Models;

class FeeStructureModel extends BaseModel
{
    /**
     * Stored tuition amounts are a quarter of the programme total on the signed CUR schedule
     * (e.g. 412,500 stored, 1,650,000 signed). The schedule export multiplies them by this factor
     * so the total, per-semester and per-year columns match the signed layout.
     */
    public const TUITION_TOTAL_FACTOR = 4;

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
        // A structure covering several departments is stored once, with its first department
        // in fs.department_id and every department in fee_structure_departments. Read both, so
        // each selected department is included. International-only rows are excluded: this
        // schedule is for Rwandan and EAC students.
        $fees = $this->db->fetchAll(
            "SELECT x.dep_id, x.level_id, x.fee_type, MAX(x.amount) AS amount
             FROM (
                    SELECT fsd.department_id AS dep_id, fs.level_id, fs.fee_type, fs.amount
                    FROM `fee_structures` fs
                    INNER JOIN `fee_structure_departments` fsd ON fsd.fee_structure_id = fs.id
                    WHERE fs.academic_year_id = ? AND fs.is_active = 1
                      AND (fs.student_category IS NULL OR fs.student_category <> 'international')
                    UNION
                    SELECT fs.department_id AS dep_id, fs.level_id, fs.fee_type, fs.amount
                    FROM `fee_structures` fs
                    WHERE fs.academic_year_id = ? AND fs.is_active = 1
                      AND fs.department_id IS NOT NULL
                      AND (fs.student_category IS NULL OR fs.student_category <> 'international')
             ) x
             GROUP BY x.dep_id, x.level_id, x.fee_type",
            [$academicYearId, $academicYearId]
        ) ?: [];

        if ($fees === []) {
            return [];
        }

        $depIds = array_values(array_unique(array_map(static fn ($r) => (int)$r['dep_id'], $fees)));
        $placeholders = implode(',', array_fill(0, count($depIds), '?'));
        $departments = [];
        foreach ($this->db->fetchAll(
            "SELECT d.dep_id, d.dep_name, d.duration_years, d.internship_count, f.fac_id, f.fac_name
             FROM `departements` d
             LEFT JOIN `faculty` f ON f.fac_id = d.fac_id
             WHERE d.dep_id IN ({$placeholders})",
            $depIds
        ) ?: [] as $d) {
            $departments[(int)$d['dep_id']] = $d;
        }

        $levelNames = [];
        foreach ($this->db->fetchAll("SELECT id, name FROM `levels`") ?: [] as $l) {
            $levelNames[(int)$l['id']] = $l['name'];
        }

        // Fee column per fee type, as read by the schedule PDF.
        $columns = [
            'APPLICATION'   => 'application_fee',
            'REGISTRATION'  => 'registration_fee',
            'CURSU'         => 'cursu_fee',
            'TUITION'       => 'tuition_fee',
            'INTERNSHIP'    => 'internship_fee',
            'FINAL_PROJECT' => 'final_project_fee',
            'GRADUATION'    => 'graduation_fee',
        ];

        // Group the fee rows by department.
        $byDept = [];
        foreach ($fees as $f) {
            $byDept[(int)$f['dep_id']][] = $f;
        }

        // One row per programme band. A band is a level/semester the department has fees for.
        // A fee on a band's own level wins. A fee with no level applies to every band of the
        // department. The signed CUR schedule works this way: the application fee sits on the
        // first band only, and a level-less tuition applies to all bands.
        $rows = [];
        foreach ($byDept as $depId => $depFees) {
            $dept = $departments[$depId] ?? null;
            if ($dept === null) {
                continue;
            }

            $levels = array_values(array_unique(array_filter(array_map(
                static fn ($f) => $f['level_id'] !== null ? (int)$f['level_id'] : null,
                $depFees
            ), static fn ($v) => $v !== null)));
            sort($levels);
            $bands = $levels !== [] ? $levels : [null];

            foreach ($bands as $levelId) {
                $row = [
                    'fac_name'          => $dept['fac_name'],
                    'fac_id'            => $dept['fac_id'],
                    'option_id'         => $depId,
                    'option_name'       => $dept['dep_name'],
                    'duration_years'    => $dept['duration_years'],
                    'internship_count'  => $dept['internship_count'],
                    'semester'          => null,
                    'level_id'          => $levelId,
                    'level_name'        => $levelId !== null ? ($levelNames[$levelId] ?? null) : null,
                ];

                foreach ($columns as $feeType => $column) {
                    $exact = null;
                    $general = null;
                    foreach ($depFees as $f) {
                        if ($f['fee_type'] !== $feeType) {
                            continue;
                        }
                        $amount = (float)$f['amount'];
                        if ($f['level_id'] === null) {
                            $general = max($general ?? $amount, $amount);
                        } elseif ($levelId !== null && (int)$f['level_id'] === $levelId) {
                            $exact = max($exact ?? $amount, $amount);
                        }
                    }
                    $row[$column] = $exact ?? $general;
                }

                if ($row['tuition_fee'] !== null) {
                    $row['tuition_fee'] = $row['tuition_fee'] * self::TUITION_TOTAL_FACTOR;
                }

                $rows[] = $row;
            }
        }

        usort($rows, static fn ($a, $b) =>
            [$a['fac_name'] ?? '', $a['option_name'], $a['level_id'] ?? 0]
            <=> [$b['fac_name'] ?? '', $b['option_name'], $b['level_id'] ?? 0]
        );

        return $rows;
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
     * Every active fee structure for the year, one row per structure, with its department names
     * resolved (a structure covering several departments lists all of them). Unlike
     * scheduleExport(), nothing is pivoted or dropped, so this is the complete register that the
     * Fee Rates page shows.
     */
    public function allActiveForExport(int $academicYearId): array
    {
        return $this->db->fetchAll(
            "SELECT fs.id, fs.fee_type, fs.label, fs.amount, fs.currency, fs.student_category,
                    fs.programme_category, fs.semester, fs.payment_plan, fs.installment_count,
                    l.name AS level_name,
                    (SELECT GROUP_CONCAT(DISTINCT d.dep_name ORDER BY d.dep_name SEPARATOR ', ')
                       FROM `departements` d
                      WHERE d.dep_id = fs.department_id
                         OR d.dep_id IN (SELECT fsd.department_id FROM `fee_structure_departments` fsd
                                          WHERE fsd.fee_structure_id = fs.id)
                    ) AS department_names
             FROM `fee_structures` fs
             LEFT JOIN `levels` l ON l.id = fs.level_id
             WHERE fs.academic_year_id = ? AND fs.is_active = 1
             ORDER BY fs.fee_type ASC, fs.label ASC, fs.id ASC",
            [$academicYearId]
        ) ?: [];
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

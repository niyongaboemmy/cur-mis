<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use Core\Database;
use App\Services\SystemLogService;
use App\Models\StudentStatusChangeModel;

/**
 * Deliberation grid: every active student in scope (program × level × intake)
 * across the rows, every module they are registered for across the columns.
 *
 * For each (student, module) cell we expose:
 *   - cats_60        sum of the saved CAT/partial components (typical /60)
 *   - fat_40         the better of 1st-sitting / 2nd-sitting (typical /40)
 *   - total_100      module_marks.percentage
 *   - credits_points module_credits × percentage  (matches the legacy CUR
 *                                                  deliberation spreadsheet)
 *   - grade          module_marks.grade
 *   - decision       module_marks.decision  (P / F&R)
 *   - is_exempted    so the UI can render an exempted cell
 *
 * Filters (all optional, but typically the user picks a program + level):
 *   - std_option        catalog program id (student.std_option)
 *   - current_level     1..8
 *   - intake            student.intake (free-text label like "september_intake_2025")
 *   - academic_year_id  defaults to the current year
 */
class DeliberationController extends BaseController
{
    private Database $db;
    private StudentStatusChangeModel $statusModel;

    public function __construct()
    {
        $this->db = Database::getInstance();
        // A board-ordered exclusion writes through the same audit trail as a
        // registrar's manual status change (migration 145).
        $this->statusModel = new StudentStatusChangeModel();
    }

    public function grid(Request $request, Response $response): never
    {
        $stdOption  = trim((string)($request->query('std_option')    ?? ''));
        $level      = trim((string)($request->query('current_level') ?? ''));
        $intake     = trim((string)($request->query('intake')        ?? ''));
        $yearId     = (int)($request->query('academic_year_id')      ?? 0);
        $page       = max(1, (int)($request->query('page')           ?? 1));
        $perPage    = (int)($request->query('per_page')              ?? 50);
        if ($perPage <= 0)   $perPage = 50;
        if ($perPage > 200)  $perPage = 200;
        $offset     = ($page - 1) * $perPage;

        // Resolve the academic year — default to current.
        if ($yearId <= 0) {
            $ctxYearId = \App\Helpers\AcademicContext::yearId();
            $cur = $ctxYearId
                ? $this->db->fetchOne("SELECT id, label FROM academic_years WHERE id = ? LIMIT 1", [$ctxYearId])
                : false;
            if (!$cur) {
                $cur = $this->db->fetchOne(
                    "SELECT id, label FROM academic_years ORDER BY id DESC LIMIT 1"
                );
            }
            if ($cur) $yearId = (int)$cur['id'];
        }
        $year = $yearId > 0
            ? $this->db->fetchOne("SELECT id, label FROM academic_years WHERE id = ? LIMIT 1", [$yearId])
            : null;

        // ── Students filter (used for both COUNT, page query, and the
        //    module-discovery query so the column set is stable across pages)
        $stArgs  = [];
        $stWhere = ["st.student_state = 'active'"];
        if ($stdOption !== '') {
            $stWhere[] = "st.std_option = ?";
            $stArgs[]  = $stdOption;
        }
        if ($level !== '') {
            $stWhere[] = "CAST(NULLIF(st.current_level,'') AS UNSIGNED) = ?";
            $stArgs[]  = (int)$level;
        }
        if ($intake !== '') {
            $stWhere[] = "st.intake = ?";
            $stArgs[]  = $intake;
        }
        $whereClause = implode(' AND ', $stWhere);

        // Total — drives the pagination footer.
        $totalRow = $this->db->fetchOne(
            "SELECT COUNT(*) AS total FROM `student` st WHERE $whereClause",
            $stArgs
        );
        $total = (int)($totalRow['total'] ?? 0);

        // Page of students.
        $students = $this->db->fetchAll(
            "SELECT st.id          AS student_id,
                    st.regnumber,
                    st.fname,
                    st.lname,
                    st.gender      AS sex,
                    st.intake,
                    st.current_level,
                    st.std_option,
                    st.program     AS student_program,
                    o.name         AS program_name,
                    o.acro         AS program_acronym
             FROM `student` st
             LEFT JOIN `options` o ON CAST(o.id AS CHAR) COLLATE utf8mb4_unicode_ci = st.std_option COLLATE utf8mb4_unicode_ci
             WHERE $whereClause
             ORDER BY st.lname, st.fname
             LIMIT $perPage OFFSET $offset",
            $stArgs
        );

        // ── Modules in scope.
        //
        //  • When a program is selected the columns become the program's
        //    full curriculum (every module mapped to that option via
        //    `module_programs`). This is the deliberation default — the
        //    grid shows every module a student in that program *should*
        //    study, regardless of whether they have registered yet, so
        //    examiners see gaps as empty cells.
        //
        //  • When no program is selected we fall back to the legacy
        //    behaviour (modules derived from registrations) since the
        //    cartesian "every active student × every module in the
        //    catalogue" would be unbounded.
        //
        //  A `current_level` filter narrows columns to that level (via
        //  `module_levels` if present, falling back to the legacy
        //  `modules.level` column).
        if ($stdOption !== '') {
            $modArgs = [(int)$stdOption];
            $modSql  = "SELECT DISTINCT m.module_id, m.module_code, m.module_name,
                                        m.module_credits, m.level,
                                        COALESCE(mp.module_order, 9999) AS module_order
                        FROM module_programs mp
                        JOIN modules m ON m.module_id = mp.module_id
                        WHERE mp.option_id = ?
                          AND m.status <> 'archived'";
            if ($level !== '') {
                $modSql   .= " AND (EXISTS (
                                       SELECT 1 FROM module_levels ml
                                       WHERE ml.module_id = m.module_id
                                         AND ml.level_id  = ?
                                   )
                                   OR m.level = ?)";
                $modArgs[] = (int)$level;
                $modArgs[] = (int)$level;
            }
            $modSql .= " ORDER BY m.level ASC, module_order ASC, m.module_code ASC";
            $modules = $this->db->fetchAll($modSql, $modArgs);
        } else {
            $modArgs = $stArgs;
            $modSql  = "SELECT DISTINCT m.module_id, m.module_code, m.module_name,
                                        m.module_credits, m.level
                        FROM module_registrations mr
                        JOIN `student` st       ON st.regnumber = mr.student_regnumber
                        JOIN modules m          ON m.module_id  = mr.module_id
                        JOIN academic_terms t   ON t.id         = mr.academic_term_id
                        WHERE $whereClause
                          AND mr.status <> 'dropped'";
            if ($yearId > 0) {
                $modSql   .= " AND t.academic_year_id = ?";
                $modArgs[] = $yearId;
            }
            $modSql .= " ORDER BY m.level ASC, m.module_code ASC";
            $modules = $this->db->fetchAll($modSql, $modArgs);
        }

        // ── Marks for the page's students × every in-scope module.
        //    Pulled directly from `module_marks` so a recorded mark surfaces
        //    even when the matching `module_registrations` row is missing,
        //    dropped, or recorded in a different term than the marks. The
        //    in-scope module set is bounded by the modules collected above
        //    (program curriculum, or registration-derived fallback) so the
        //    query never explodes across the full catalogue.
        //
        //    NOTE: the academic-year filter intentionally does NOT apply
        //    here. The deliberation view shows marks for every module the
        //    student has completed (any term, any year), so previously-passed
        //    modules carry their marks forward into the current year's grid.
        //    When a student has marks for the same module across multiple
        //    terms, we order by `academic_term_id ASC` so the foreach below
        //    overwrites with the latest term — the most recent attempt wins.
        $marksByReg = [];
        if (count($students) > 0 && count($modules) > 0) {
            $regs    = array_column($students, 'regnumber');
            $regHold = implode(',', array_fill(0, count($regs), '?'));

            $modIds  = array_map(static fn($m) => (int)$m['module_id'], $modules);
            $modHold = implode(',', array_fill(0, count($modIds), '?'));

            $marksArgs = array_merge($regs, $modIds);
            // `cat_marks` / `exam_marks` are the columns that actually hold the
            // marks. The itemised ones this used to read alone are all but
            // unused: of 292,648 rows, 16 carry cat1/cat2/cat3/partial_exam and
            // ZERO carry exam_1st_sitting/exam_2nd_sitting — which is why the
            // CAT/60 and FAT/40 columns rendered "—" for the whole grid while
            // TOT/100 (fed by `percentage`) filled in normally.
            $marksSql  = "SELECT mm.student_regnumber, mm.module_id,
                                 mm.cat1, mm.cat2, mm.cat3, mm.partial_exam,
                                 mm.cat_marks, mm.cats_max,
                                 mm.exam_1st_sitting, mm.exam_2nd_sitting,
                                 mm.exam_marks, mm.final_exam_max,
                                 mm.total,
                                 mm.percentage, mm.grade, mm.decision,
                                 mm.is_exempted,
                                 m.module_credits
                          FROM module_marks mm
                          JOIN modules m ON m.module_id = mm.module_id
                          WHERE mm.student_regnumber IN ($regHold)
                            AND mm.module_id IN ($modHold)
                          ORDER BY mm.academic_term_id ASC";
            $marksRows = $this->db->fetchAll($marksSql, $marksArgs);

            foreach ($marksRows as $r) {
                $reg = (string)$r['student_regnumber'];
                $mid = (int)$r['module_id'];

                // CAT: prefer the itemised entries when a lecturer recorded
                // them, since they are the finer record; otherwise use the
                // aggregate the marks were imported into.
                $c1 = $this->dec($r['cat1']);
                $c2 = $this->dec($r['cat2']);
                $c3 = $this->dec($r['cat3']);
                $pe = $this->dec($r['partial_exam']);
                $hasCats   = $c1 !== null || $c2 !== null || $c3 !== null || $pe !== null;
                $catsTotal = $hasCats
                    ? round(($c1 ?? 0) + ($c2 ?? 0) + ($c3 ?? 0) + ($pe ?? 0), 2)
                    : $this->dec($r['cat_marks']);

                // FAT: same shape. A resit supersedes the first sitting, so the
                // higher of the two stands; `exam_marks` is the fallback.
                $e1  = $this->dec($r['exam_1st_sitting']);
                $e2  = $this->dec($r['exam_2nd_sitting']);
                $fat = $e2 !== null ? max((float)($e1 ?? 0), (float)$e2) : $e1;
                $fat = $fat !== null ? round((float)$fat, 2) : $this->dec($r['exam_marks']);

                $pct     = $this->dec($r['percentage']);
                $credits = (int)($r['module_credits'] ?? 0);
                $cp      = $pct !== null ? round($credits * $pct, 2) : null;

                // Flag components that cannot be taken at face value. The test is
                // deliberately NOT "is it over the column heading": `cats_max`
                // and `final_exam_max` are constants across all 292,648 rows
                // (60 and 40), so they say nothing about a given module, and
                // roughly 103 modules are genuinely marked on a different
                // weighting — HRMG2211 runs CAT/30 + FAT/70 and reconciles on
                // 1,633 of its 1,974 rows. Calling those "out of scale" would be
                // noise. What actually cannot be trusted is a component that is
                // negative, a raw total that was never on a /100 basis (the
                // TOT/100 beside it is `percentage`, which caps at 100 — 715
                // rows), or components that do not add up to their own total
                // (40,758 rows). Values are shown either way; this only stops
                // the grid presenting them as verified.
                //
                // The sum tolerance is a whole mark, not a hair. 40,758 rows do
                // not add up exactly, but 40,754 of them are out by <= 1.00 and
                // hold whole-number components against a whole-number total —
                // the signature of a total rounded from decimals that were
                // themselves rounded on the way into storage. Only 4 rows in the
                // entire table differ by more than a mark. Flagging the rounding
                // would tint 14% of the grid and teach the board to ignore the
                // colour, which is worse than not flagging at all.
                $total   = $this->dec($r['total']);
                $anomaly = null;
                if (($catsTotal !== null && $catsTotal < 0) || ($fat !== null && $fat < 0)) {
                    $anomaly = 'out_of_scale';
                } elseif ($total !== null && $total > 100) {
                    $anomaly = 'out_of_scale';
                } elseif ($catsTotal !== null && $fat !== null && $total !== null
                          && abs(($catsTotal + $fat) - $total) > 1.0) {
                    $anomaly = 'does_not_sum';
                }

                $marksByReg[$reg][$mid] = [
                    'cats_60'        => $catsTotal,
                    'fat_40'         => $fat,
                    'total_100'      => $pct,
                    'credits_points' => $cp,
                    'grade'          => $r['grade'] ?? null,
                    'decision'       => $r['decision'] ?? null,
                    'is_exempted'    => (int)($r['is_exempted'] ?? 0) === 1,
                    'anomaly'        => $anomaly,
                ];
            }
        }

        // Attach marks to students.
        foreach ($students as &$s) {
            $s['marks'] = $marksByReg[$s['regnumber']] ?? [];
        }
        unset($s);

        $lastPage = $total > 0 ? (int)ceil($total / $perPage) : 1;

        $this->success($response, [
            'modules'       => \App\Helpers\LevelHelper::decorate($modules),
            'students'      => \App\Helpers\LevelHelper::decorate($students, 'current_level', 'current_level_name'),
            'academic_year' => $year,
            'counts'        => [
                'students' => $total,
                'modules'  => count($modules),
            ],
            'pagination'    => [
                'page'      => $page,
                'per_page'  => $perPage,
                'total'     => $total,
                'last_page' => $lastPage,
            ],
        ], 'Deliberation grid loaded.');
    }

    private function dec(mixed $v): ?float
    {
        if ($v === null || $v === '' ) return null;
        if (!is_numeric($v))            return null;
        return (float)$v;
    }

    /** Percentage at or above which a module mark is treated as a pass. */
    private const PASS_MARK = 50.0;

    /* ══════════════════════════════════════════════════════════════════════
     * Marks-centric deliberation view
     * ─────────────────────────────────────────────────────────────────────
     * The program grid above only surfaces *active* students whose modules are
     * mapped to a program curriculum, which hides the bulk of historic marks.
     * These endpoints instead start from `module_marks` so EVERY student that
     * has a recorded mark is listed, with each mark mapped up the hierarchy:
     *
     *     module_marks → modules → departements           (department)
     *                          └→ module_programs → options (program)
     *
     * `modules.department` is populated for ~100% of mark-bearing modules, so
     * the department is the reliable grouping level; program is shown wherever
     * a module_programs mapping exists.
     * ═══════════════════════════════════════════════════════════════════ */

    /**
     * GET /api/deliberation/mark-filters
     * Department → program hierarchy (only departments that actually have
     * marks), with per-department student / module / mark counts. Drives the
     * filter dropdowns in the Students & Marks view.
     */
    /**
     * Keeps only the current mark row per (student, module, term).
     *
     * `module_marks` holds repeated rows for the same student+module — years of
     * re-entries, plus more from the legacy consolidation. Counting them all
     * inflates every figure on this page: module counts, pass/fail tallies and
     * the averages a deliberation board actually decides on.
     *
     * Migration 127 precomputes this as an indexed flag. It used to be a
     * correlated MAX(id) subquery evaluated per row over 292k rows, which cost
     * this screen 6-47 seconds a request.
     */
    private const LATEST_MARK_ONLY = "mm.superseded = 0";

    public function markFilters(Request $request, Response $response): never
    {
        $latest = self::LATEST_MARK_ONLY;

        $departments = $this->db->fetchAll(
            "SELECT d.dep_id, d.dep_name, d.dep_acronym,
                    COUNT(DISTINCT mm.student_regnumber) AS students,
                    COUNT(DISTINCT mm.module_id)         AS modules,
                    COUNT(*)                             AS marks
             FROM module_marks mm
             JOIN modules m       ON m.module_id = mm.module_id
             JOIN departements d  ON d.dep_id   = m.department
             WHERE $latest
             GROUP BY d.dep_id, d.dep_name, d.dep_acronym
             ORDER BY students DESC, d.dep_name ASC"
        );

        $programs = $this->db->fetchAll(
            "SELECT o.id, o.name, o.acro, o.department_id,
                    COUNT(DISTINCT mp.module_id) AS modules
             FROM options o
             LEFT JOIN module_programs mp ON mp.option_id = o.id
             GROUP BY o.id, o.name, o.acro, o.department_id
             ORDER BY o.name ASC"
        );

        // Deliberately NOT joined to `modules`: 15 module ids hold marks but have
        // no catalogue row, and the board still needs to see those students.
        $totals = $this->db->fetchOne(
            "SELECT COUNT(*) AS marks,
                    COUNT(DISTINCT mm.student_regnumber) AS students,
                    COUNT(DISTINCT mm.module_id)         AS modules
             FROM module_marks mm
             WHERE $latest"
        ) ?: ['marks' => 0, 'students' => 0, 'modules' => 0];

        $this->success($response, [
            'departments' => $departments,
            'programs'    => $programs,
            'pass_mark'   => self::PASS_MARK,
            'totals'      => [
                'marks'    => (int)$totals['marks'],
                'students' => (int)$totals['students'],
                'modules'  => (int)$totals['modules'],
            ],
        ], 'Deliberation mark filters loaded.');
    }

    /**
     * GET /api/deliberation/mark-students
     * Paginated list of every student that has at least one recorded mark,
     * with a per-student summary. Optional filters: department_id, option_id
     * (program), current_level, q (search reg / name).
     */
    /**
     * The Students-&-Marks filter, shared by the list, the export and the
     * approve action so all three operate on exactly the same set — an export
     * or an approval that silently covered a different population than the
     * board is looking at would be worse than useless.
     *
     * Filters: department_id, option_id (program), current_level, q.
     * `modules ⨝ departements` never fans out (1:1), so COUNT/AVG stay accurate.
     */
    private function markStudentsFilter(Request $request): array
    {
        $deptId   = (int)($request->query('department_id') ?? 0);
        $optionId = (int)($request->query('option_id')     ?? 0);
        $level    = trim((string)($request->query('current_level') ?? ''));
        $q        = trim((string)($request->query('q')     ?? ''));

        // LATEST_MARK_ONLY collapses the duplicate rows; without it a student
        // with 286 stored rows for 99 real modules reads as 286 modules here.
        $where = [self::LATEST_MARK_ONLY];
        $args  = [];
        if ($deptId > 0) {
            $where[] = 'm.department = ?';
            $args[]  = $deptId;
        }
        if ($optionId > 0) {
            $where[] = 'mm.module_id IN (SELECT module_id FROM module_programs WHERE option_id = ?)';
            $args[]  = $optionId;
        }
        if ($level !== '') {
            $where[] = "CAST(NULLIF(st.current_level,'') AS UNSIGNED) = ?";
            $args[]  = (int)$level;
        }
        if ($q !== '') {
            // Per-word: a full name matches across fname+lname in any order.
            foreach (preg_split('/\s+/', trim($q)) ?: [] as $term) {
                if ($term === '') continue;
                $where[] = '(mm.student_regnumber LIKE ? OR st.fname LIKE ? OR st.lname LIKE ?)';
                $like    = "%{$term}%";
                $args[]  = $like; $args[] = $like; $args[] = $like;
            }
        }

        return [implode(' AND ', $where), $args];
    }

    public function markStudents(Request $request, Response $response): never
    {
        $page     = max(1, (int)($request->query('page')   ?? 1));
        $perPage  = (int)($request->query('per_page')      ?? 50);
        if ($perPage <= 0)  $perPage = 50;
        if ($perPage > 200) $perPage = 200;
        $offset   = ($page - 1) * $perPage;

        [$whereSql, $args] = $this->markStudentsFilter($request);

        // Distinct students for pagination.
        $countRow = $this->db->fetchOne(
            "SELECT COUNT(*) AS total FROM (
                 SELECT mm.student_regnumber
                 FROM module_marks mm
                 LEFT JOIN modules m      ON m.module_id = mm.module_id
                 LEFT JOIN `student` st ON st.regnumber = mm.student_regnumber
                 WHERE $whereSql
                 GROUP BY mm.student_regnumber
             ) x",
            $args
        );
        $total = (int)($countRow['total'] ?? 0);

        // `options` is joined by CAST(prog.id AS CHAR) COLLATE ... = st.std_option
        // COLLATE ... — neither side can use an index, so keeping it inside an
        // aggregate over every live mark row made this the slowest query on the
        // page. The program label is resolved separately for the page's rows.
        $rows = $this->db->fetchAll(
            "SELECT mm.student_regnumber AS regnumber,
                    st.id AS student_id, st.fname, st.lname, st.gender AS sex,
                    st.current_level, st.intake, st.std_option, st.student_state,
                    COUNT(DISTINCT mm.module_id) AS modules_count,
                    COUNT(*)                     AS marks_count,
                    ROUND(AVG(mm.percentage), 2) AS avg_pct,
                    SUM(mm.percentage >= ?)      AS passed,
                    SUM(mm.percentage <  ?)      AS failed,
                    GROUP_CONCAT(DISTINCT d.dep_name ORDER BY d.dep_name SEPARATOR ' · ') AS departments
             FROM module_marks mm
             LEFT JOIN modules m      ON m.module_id = mm.module_id
             LEFT JOIN departements d ON d.dep_id   = m.department
             LEFT JOIN `student` st   ON st.regnumber = mm.student_regnumber
             WHERE $whereSql
             GROUP BY mm.student_regnumber, st.id, st.fname, st.lname, st.gender,
                      st.current_level, st.intake, st.std_option, st.student_state
             ORDER BY (st.lname IS NULL OR st.lname = ''), st.lname, st.fname, mm.student_regnumber
             LIMIT $perPage OFFSET $offset",
            array_merge([self::PASS_MARK, self::PASS_MARK], $args)
        );

        // Attach the declared programme for just this page (≤200 rows).
        $optIds = array_values(array_unique(array_filter(array_map(
            fn($r) => trim((string)($r['std_option'] ?? '')), $rows
        ), fn($v) => $v !== '')));
        $progById = [];
        if (count($optIds) > 0) {
            $ph = implode(',', array_fill(0, count($optIds), '?'));
            foreach ($this->db->fetchAll(
                "SELECT id, name, acro FROM options WHERE CAST(id AS CHAR) IN ($ph)",
                $optIds
            ) as $o) {
                $progById[(string)$o['id']] = $o;
            }
        }
        foreach ($rows as &$r) {
            $o = $progById[trim((string)($r['std_option'] ?? ''))] ?? null;
            $r['declared_program']      = $o['name'] ?? null;
            $r['declared_program_acro'] = $o['acro'] ?? null;
            $r['current_level_name']    = \App\Helpers\LevelHelper::name($r['current_level'] ?? null) ?: null;
        }
        unset($r);

        $lastPage = $total > 0 ? (int)ceil($total / $perPage) : 1;

        $this->success($response, [
            'students'   => $rows,
            'pass_mark'  => self::PASS_MARK,
            'pagination' => [
                'page'      => $page,
                'per_page'  => $perPage,
                'total'     => $total,
                'last_page' => $lastPage,
            ],
        ], 'Students with marks loaded.');
    }

    /**
     * GET /api/deliberation/student-marks?regnumber=...
     * Full marks for one student, each row mapped to its module, department
     * and (where mapped) program(s) and term.
     */
    /**
     * GET /api/deliberation/mark-students/export
     *
     * The same population as the list, unpaginated and one row per MARK rather
     * than per student — a deliberation board signs off module by module, so an
     * export of per-student summaries would not be reviewable.
     *
     * Capped at 50k rows: the whole consolidated table is ~173k deduplicated
     * marks, and anything near that should be filtered down first. The cap is
     * reported back so the UI can say the export was truncated instead of
     * quietly handing over a partial file.
     */
    public function exportMarkStudents(Request $request, Response $response): never
    {
        [$whereSql, $args] = $this->markStudentsFilter($request);

        $cap  = 50000;
        $rows = $this->db->fetchAll(
            "SELECT mm.student_regnumber AS regnumber,
                    st.fname, st.lname, st.gender AS sex,
                    st.current_level, st.intake, st.student_state,
                    prog.name AS declared_program,
                    COALESCE(m.module_code, CONCAT('MODULE-', mm.module_id)) AS module_code,
                    COALESCE(m.module_name, 'Unknown module (not in catalogue)') AS module_name,
                    m.module_credits, m.level AS module_level,
                    d.dep_name AS department,
                    t.label AS term_label,
                    mm.cat_marks, mm.exam_marks, mm.total, mm.percentage,
                    mm.grade, mm.decision, mm.status,
                    CASE WHEN mm.percentage >= ? THEN 'PASS' ELSE 'FAIL' END AS outcome,
                    mm.created_at
             FROM module_marks mm
             LEFT JOIN modules m         ON m.module_id  = mm.module_id
             LEFT JOIN departements d    ON d.dep_id     = m.department
             LEFT JOIN `student` st      ON st.regnumber = mm.student_regnumber
             LEFT JOIN academic_terms t  ON t.id         = mm.academic_term_id
             LEFT JOIN options prog      ON CAST(prog.id AS CHAR) COLLATE utf8mb4_unicode_ci = st.std_option COLLATE utf8mb4_unicode_ci
             WHERE $whereSql
             ORDER BY (st.lname IS NULL OR st.lname = ''), st.lname, st.fname,
                      mm.student_regnumber, module_code
             LIMIT " . ($cap + 1),
            array_merge([self::PASS_MARK], $args)
        );

        $truncated = count($rows) > $cap;
        if ($truncated) $rows = array_slice($rows, 0, $cap);

        // Both level columns are `levels.id` values; the export must read as
        // the catalogue does, not as raw foreign keys.
        $rows = \App\Helpers\LevelHelper::decorate($rows, 'module_level', 'module_level_name');
        $rows = \App\Helpers\LevelHelper::decorate($rows, 'current_level', 'current_level_name');

        $this->success($response, [
            'rows'      => $rows,
            'count'     => count($rows),
            'truncated' => $truncated,
            'cap'       => $cap,
            'pass_mark' => self::PASS_MARK,
        ], 'Deliberation export ready.');
    }

    /**
     * POST /api/deliberation/approve-marks
     *
     * Board approval: locks the marks under deliberation by moving them to
     * `status = 'confirmed'`, which the marks API then refuses to overwrite.
     *
     * Scope is either an explicit list of regnumbers (what the board ticked) or
     * the whole current filter. Only the LATEST row per (student, module, term)
     * is approved — approving the superseded duplicates would resurrect old
     * marks as confirmed records.
     *
     * Requires CONFIRM_MODULE_MARKS: approving is the same authority as
     * confirming a mark sheet, and must not fall to whoever entered the marks.
     */
    public function approveMarks(Request $request, Response $response): never
    {
        $body = $request->body();
        $regs = $body['regnumbers'] ?? null;
        $userId = $this->authUserId($request) ?: null;

        if (is_array($regs) && count($regs) > 0) {
            $regs = array_values(array_filter(array_map(
                fn($r) => trim((string)$r), $regs
            ), fn($v) => $v !== ''));
        }

        if (is_array($regs) && count($regs) > 0) {
            if (count($regs) > 5000) {
                $this->error($response, 'Too many students in one approval — filter and approve in batches.', 422);
            }
            $ph = implode(',', array_fill(0, count($regs), '?'));
            $latest = self::LATEST_MARK_ONLY;
            $affected = $this->db->execute(
                "UPDATE module_marks mm
                 SET mm.status = 'confirmed',
                     mm.confirmed_at = COALESCE(mm.confirmed_at, NOW()),
                     mm.confirmed_by = COALESCE(mm.confirmed_by, ?)
                 WHERE mm.student_regnumber IN ($ph)
                   AND mm.status <> 'confirmed'
                   AND $latest",
                array_merge([$userId], $regs)
            );
        } else {
            // Whole-filter approval. The filter references `m` and `st`, so the
            // rows are resolved first and then updated by id — MySQL cannot
            // UPDATE a table that a subquery in the same statement reads.
            [$whereSql, $args] = $this->markStudentsFilter($request);
            $ids = $this->db->fetchAll(
                "SELECT mm.id
                 FROM module_marks mm
                 LEFT JOIN modules m    ON m.module_id  = mm.module_id
                 LEFT JOIN `student` st ON st.regnumber = mm.student_regnumber
                 WHERE $whereSql AND mm.status <> 'confirmed'
                 LIMIT 100000",
                $args
            );
            if (count($ids) === 0) {
                $this->success($response, ['approved' => 0], 'Nothing to approve — those marks are already confirmed.');
            }
            $idList = array_map(fn($r) => (int)$r['id'], $ids);
            $affected = 0;
            foreach (array_chunk($idList, 5000) as $chunk) {
                $ph = implode(',', array_fill(0, count($chunk), '?'));
                $affected += (int)$this->db->execute(
                    "UPDATE module_marks
                     SET status = 'confirmed',
                         confirmed_at = COALESCE(confirmed_at, NOW()),
                         confirmed_by = COALESCE(confirmed_by, ?)
                     WHERE id IN ($ph)",
                    array_merge([$userId], $chunk)
                );
            }
        }

        SystemLogService::log(
            'deliberation.approve_marks',
            'Deliberation',
            "Approved (confirmed) {$affected} mark row(s) from the deliberation board.",
            null,
            'module_marks',
            ['affected' => $affected]
        );

        $this->success($response, ['approved' => $affected], 'Marks approved and locked.');
    }

    public function studentMarks(Request $request, Response $response): never
    {
        $reg = trim((string)($request->query('regnumber') ?? ''));
        if ($reg === '') {
            $this->error($response, 'regnumber is required.', 422);
        }

        $student = $this->db->fetchOne(
            "SELECT st.id, st.regnumber, st.fname, st.lname, st.gender AS sex,
                    st.current_level, st.intake, st.std_option, st.student_state,
                    prog.name AS declared_program, prog.acro AS declared_program_acro
             FROM `student` st
             LEFT JOIN options prog ON CAST(prog.id AS CHAR) COLLATE utf8mb4_unicode_ci = st.std_option COLLATE utf8mb4_unicode_ci
             WHERE st.regnumber = ? LIMIT 1",
            [$reg]
        );

        $marks = $this->db->fetchAll(
            "SELECT mm.id, mm.module_id, m.module_code, m.module_name,
                    m.module_credits, m.level,
                    d.dep_id, d.dep_name,
                    mm.cat_marks, mm.exam_marks, mm.total, mm.percentage,
                    mm.grade, mm.decision, mm.status,
                    t.id AS term_id, t.label AS term_label,
                    (SELECT GROUP_CONCAT(DISTINCT o.name ORDER BY o.name SEPARATOR ' · ')
                       FROM module_programs mp
                       JOIN options o ON o.id = mp.option_id
                      WHERE mp.module_id = mm.module_id) AS programs
             FROM module_marks mm
             LEFT JOIN modules m       ON m.module_id = mm.module_id
             LEFT JOIN departements d  ON d.dep_id   = m.department
             LEFT JOIN academic_terms t ON t.id      = mm.academic_term_id
             WHERE mm.student_regnumber = ?
             ORDER BY d.dep_name ASC, m.level ASC, m.module_code ASC",
            [$reg]
        );

        // Per-student roll-up so the detail header can show a quick summary.
        $passed = 0; $failed = 0; $pctSum = 0.0; $pctCount = 0;
        foreach ($marks as $mk) {
            $pct = $this->dec($mk['percentage']);
            if ($pct !== null) {
                $pctSum += $pct; $pctCount++;
                if ($pct >= self::PASS_MARK) $passed++; else $failed++;
            }
        }

        if ($student) {
            $student['current_level_name'] = \App\Helpers\LevelHelper::name($student['current_level'] ?? null) ?: null;
        }

        $this->success($response, [
            'student'   => $student ?: ['regnumber' => $reg],
            'marks'     => \App\Helpers\LevelHelper::decorate($marks),
            'pass_mark' => self::PASS_MARK,
            'summary'   => [
                'modules' => count($marks),
                'passed'  => $passed,
                'failed'  => $failed,
                'avg_pct' => $pctCount > 0 ? round($pctSum / $pctCount, 2) : null,
            ],
        ], 'Student marks loaded.');
    }

    private function authUserId(Request $request): int
    {
        $user = (array)($request->param('_auth_user') ?? []);
        return (int)($user['id'] ?? 0);
    }

    /* ══════════════════════════════════════════════════════════════════════
     * Deliberation session management (formal committee workflow)
     * ═══════════════════════════════════════════════════════════════════ */

    /**
     * GET /api/deliberation/sessions
     * List all deliberation sessions, newest first.
     */
    public function listSessions(Request $request, Response $response): never
    {
        $yearId = (int)($request->query('academic_year_id') ?? 0);
        $args   = [];
        $where  = '1=1';
        if ($yearId > 0) {
            $where  = 'd.academic_year_id = ?';
            $args[] = $yearId;
        }

        $rows = $this->db->fetchAll(
            "SELECT d.id, d.academic_year_id, d.semester, d.program_id,
                    d.convened_at, d.notes, d.finalized, d.created_by, d.created_at,
                    y.label AS year_label,
                    o.name  AS program_name, o.acro AS program_acronym,
                    u.full_name AS created_by_name
             FROM deliberations d
             LEFT JOIN academic_years y ON y.id = d.academic_year_id
             LEFT JOIN options        o ON CAST(o.id AS CHAR) COLLATE utf8mb4_unicode_ci = CAST(d.program_id AS CHAR) COLLATE utf8mb4_unicode_ci
             LEFT JOIN users          u ON u.id = d.created_by
             WHERE {$where}
             ORDER BY d.created_at DESC",
            $args
        );

        $this->success($response, $rows, 'Deliberation sessions fetched.');
    }

    /**
     * POST /api/deliberation/sessions
     * Body: { academic_year_id, semester, program_id?, convened_at?, notes? }
     */
    public function createSession(Request $request, Response $response): never
    {
        $body   = $request->body();
        $yearId = (int)($body['academic_year_id'] ?? 0);
        $sem    = (int)($body['semester']         ?? 1);

        if ($yearId <= 0) $this->error($response, 'academic_year_id is required.', 422);

        $this->db->execute(
            "INSERT INTO deliberations
               (academic_year_id, semester, program_id, convened_at, notes, created_by)
             VALUES (?, ?, ?, ?, ?, ?)",
            [
                $yearId, $sem,
                !empty($body['program_id']) ? (int)$body['program_id'] : null,
                $body['convened_at'] ?? null,
                $body['notes']       ?? null,
                $this->authUserId($request) ?: null,
            ]
        );

        $id = (int) $this->db->lastInsertId();
        SystemLogService::log('CREATE','STUDENTS',"Deliberation session #{$id} created",$id,'deliberation');
        $this->success($response, ['id' => $id], 'Deliberation session created.', 201);
    }

    /**
     * PUT /api/deliberation/sessions/:id
     * Body: { convened_at?, notes?, program_id? }
     */
    public function updateSession(Request $request, Response $response): never
    {
        $id  = (int)$request->param('id');
        $row = $this->db->fetchOne(
            "SELECT id, finalized FROM deliberations WHERE id=? LIMIT 1", [$id]
        );
        if (!$row)                $this->error($response, 'Session not found.', 404);
        if ($row['finalized'])    $this->error($response, 'Cannot edit a finalised session.', 409);

        $body = $request->body();
        $sets = [];
        $args = [];

        if (array_key_exists('notes', $body))       { $sets[] = 'notes = ?';       $args[] = $body['notes'];       }
        if (array_key_exists('convened_at', $body)) { $sets[] = 'convened_at = ?'; $args[] = $body['convened_at']; }
        if (array_key_exists('program_id', $body))  { $sets[] = 'program_id = ?';  $args[] = (int)$body['program_id'] ?: null; }

        if (empty($sets)) $this->error($response, 'No fields to update.', 422);

        $args[] = $id;
        $this->db->execute("UPDATE deliberations SET " . implode(', ', $sets) . " WHERE id=?", $args);
        $this->success($response, null, 'Session updated.');
    }


    /** Outcomes the board may record — mirrors the ENUM in migration 148. */
    private const OUTCOMES = ['promote', 'repeat_level', 'repeat_modules', 'discontinue', 'defer'];

    /**
     * GET /api/deliberation/sessions/:id/decisions
     * Every decision recorded for a session, with the student's name and
     * current level so the board can see what it is about to apply.
     */
    public function listDecisions(Request $request, Response $response): never
    {
        $id = (int) $request->param('id');

        $rows = $this->db->fetchAll(
            "SELECT d.*,
                    TRIM(CONCAT(COALESCE(s.fname,''), ' ', COALESCE(s.lname,''))) AS student_name,
                    s.current_level AS student_current_level,
                    u.full_name AS decided_by_name
               FROM `deliberation_decisions` d
               LEFT JOIN `student` s ON s.regnumber = d.student_regnumber COLLATE utf8mb4_general_ci
               LEFT JOIN `users`   u ON u.id = d.decided_by
              WHERE d.deliberation_id = ?
              ORDER BY student_name ASC, d.student_regnumber ASC",
            [$id]
        );

        $this->success($response, $rows, 'Decisions fetched.');
    }

    /**
     * POST /api/deliberation/sessions/:id/decisions
     * Body: { decisions: [{ student_regnumber, outcome, level_from?, level_to?, carry_modules?, reason? }, …] }
     *
     * Recorded in bulk because a board works through a class in one sitting.
     * Re-posting a student overwrites their decision (the unique key makes it
     * an upsert), so the board can revise until the session is finalised.
     */
    public function saveDecisions(Request $request, Response $response): never
    {
        $id      = (int) $request->param('id');
        $session = $this->db->fetchOne(
            "SELECT id, finalized FROM deliberations WHERE id = ? LIMIT 1", [$id]
        );
        if (!$session)             $this->error($response, 'Session not found.', 404);
        if ($session['finalized']) $this->error($response, 'This session is finalised — its decisions can no longer be changed.', 409);

        $body      = $request->body();
        $decisions = $body['decisions'] ?? null;
        if (!is_array($decisions) || $decisions === []) {
            $this->error($response, 'Validation failed', 422, ['decisions' => ['Send at least one decision.']]);
        }

        $userId = $this->authUserId($request) ?: null;
        $errors = [];
        $clean  = [];

        foreach ($decisions as $i => $d) {
            $reg = trim((string) ($d['student_regnumber'] ?? ''));
            if ($reg === '') {
                $errors["decisions.{$i}"] = ['A registration number is required.'];
                continue;
            }

            $outcome = strtolower(trim((string) ($d['outcome'] ?? '')));
            if (!in_array($outcome, self::OUTCOMES, true)) {
                $errors["decisions.{$i}"] = ["\"{$outcome}\" is not a decision the board can record."];
                continue;
            }

            $from = isset($d['level_from']) && $d['level_from'] !== '' ? (int) $d['level_from'] : null;
            $to   = isset($d['level_to'])   && $d['level_to']   !== '' ? (int) $d['level_to']   : null;

            // A promotion has to say where to. Without this the outcome is
            // recorded and finalisation quietly moves nobody.
            if ($outcome === 'promote' && ($to === null || $to <= 0)) {
                $errors["decisions.{$i}"] = ['A promotion needs the level the student moves up to.'];
                continue;
            }
            // The other outcomes leave the level alone; storing a level_to for
            // them would be a lie the apply step would then act on.
            if ($outcome !== 'promote') {
                $to = null;
            }

            $clean[] = [$reg, $outcome, $from, $to,
                        trim((string) ($d['carry_modules'] ?? '')) ?: null,
                        trim((string) ($d['reason'] ?? '')) ?: null,
                        $userId];
        }

        if ($errors !== []) {
            $this->error($response, 'Some decisions could not be recorded. Nothing was saved.', 422, $errors);
        }

        foreach ($clean as $row) {
            $this->db->execute(
                "INSERT INTO `deliberation_decisions`
                   (deliberation_id, student_regnumber, outcome, level_from, level_to,
                    carry_modules, reason, decided_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                   outcome       = VALUES(outcome),
                   level_from    = VALUES(level_from),
                   level_to      = VALUES(level_to),
                   carry_modules = VALUES(carry_modules),
                   reason        = VALUES(reason),
                   decided_by    = VALUES(decided_by),
                   decided_at    = CURRENT_TIMESTAMP",
                array_merge([$id], $row)
            );
        }

        SystemLogService::log('UPDATE', 'STUDENTS', "Recorded " . count($clean) . " deliberation decision(s) on session #{$id}", $id, 'deliberation');
        $this->success($response, ['saved' => count($clean)], count($clean) . ' decision(s) recorded.');
    }

    /**
     * GET /api/deliberation/sessions/:id/decisions/preview
     *
     * What finalising WOULD change, before anything is written.
     *
     * Finalisation locks marks and rewrites student levels, and there is no
     * un-finalise. A board that discovers a mistake afterwards has no way back
     * through the UI, so the destructive step gets a dry run first.
     */
    public function previewFinalize(Request $request, Response $response): never
    {
        $id = (int) $request->param('id');
        if (!$this->db->fetchOne("SELECT id FROM deliberations WHERE id = ? LIMIT 1", [$id])) {
            $this->error($response, 'Session not found.', 404);
        }

        $rows = $this->db->fetchAll(
            "SELECT d.student_regnumber, d.outcome, d.level_to, d.applied_at,
                    TRIM(CONCAT(COALESCE(s.fname,''), ' ', COALESCE(s.lname,''))) AS student_name,
                    s.current_level, s.student_state
               FROM `deliberation_decisions` d
               LEFT JOIN `student` s ON s.regnumber = d.student_regnumber COLLATE utf8mb4_general_ci
              WHERE d.deliberation_id = ?
              ORDER BY d.outcome, student_name",
            [$id]
        );

        $counts  = array_fill_keys(self::OUTCOMES, 0);
        $changes = [];
        $missing = [];

        foreach ($rows as $r) {
            $counts[$r['outcome']] = ($counts[$r['outcome']] ?? 0) + 1;

            if ($r['student_name'] === null || $r['current_level'] === null) {
                // A decision naming a regnumber with no student row would
                // silently do nothing on apply. Surface it instead.
                $missing[] = $r['student_regnumber'];
                continue;
            }
            if ($r['outcome'] === 'promote' && (string) $r['current_level'] !== (string) $r['level_to']) {
                $changes[] = [
                    'student_regnumber' => $r['student_regnumber'],
                    'student_name'      => $r['student_name'],
                    'change'            => 'level',
                    'from'              => $r['current_level'],
                    'to'                => (string) $r['level_to'],
                    'already_applied'   => $r['applied_at'] !== null,
                ];
            }
            if ($r['outcome'] === 'discontinue' && strtolower((string) $r['student_state']) !== 'dismissed') {
                $changes[] = [
                    'student_regnumber' => $r['student_regnumber'],
                    'student_name'      => $r['student_name'],
                    'change'            => 'status',
                    'from'              => $r['student_state'],
                    'to'                => 'dismissed',
                    'already_applied'   => $r['applied_at'] !== null,
                ];
            }
        }

        $this->success($response, [
            'total_decisions' => count($rows),
            'counts'          => $counts,
            'changes'         => $changes,
            'unknown_students'=> $missing,
        ], 'Preview generated.');
    }

    /**
     * POST /api/deliberation/sessions/:id/finalize
     * Marks the session as finalised and locks all `module_marks` rows for the
     * session's program (std_option) and academic year to status='confirmed'.
     *
     * Body: { std_option? } — if not provided, uses the session's program_id.
     */
    public function finalizeSession(Request $request, Response $response): never
    {
        $id  = (int)$request->param('id');
        $row = $this->db->fetchOne(
            "SELECT id, finalized, academic_year_id, program_id FROM deliberations WHERE id=? LIMIT 1",
            [$id]
        );
        if (!$row)             $this->error($response, 'Session not found.', 404);
        if ($row['finalized']) $this->error($response, 'Session is already finalised.', 409);

        $body      = $request->body();
        $stdOption = !empty($body['std_option']) ? (string)$body['std_option'] : null;
        $yearId    = (int)$row['academic_year_id'];

        // Lock module_marks for the students in scope: all students in the
        // program (std_option), for all terms within the academic year.
        if ($stdOption || $row['program_id']) {
            $optionVal = $stdOption ?? (string)$row['program_id'];

            $this->db->execute(
                "UPDATE module_marks mm
                 JOIN academic_terms t ON t.id = mm.academic_term_id
                 SET mm.status = 'confirmed',
                     mm.confirmed_at = COALESCE(mm.confirmed_at, NOW())
                 WHERE t.academic_year_id = ?
                   AND mm.student_regnumber IN (
                       SELECT regnumber FROM `student` WHERE std_option = ?
                   )
                   AND mm.status IN ('submitted','claims_open','draft')",
                [$yearId, $optionVal]
            );
        }

        // ── Apply the board's decisions ──────────────────────────────────
        // Until now finalising only locked marks; the levels the board decided
        // on were then moved by hand, one student at a time, with nothing
        // linking the change back to the session that ordered it. This is the
        // "kwimura Promotion" half of the request.
        //
        // Only rows with applied_at IS NULL are touched, so a re-run cannot
        // double-apply, and each row is stamped as it lands.
        $decisions = $this->db->fetchAll(
            "SELECT id, student_regnumber, outcome, level_to
               FROM `deliberation_decisions`
              WHERE deliberation_id = ? AND applied_at IS NULL",
            [$id]
        );

        $promoted = 0;
        $ended    = 0;
        $skipped  = [];

        foreach ($decisions as $d) {
            $reg = (string) $d['student_regnumber'];
            $student = $this->db->fetchOne(
                // COLLATE binds to the COLUMN, not the placeholder — a bound
                // parameter is `binary` and "COLLATE utf8mb4_general_ci" on it
                // raises 1253.
                "SELECT id, current_level, student_state FROM `student`
                  WHERE regnumber COLLATE utf8mb4_general_ci = ? LIMIT 1",
                [$reg]
            );
            if (!$student) {
                // Decision names a student who is not in the table. Recorded
                // and reported rather than silently dropped.
                $skipped[] = $reg;
                continue;
            }

            if ($d['outcome'] === 'promote' && !empty($d['level_to'])) {
                // current_level is VARCHAR holding levels.id as text.
                $this->db->execute(
                    "UPDATE `student` SET current_level = ? WHERE id = ?",
                    [(string) (int) $d['level_to'], (int) $student['id']]
                );
                $promoted++;
            } elseif ($d['outcome'] === 'discontinue') {
                // Write through the same audit trail a registrar's status
                // change uses (migration 145), so a board-ordered exclusion is
                // as traceable as a manual one and shows up in the student's
                // status history with the session as its reason.
                $this->statusModel->record([
                    'student_id'     => (int) $student['id'],
                    'previous_state' => $student['student_state'] ?: null,
                    'new_state'      => 'dismissed',
                    'reason'         => "Discontinued by deliberation session #{$id}.",
                    'changed_by'     => $this->authUserId($request) ?: null,
                ]);
                $this->db->execute(
                    "UPDATE `student` SET student_state = 'dismissed' WHERE id = ?",
                    [(int) $student['id']]
                );
                $ended++;
            }
            // repeat_level / repeat_modules / defer leave the level alone by
            // design — the student stays where they are.

            $this->db->execute(
                "UPDATE `deliberation_decisions` SET applied_at = NOW() WHERE id = ?",
                [(int) $d['id']]
            );
        }

        $this->db->execute(
            "UPDATE deliberations SET finalized=1 WHERE id=?", [$id]
        );

        SystemLogService::log(
            'APPROVE',
            'STUDENTS',
            "Deliberation session #{$id} finalised — {$promoted} promoted, {$ended} discontinued",
            $id,
            'deliberation',
            ['promoted' => $promoted, 'discontinued' => $ended, 'unknown_students' => $skipped]
        );

        $this->success($response, [
            'promoted'         => $promoted,
            'discontinued'     => $ended,
            'decisions_applied'=> count($decisions) - count($skipped),
            'unknown_students' => $skipped,
        ], 'Session finalised, marks locked and decisions applied.');
    }
}

<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use Core\Database;

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

    public function __construct()
    {
        $this->db = Database::getInstance();
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
            $cur = $this->db->fetchOne(
                "SELECT id, label FROM academic_years WHERE is_current = 1 ORDER BY id DESC LIMIT 1"
            );
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
             LEFT JOIN `options` o ON CAST(o.id AS CHAR) = st.std_option
             WHERE $whereClause
             ORDER BY st.lname, st.fname
             LIMIT $perPage OFFSET $offset",
            $stArgs
        );

        // ── Modules in scope: derived from registrations of EVERY filtered
        //    student (not just the current page) so the column set stays
        //    identical as the user pages through. Exclude dropped regs.
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

        // ── Marks for the page's students × every in-scope module (joined
        //    so a student with a registration but no marks still yields an
        //    "—" cell).
        $marksByReg = [];
        if (count($students) > 0 && count($modules) > 0) {
            $regs    = array_column($students, 'regnumber');
            $regHold = implode(',', array_fill(0, count($regs), '?'));

            $marksArgs = $regs;
            $marksSql  = "SELECT mr.student_regnumber, mr.module_id,
                                 mm.cat1, mm.cat2, mm.cat3, mm.partial_exam,
                                 mm.cats_max,
                                 mm.exam_1st_sitting, mm.exam_2nd_sitting,
                                 mm.final_exam_max,
                                 mm.percentage, mm.grade, mm.decision,
                                 mm.is_exempted,
                                 m.module_credits
                          FROM module_registrations mr
                          JOIN modules m         ON m.module_id = mr.module_id
                          JOIN academic_terms t  ON t.id = mr.academic_term_id
                          LEFT JOIN module_marks mm
                                 ON mm.module_id         = mr.module_id
                                AND mm.student_regnumber = mr.student_regnumber
                                AND mm.academic_term_id  = mr.academic_term_id
                          WHERE mr.student_regnumber IN ($regHold)
                            AND mr.status <> 'dropped'";
            if ($yearId > 0) {
                $marksSql   .= " AND t.academic_year_id = ?";
                $marksArgs[] = $yearId;
            }
            $marksRows = $this->db->fetchAll($marksSql, $marksArgs);

            foreach ($marksRows as $r) {
                $reg = (string)$r['student_regnumber'];
                $mid = (int)$r['module_id'];

                $c1 = $this->dec($r['cat1']);
                $c2 = $this->dec($r['cat2']);
                $c3 = $this->dec($r['cat3']);
                $pe = $this->dec($r['partial_exam']);
                $catsTotal = ($c1 ?? 0) + ($c2 ?? 0) + ($c3 ?? 0) + ($pe ?? 0);
                $hasCats   = $c1 !== null || $c2 !== null || $c3 !== null || $pe !== null;

                $e1  = $this->dec($r['exam_1st_sitting']);
                $e2  = $this->dec($r['exam_2nd_sitting']);
                $fat = $e2 !== null ? max((float)($e1 ?? 0), (float)$e2) : $e1;

                $pct     = $this->dec($r['percentage']);
                $credits = (int)($r['module_credits'] ?? 0);
                $cp      = $pct !== null ? round($credits * $pct, 2) : null;

                $marksByReg[$reg][$mid] = [
                    'cats_60'        => $hasCats ? round($catsTotal, 2) : null,
                    'fat_40'         => $fat !== null ? round((float)$fat, 2) : null,
                    'total_100'      => $pct,
                    'credits_points' => $cp,
                    'grade'          => $r['grade'] ?? null,
                    'decision'       => $r['decision'] ?? null,
                    'is_exempted'    => (int)($r['is_exempted'] ?? 0) === 1,
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
            'modules'       => $modules,
            'students'      => $students,
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
}

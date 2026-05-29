<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use Core\Database;
use App\Services\SystemLogService;

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
            $marksSql  = "SELECT mm.student_regnumber, mm.module_id,
                                 mm.cat1, mm.cat2, mm.cat3, mm.partial_exam,
                                 mm.cats_max,
                                 mm.exam_1st_sitting, mm.exam_2nd_sitting,
                                 mm.final_exam_max,
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
                    CONCAT(u.first_name,' ',u.last_name) AS created_by_name
             FROM deliberations d
             LEFT JOIN academic_years y ON y.id = d.academic_year_id
             LEFT JOIN options        o ON CAST(o.id AS CHAR) = CAST(d.program_id AS CHAR)
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

        $id = $this->db->lastInsertId();
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

        $this->db->execute(
            "UPDATE deliberations SET finalized=1 WHERE id=?", [$id]
        );

        SystemLogService::log('APPROVE','STUDENTS',"Deliberation session #{$id} finalised",$id,'deliberation');
        $this->success($response, null, 'Session finalised and marks locked.');
    }
}

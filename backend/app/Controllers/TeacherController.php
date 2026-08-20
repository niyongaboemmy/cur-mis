<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\LecturerScope;
use App\Helpers\LevelHelper;
use App\Services\AuthService;
use App\Services\SystemLogService;
use Core\Database;
use Core\Request;
use Core\Response;

/**
 * The teacher (lecturer) self-service portal.
 *
 * Every endpoint here answers a question about the LOGGED-IN lecturer's own
 * work — their courses, their students, their timetable, their exams — and is
 * scoped through App\Helpers\LecturerScope so a lecturer can never read another
 * lecturer's class. That is the difference between this controller and the
 * admin-facing ModulesManagementController / AttendanceController /
 * ModuleMarksController, whose READ endpoints are institution-wide.
 *
 * Route group: /api/teacher/*  (gated by ACCESS_TEACHER_PORTAL)
 */
class TeacherController extends BaseController
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    // ──────────────────────────────────────────────────────────────────────
    // Identity
    // ──────────────────────────────────────────────────────────────────────

    private function userId(Request $request): int
    {
        $user = (array)$request->param('_auth_user');
        return (int)($user['id'] ?? 0);
    }

    /**
     * Resolves the term to work in: explicit ?term_id=, else the current one.
     *
     * `?term_id=all` (or `0`) means "every term" and returns null, which the
     * LecturerScope queries treat as unfiltered — needed by the courses list,
     * where a lecturer wants to see finished and future terms too.
     */
    private function resolveTermId(Request $request): ?int
    {
        $raw = trim((string)($request->query('term_id') ?? ''));
        if ($raw === 'all' || $raw === '0') {
            return null;
        }
        $q = (int)$raw;
        if ($q > 0) {
            return $q;
        }
        $row = $this->db->fetchOne(
            "SELECT id FROM `academic_terms` WHERE is_current = 1 ORDER BY id ASC LIMIT 1"
        );
        return $row ? (int)$row['id'] : null;
    }

    /**
     * Where a module sits in its own teaching window, from its timetable dates:
     *   completed  — the last block has finished
     *   upcoming   — the first block has not started yet
     *   ongoing    — running now (also the fallback when a block carries no dates,
     *                since a scheduled module with unknown dates is assumed live)
     */
    private function courseStatus(?string $startDate, ?string $endDate): string
    {
        $today = date('Y-m-d');
        if ($endDate !== null && $endDate < $today) {
            return 'completed';
        }
        if ($startDate !== null && $startDate > $today) {
            return 'upcoming';
        }
        return 'ongoing';
    }

    /**
     * Timetable blocks per module, keyed by module_id.
     *
     * This system keeps the timetable in TWO tables and both are load-bearing:
     *   • `module_schedules`  — carries `room_id`, so it is the only source that
     *                           can answer "which room?". Term-scoped.
     *   • `module_offerings`  — what AttendanceController::listScheduledBlocks
     *                           and the Marks page picker read. No room column.
     * A module scheduled in either one counts as scheduled; `module_schedules`
     * wins when both exist, because only it carries the room.
     *
     * @param  int[] $moduleIds
     * @return array<int, array<int, array<string, mixed>>>
     */
    private function schedulesForModules(array $moduleIds, ?int $termId): array
    {
        $moduleIds = array_values(array_unique(array_filter($moduleIds)));
        if ($moduleIds === []) {
            return [];
        }
        $ph  = implode(',', array_fill(0, count($moduleIds), '?'));
        $out = [];

        // ── 1. module_schedules (authoritative — has the room) ───────────────
        $args = $moduleIds;
        $termSql = '';
        if ($termId !== null && $termId > 0) {
            $termSql = ' AND sc.academic_term_id = ?';
            $args[]  = $termId;
        }
        $rows = $this->db->fetchAll(
            "SELECT sc.module_id, sc.day_of_week, sc.start_time, sc.end_time,
                    sc.start_date, sc.end_date, sc.session_type,
                    rm.name AS room_name, rm.building
             FROM `module_schedules` sc
             LEFT JOIN `rooms` rm ON rm.id = sc.room_id
             WHERE sc.module_id IN ($ph){$termSql}
             ORDER BY sc.day_of_week ASC, sc.start_time ASC",
            $args
        );
        foreach ($rows as $r) {
            $out[(int)$r['module_id']][] = [
                'day_of_week'  => $r['day_of_week'] !== null ? (int)$r['day_of_week'] : null,
                'start_time'   => $r['start_time'],
                'end_time'     => $r['end_time'],
                'start_date'   => $r['start_date'],
                'end_date'     => $r['end_date'],
                'session_type' => $r['session_type'] ?: 'lecture',
                'room'         => $r['room_name'] ?: null,
                'building'     => $r['building'] ?: null,
                'source'       => 'schedule',
            ];
        }

        // ── 2. module_offerings, only for modules with no schedule row ───────
        $missing = array_values(array_diff($moduleIds, array_keys($out)));
        if ($missing !== []) {
            $ph2  = implode(',', array_fill(0, count($missing), '?'));
            $rows = $this->db->fetchAll(
                "SELECT mo.module_id, mo.day_of_week, mo.start_time, mo.end_time,
                        mo.start_date, mo.end_date, mo.activity
                 FROM `module_offerings` mo
                 WHERE mo.module_id IN ($ph2)
                 ORDER BY mo.start_date ASC, mo.start_time ASC",
                $missing
            );
            foreach ($rows as $r) {
                $out[(int)$r['module_id']][] = [
                    'day_of_week'  => $r['day_of_week'] !== null ? (int)$r['day_of_week'] : null,
                    'start_time'   => $r['start_time'],
                    'end_time'     => $r['end_time'],
                    'start_date'   => $r['start_date'],
                    'end_date'     => $r['end_date'],
                    'session_type' => $r['activity'] ?: 'lecture',
                    'room'         => null,
                    'building'     => null,
                    'source'       => 'offering',
                ];
            }
        }

        return $out;
    }

    /**
     * Enriches one assignment row into the course payload the UI consumes —
     * enrolment, marks progress, attendance rate, teaching window and status.
     *
     * Shared by the courses list and the single-course detail endpoint so the
     * card, the list row and the detail header can never disagree.
     *
     * @param  array<string,mixed>              $a      LecturerScope assignment row
     * @param  array<int,array<string,mixed>>   $blocks timetable blocks for the module
     * @return array<string,mixed>
     */
    private function buildCourse(array $a, array $blocks): array
    {
        $moduleId = (int)$a['module_id'];
        $term     = (int)$a['term_id'];

        $students = (int)($this->db->fetchOne(
            "SELECT COUNT(*) AS n FROM `module_registrations`
             WHERE module_id = ? AND academic_term_id = ? AND status <> 'dropped'",
            [$moduleId, $term]
        )['n'] ?? 0);

        $marks = $this->db->fetchOne(
            "SELECT COUNT(*) AS n,
                    SUM(CASE WHEN total IS NOT NULL THEN 1 ELSE 0 END) AS scored,
                    MAX(status) AS status
             FROM `module_marks`
             WHERE module_id = ? AND academic_term_id = ?",
            [$moduleId, $term]
        ) ?: [];

        $att = $this->db->fetchOne(
            "SELECT
                COUNT(DISTINCT s.id) AS sessions,
                SUM(CASE WHEN r.status IN ('present','late') THEN 1 ELSE 0 END) AS present,
                COUNT(r.id) AS marked
             FROM `attendance_sessions` s
             LEFT JOIN `attendance_records` r ON r.session_id = s.id
             WHERE s.module_id = ? AND s.academic_term_id = ?",
            [$moduleId, $term]
        ) ?: [];

        $marked  = (int)($att['marked'] ?? 0);
        $present = (int)($att['present'] ?? 0);

        // Overall teaching window = earliest start / latest end across blocks.
        $starts = array_values(array_filter(array_column($blocks, 'start_date')));
        $ends   = array_values(array_filter(array_column($blocks, 'end_date')));
        sort($starts);
        rsort($ends);
        $startDate = $starts[0] ?? null;
        $endDate   = $ends[0] ?? null;

        return [
            'status'          => $blocks === [] ? 'unscheduled' : $this->courseStatus($startDate, $endDate),
            'schedules'       => $blocks,
            'is_scheduled'    => $blocks !== [],
            'start_date'      => $startDate,
            'end_date'        => $endDate,
            'rooms'           => implode(', ', array_values(array_unique(array_filter(
                                    array_column($blocks, 'room'))))),
            'assignment_id'   => (int)$a['assignment_id'],
            'module_id'       => $moduleId,
            'module_code'     => trim((string)$a['module_code']),
            'module_name'     => trim((string)$a['module_name']),
            'module_credits'  => $a['module_credits'] !== null ? (int)$a['module_credits'] : null,
            'level'           => $a['level'] !== null ? (int)$a['level'] : null,
            'level_name'      => LevelHelper::name($a['level'] ?? null) ?: null,
            'department_id'   => $a['department_id'] !== null ? (int)$a['department_id'] : null,
            'role'            => (string)$a['role'],
            'hours_per_week'  => $a['hours_per_week'] !== null ? (float)$a['hours_per_week'] : null,
            'term_id'         => $term,
            'term_label'      => $a['term_label'] ?? null,
            'students'        => $students,
            'marks_status'    => $marks['status'] ?? null,
            'marks_scored'    => (int)($marks['scored'] ?? 0),
            'attendance_sessions' => (int)($att['sessions'] ?? 0),
            'attendance_rate' => $marked > 0 ? round($present * 100 / $marked, 1) : null,
        ];
    }

    /**
     * GET /api/teacher/courses/:moduleId
     *
     * One course, in exactly the shape the list returns — so the detail page can
     * be opened directly (deep link, refresh, bookmark) without the list having
     * been loaded first.
     */
    public function courseDetail(Request $request, Response $response): never
    {
        $moduleId = (int)$request->param('moduleId');
        if ($moduleId <= 0) {
            $this->error($response, 'A module id is required.', 422);
        }
        $this->ensureTeaches($request, $response, $moduleId);

        $uid  = $this->userId($request);
        $want = $this->resolveTermId($request);
        $all  = LecturerScope::assignments($this->db, $uid, null);

        // Honour ?term_id first — otherwise the detail header could resolve a
        // different term than the card that was clicked and report a completely
        // different roster/room. Falls back to the most recent term only when no
        // specific term was asked for (or the module was not taught in it).
        $match = null;
        foreach ($all as $a) {
            if ((int)$a['module_id'] !== $moduleId) continue;
            if ($want !== null && (int)$a['term_id'] === $want) { $match = $a; break; }
            if ($match === null || (int)$a['term_id'] > (int)$match['term_id']) {
                $match = $a;
            }
        }
        // A superadmin holds no teaching assignment, so the loop above finds
        // nothing and every course would 404 for them — including the ones they
        // are the only role allowed to manage enrolment on. Fall back to the
        // catalogue row so the page opens; the shape is identical, with the
        // assignment-only fields left null.
        if ($match === null && AuthService::isSuperadmin((array)$request->param('_auth_user'))) {
            $row = $this->db->fetchOne(
                // `m.department` aliased to department_id, matching LecturerScope
                // — the column is named `department` on `modules`.
                "SELECT m.module_id, m.module_code, m.module_name, m.module_credits,
                        m.level, m.department AS department_id
                   FROM `modules` m WHERE m.module_id = ? LIMIT 1",
                [$moduleId]
            );
            if ($row) {
                $term = $want ?? $this->resolveTermId($request);
                $termRow = $term !== null
                    ? ($this->db->fetchOne(
                        "SELECT label FROM `academic_terms` WHERE id = ? LIMIT 1", [$term]
                      ) ?: null)
                    : null;
                $match = $row + [
                    'assignment_id'  => 0,
                    'term_id'        => (int)($term ?? 0),
                    'term_label'     => $termRow['label'] ?? null,
                    'role'           => 'primary',
                    'hours_per_week' => null,
                ];
            }
        }
        if ($match === null) {
            $this->error($response, 'Course not found.', 404);
        }

        $blocks = $this->schedulesForModules([$moduleId], (int)$match['term_id']);

        $this->success(
            $response,
            $this->buildCourse($match, $blocks[$moduleId] ?? []),
            'Course fetched.',
        );
    }

    /**
     * POST /api/teacher/courses/:moduleId/students
     *
     * Enrol students onto one of the lecturer's own courses.
     *
     * The admin route (POST /api/modules/registrations) requires
     * MANAGE_MODULE_REGISTRATIONS, which lecturers do not hold — so without
     * this a teacher looking at an empty class list had no way to populate it.
     * Scoped by ensureTeaches(), so a lecturer can only enrol into a module
     * they actually teach.
     *
     * Body: { regnumbers: string[] }
     */
    public function enrolStudents(Request $request, Response $response): never
    {
        $moduleId = (int)$request->param('moduleId');
        if ($moduleId <= 0) {
            $this->error($response, 'A module id is required.', 422);
        }
        $this->ensureTeaches($request, $response, $moduleId);

        $termId = $this->resolveTermId($request);
        if ($termId === null || $termId <= 0) {
            $this->error($response, 'No current academic term — cannot enrol.', 422);
        }

        $body = $request->body();
        $regs = $body['regnumbers'] ?? null;
        if (!is_array($regs) || $regs === []) {
            $this->error($response, 'A non-empty `regnumbers` array is required.', 422);
        }

        // Validate every regnumber up-front so a bad one cannot leave a partial
        // enrolment behind.
        $clean = [];
        foreach ($regs as $r) {
            $reg = trim((string)$r);
            if ($reg === '') {
                continue;
            }
            $exists = $this->db->fetchOne(
                "SELECT 1 AS ok FROM `student` WHERE regnumber = ? LIMIT 1",
                [$reg]
            );
            if (!$exists) {
                $this->error($response, "No student found with registration number \"{$reg}\".", 422);
            }
            $clean[$reg] = true;
        }
        if ($clean === []) {
            $this->error($response, 'No valid registration numbers supplied.', 422);
        }

        $added = 0;
        $already = 0;
        foreach (array_keys($clean) as $reg) {
            $has = $this->db->fetchOne(
                "SELECT id, status FROM `module_registrations`
                  WHERE module_id = ? AND student_regnumber = ? AND academic_term_id = ? LIMIT 1",
                [$moduleId, $reg, $termId]
            );
            if ($has) {
                // Re-enrolling someone previously dropped should bring them back
                // rather than silently doing nothing.
                if (($has['status'] ?? '') === 'dropped') {
                    $this->db->execute(
                        "UPDATE `module_registrations` SET status = 'registered' WHERE id = ?",
                        [(int)$has['id']]
                    );
                    $added++;
                } else {
                    $already++;
                }
                continue;
            }
            $this->db->execute(
                "INSERT INTO `module_registrations`
                    (module_id, student_regnumber, academic_term_id, status)
                 VALUES (?,?,?, 'registered')",
                [$moduleId, $reg, $termId]
            );
            $added++;
        }

        $msg = "Enrolled {$added} student(s).";
        if ($already > 0) {
            $msg .= " {$already} already registered.";
        }
        $this->success($response, ['added' => $added, 'already' => $already], $msg);
    }

    /**
     * GET /api/teacher/courses/:moduleId/students/removal-impact?regnumber=…
     *
     * Exactly what removing this student would delete, so the confirmation
     * dialog states real numbers instead of a vague "this cannot be undone".
     *
     * A GET with the regnumber in the QUERY STRING rather than the path:
     * registration numbers contain slashes ("STD/2026/23006"), which break
     * path-segment matching but survive URL-encoding in a query value.
     */
    public function removalImpact(Request $request, Response $response): never
    {
        $moduleId = (int)$request->param('moduleId');
        $reg      = trim((string)($request->query('regnumber') ?? ''));
        if ($moduleId <= 0 || $reg === '') {
            $this->error($response, 'A module id and registration number are required.', 422);
        }
        $this->ensureTeaches($request, $response, $moduleId);

        $impact = $this->removalImpactFor($moduleId, $reg, $this->resolveTermId($request));
        // Drives the dialog: without this the UI would offer a purge the API
        // will refuse. Resolved server-side so the two can never disagree.
        $impact['can_purge'] = AuthService::isSuperadmin((array)$request->param('_auth_user'));

        $this->success($response, $impact, 'Removal impact resolved.');
    }

    /**
     * Every row a purge would delete, counted, and split by term.
     *
     * The term split is not cosmetic. `module_marks` is NOT constrained to the
     * terms a student is registered for — legacy imports left marks in terms
     * with no matching registration — and the deliberation grid reads
     * `module_marks` directly and deliberately, "so a recorded mark surfaces
     * even when the matching `module_registrations` row is missing, dropped, or
     * recorded in a different term" (DeliberationController). So a removal
     * scoped to the course's own term can delete the registration and still
     * leave a confirmed grade behind that keeps the student turning up in
     * deliberation. The dialog surfaces that rather than silently picking one
     * behaviour for the superadmin.
     */
    private function removalImpactFor(int $moduleId, string $reg, ?int $termId): array
    {
        $hasTerm = $termId !== null && $termId > 0;
        $tp      = $hasTerm ? [$moduleId, $reg, $termId] : [$moduleId, $reg];

        // `?: null` matters: fetchOne returns FALSE when nothing matches, and
        // `false !== null`, so a bare null-check would report every student as
        // registered and hand the caller a phantom row to delete.
        $student = $this->db->fetchOne(
            "SELECT TRIM(CONCAT(COALESCE(fname,''),' ',COALESCE(lname,''))) AS full_name
               FROM `student` WHERE regnumber = ? LIMIT 1",
            [$reg]
        ) ?: null;

        $registration = $this->db->fetchOne(
            "SELECT id, status, academic_term_id FROM `module_registrations`
              WHERE module_id = ? AND student_regnumber = ?"
              . ($hasTerm ? ' AND academic_term_id = ?' : '')
              . ' ORDER BY id DESC LIMIT 1',
            $tp
        ) ?: null;

        $marks = $this->count(
            "SELECT COUNT(*) AS n FROM `module_marks`
              WHERE module_id = ? AND student_regnumber = ?"
              . ($hasTerm ? ' AND academic_term_id = ?' : ''),
            $tp
        );

        $attendance = $this->count(
            "SELECT COUNT(*) AS n
               FROM `attendance_records` ar
               JOIN `attendance_sessions` s ON s.id = ar.session_id
              WHERE s.module_id = ? AND ar.student_regnumber = ?"
              . ($hasTerm ? ' AND s.academic_term_id = ?' : ''),
            $tp
        );

        // exam_schedules.term_id is nullable, and a sitting with no term still
        // belongs to this module — excluding it would under-count the warning.
        $examAttendance = !$this->tableExists('exam_attendance') ? 0 : $this->count(
            "SELECT COUNT(*) AS n
               FROM `exam_attendance` ea
               JOIN `exam_schedules` es ON es.id = ea.exam_schedule_id
              WHERE es.module_id = ? AND ea.student_regnumber = ?"
              . ($hasTerm ? ' AND (es.term_id = ? OR es.term_id IS NULL)' : ''),
            $tp
        );

        // Reachable only through module_marks.id, and the table carries no
        // foreign key — so once the mark goes, an orphan here is unfindable.
        $revaluations = !$this->tableExists('revaluations') ? 0 : $this->count(
            "SELECT COUNT(*) AS n
               FROM `revaluations` r
               JOIN `module_marks` mm ON mm.id = r.exam_id
              WHERE mm.module_id = ? AND mm.student_regnumber = ?"
              . ($hasTerm ? ' AND mm.academic_term_id = ?' : ''),
            $tp
        );

        // Marks for this module sitting in any OTHER term — the ones a
        // term-scoped removal would leave behind.
        $otherTerms = [];
        if ($hasTerm) {
            foreach ($this->db->fetchAll(
                "SELECT mm.academic_term_id                                   AS term_id,
                        t.label                                               AS term_label,
                        COUNT(*)                                              AS marks,
                        SUM(mm.status IN ('submitted','confirmed'))           AS locked,
                        MAX(mm.grade)                                         AS grade
                   FROM `module_marks` mm
              LEFT JOIN `academic_terms` t ON t.id = mm.academic_term_id
                  WHERE mm.module_id = ? AND mm.student_regnumber = ?
                    AND (mm.academic_term_id IS NULL OR mm.academic_term_id <> ?)
               GROUP BY mm.academic_term_id, t.label
               ORDER BY mm.academic_term_id ASC",
                [$moduleId, $reg, $termId]
            ) as $row) {
                $otherTerms[] = [
                    'term_id'    => $row['term_id'] !== null ? (int)$row['term_id'] : null,
                    'term_label' => $row['term_label'] ?: null,
                    'marks'      => (int)$row['marks'],
                    'locked'     => (int)$row['locked'] > 0,
                    'grade'      => $row['grade'] ?: null,
                ];
            }
        }

        return [
            'regnumber'   => $reg,
            'full_name'   => trim((string)($student['full_name'] ?? '')) ?: $reg,
            'term_id'     => $hasTerm ? $termId : null,
            'registered'  => $registration !== null,
            'registration_status' => $registration['status'] ?? null,
            'marks'               => $marks,
            'attendance_records'  => $attendance,
            'exam_attendance'     => $examAttendance,
            'revaluations'        => $revaluations,
            'total'               => $marks + $attendance + $examAttendance + $revaluations
                                     + ($registration !== null ? 1 : 0),
            'other_terms'         => $otherTerms,
            'other_terms_marks'   => array_sum(array_column($otherTerms, 'marks')),
        ];
    }

    /** COUNT(*) helper — every impact query returns a single `n`. */
    private function count(string $sql, array $params): int
    {
        return (int)($this->db->fetchOne($sql, $params)['n'] ?? 0);
    }

    /**
     * Both `exam_attendance` (migration 119) and `revaluations` are absent from
     * older databases. Checking beforehand keeps a missing table from aborting
     * the whole purge transaction with a 1146.
     */
    private function tableExists(string $table): bool
    {
        return (int)($this->db->fetchOne(
            "SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.TABLES
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
            [$table]
        )['n'] ?? 0) > 0;
    }

    /**
     * POST /api/teacher/courses/:moduleId/students/unenrol
     *   body: { regnumber, purge?: bool, purge_other_terms?: bool }
     *
     * Two behaviours behind one route, because they answer the same question
     * with different force:
     *
     *   purge = false (default, any assigned lecturer)
     *       Marks the registration `dropped`. Nothing is deleted, so marks and
     *       attendance keep their referent and audit history stays intact.
     *
     *   purge = true (SUPERADMIN ONLY)
     *       Deletes the registration outright along with the student's marks,
     *       attendance, exam attendance and revaluation requests for this
     *       module. Irreversible.
     *
     * The regnumber travels in the body because registration numbers contain
     * slashes ("STD/2026/23006") and would otherwise split the URL path.
     */
    public function unenrolStudent(Request $request, Response $response): never
    {
        $moduleId = (int)$request->param('moduleId');
        $body     = $request->body();
        $reg      = trim((string)($body['regnumber'] ?? ''));
        if ($moduleId <= 0 || $reg === '') {
            $this->error($response, 'A module id and registration number are required.', 422);
        }
        $this->ensureTeaches($request, $response, $moduleId);

        $termId = $this->resolveTermId($request);
        $purge  = filter_var($body['purge'] ?? false, FILTER_VALIDATE_BOOLEAN);

        if (!$purge) {
            $n = $this->db->execute(
                "UPDATE `module_registrations` SET status = 'dropped'
                  WHERE module_id = ? AND student_regnumber = ?"
                  . ($termId ? " AND academic_term_id = ?" : ""),
                $termId ? [$moduleId, $reg, $termId] : [$moduleId, $reg]
            );
            if ($n === 0) {
                $this->error($response, 'That student is not registered for this course.', 404);
            }
            $this->success($response, ['dropped' => $n, 'purged' => false],
                'Student removed from the course. Their marks and attendance were kept.');
        }

        // ── Hard removal ────────────────────────────────────────────────────
        // Gated on superadmin rather than on the module assignment: the
        // teaching check above already proves the caller owns this course, but
        // destroying a student's academic record is not a teaching act.
        $user = (array)$request->param('_auth_user');
        if (!AuthService::isSuperadmin($user)) {
            $this->error(
                $response,
                'Only a superadmin can delete a student\'s marks and attendance. '
                . 'Remove them without deleting records instead.',
                403
            );
        }

        // Widening to every term is what actually closes the deliberation leak
        // described on removalImpactFor(): a mark left in another term keeps
        // rendering with a grade long after the student was "removed".
        $allTerms = filter_var($body['purge_other_terms'] ?? false, FILTER_VALIDATE_BOOLEAN);
        $scoped   = $termId !== null && $termId > 0 && !$allTerms;

        $before = $this->removalImpactFor($moduleId, $reg, $scoped ? $termId : null);
        if (!$before['registered']
            && $before['marks'] === 0
            && $before['attendance_records'] === 0
            && $before['exam_attendance'] === 0) {
            $this->error($response, 'That student is not registered for this course.', 404);
        }

        $hasExamAttendance = $this->tableExists('exam_attendance');
        $hasRevaluations   = $this->tableExists('revaluations');

        $deleted = $this->db->transaction(function () use (
            $moduleId, $reg, $termId, $scoped, $hasExamAttendance, $hasRevaluations
        ) {
            $p  = $scoped ? [$moduleId, $reg, $termId] : [$moduleId, $reg];
            $out = ['revaluations' => 0, 'exam_attendance' => 0,
                    'attendance_records' => 0, 'marks' => 0, 'registrations' => 0];

            // ORDER MATTERS. revaluations reaches a module only through
            // module_marks.id and has no foreign key, so deleting the mark
            // first would strand a row that nothing can ever find again.
            if ($hasRevaluations) {
                $out['revaluations'] = $this->db->execute(
                    "DELETE r FROM `revaluations` r
                       JOIN `module_marks` mm ON mm.id = r.exam_id
                      WHERE mm.module_id = ? AND mm.student_regnumber = ?"
                      . ($scoped ? ' AND mm.academic_term_id = ?' : ''),
                    $p
                );
            }

            if ($hasExamAttendance) {
                $out['exam_attendance'] = $this->db->execute(
                    "DELETE ea FROM `exam_attendance` ea
                       JOIN `exam_schedules` es ON es.id = ea.exam_schedule_id
                      WHERE es.module_id = ? AND ea.student_regnumber = ?"
                      . ($scoped ? ' AND (es.term_id = ? OR es.term_id IS NULL)' : ''),
                    $p
                );
            }

            // Delete the RECORDS, never the sessions: an attendance_session is
            // a class-level object with no student column, and its children
            // cascade — dropping one would erase every other student's
            // attendance for that meeting too.
            $out['attendance_records'] = $this->db->execute(
                "DELETE ar FROM `attendance_records` ar
                   JOIN `attendance_sessions` s ON s.id = ar.session_id
                  WHERE s.module_id = ? AND ar.student_regnumber = ?"
                  . ($scoped ? ' AND s.academic_term_id = ?' : ''),
                $p
            );

            $out['marks'] = $this->db->execute(
                "DELETE FROM `module_marks`
                  WHERE module_id = ? AND student_regnumber = ?"
                  . ($scoped ? ' AND academic_term_id = ?' : ''),
                $p
            );

            $out['registrations'] = $this->db->execute(
                "DELETE FROM `module_registrations`
                  WHERE module_id = ? AND student_regnumber = ?"
                  . ($scoped ? ' AND academic_term_id = ?' : ''),
                $p
            );

            return $out;
        });

        SystemLogService::log(
            'DELETE', 'MODULES',
            "Purged student {$reg} from module #{$moduleId}"
            . ($scoped ? " (term #{$termId})" : ' (all terms)')
            . ": {$deleted['registrations']} registration(s), {$deleted['marks']} mark(s), "
            . "{$deleted['attendance_records']} attendance record(s), "
            . "{$deleted['exam_attendance']} exam attendance record(s), "
            . "{$deleted['revaluations']} revaluation(s).",
            $moduleId, 'module', $deleted + ['regnumber' => $reg, 'term_id' => $scoped ? $termId : null],
            $user ?: null
        );

        $this->success($response, ['purged' => true] + $deleted,
            "Removed {$reg} and deleted {$deleted['marks']} mark(s), "
            . "{$deleted['attendance_records']} attendance record(s) and "
            . "{$deleted['exam_attendance']} exam attendance record(s).");
    }

    /**
     * GET /api/teacher/courses/:moduleId/attendance
     *
     * Attendance for one of the lecturer's courses, both ways round: the list of
     * sessions held (with per-status counts) and a per-student tally. Powers the
     * Attendance tab on the course detail page.
     */
    public function courseAttendance(Request $request, Response $response): never
    {
        $moduleId = (int)$request->param('moduleId');
        if ($moduleId <= 0) {
            $this->error($response, 'A module id is required.', 422);
        }
        $this->ensureTeaches($request, $response, $moduleId);

        // `?? 0` would turn "all terms" (null) into the literal term 0 and match
        // nothing. Bind the term only when one was actually resolved.
        $termId   = $this->resolveTermId($request);
        $hasTerm  = $termId !== null && $termId > 0;
        $sTerm    = $hasTerm ? ' AND s.academic_term_id = ?'   : '';
        $regTerm  = $hasTerm ? ' AND reg.academic_term_id = ?' : '';

        $sessions = $this->db->fetchAll(
            "SELECT s.id, s.session_date, s.session_type, s.status, s.is_locked,
                    COUNT(r.id) AS recorded,
                    SUM(CASE WHEN r.status = 'present' THEN 1 ELSE 0 END) AS present,
                    SUM(CASE WHEN r.status = 'absent'  THEN 1 ELSE 0 END) AS absent,
                    SUM(CASE WHEN r.status = 'late'    THEN 1 ELSE 0 END) AS late,
                    SUM(CASE WHEN r.status = 'excused' THEN 1 ELSE 0 END) AS excused
             FROM `attendance_sessions` s
             LEFT JOIN `attendance_records` r ON r.session_id = s.id
             WHERE s.module_id = ?{$sTerm}
             GROUP BY s.id, s.session_date, s.session_type, s.status, s.is_locked
             ORDER BY s.session_date DESC",
            $hasTerm ? [$moduleId, $termId] : [$moduleId]
        );

        $students = $this->db->fetchAll(
            "SELECT
                reg.student_regnumber AS regnumber,
                MAX(TRIM(CONCAT(COALESCE(st.fname,''),' ',COALESCE(st.lname,'')))) AS full_name,
                COUNT(r.id) AS marked,
                SUM(CASE WHEN r.status = 'present' THEN 1 ELSE 0 END) AS present,
                SUM(CASE WHEN r.status = 'absent'  THEN 1 ELSE 0 END) AS absent,
                SUM(CASE WHEN r.status = 'late'    THEN 1 ELSE 0 END) AS late,
                SUM(CASE WHEN r.status = 'excused' THEN 1 ELSE 0 END) AS excused
             FROM `module_registrations` reg
             LEFT JOIN `student` st ON st.regnumber = reg.student_regnumber COLLATE utf8mb4_general_ci
             LEFT JOIN `attendance_sessions` s
                    ON s.module_id = reg.module_id AND s.academic_term_id = reg.academic_term_id
             LEFT JOIN `attendance_records` r
                    ON r.session_id = s.id AND r.student_regnumber = reg.student_regnumber COLLATE utf8mb4_general_ci
             WHERE reg.module_id = ? AND reg.status <> 'dropped'{$regTerm}
             GROUP BY reg.student_regnumber
             ORDER BY full_name ASC, reg.student_regnumber ASC",
            $hasTerm ? [$moduleId, $termId] : [$moduleId]
        );

        $this->success($response, [
            'sessions' => array_map(static fn ($s) => [
                'id'           => (int)$s['id'],
                'session_date' => $s['session_date'],
                'session_type' => (string)$s['session_type'],
                'status'       => (string)$s['status'],
                'is_locked'    => (int)$s['is_locked'] === 1,
                'recorded'     => (int)$s['recorded'],
                'present'      => (int)$s['present'],
                'absent'       => (int)$s['absent'],
                'late'         => (int)$s['late'],
                'excused'      => (int)$s['excused'],
            ], $sessions),
            'students' => array_map(static function ($r) {
                $marked  = (int)$r['marked'];
                $present = (int)$r['present'] + (int)$r['late'];
                return [
                    'regnumber' => (string)$r['regnumber'],
                    'full_name' => trim((string)$r['full_name']) !== ''
                                    ? trim((string)$r['full_name'])
                                    : (string)$r['regnumber'],
                    'marked'    => $marked,
                    'present'   => (int)$r['present'],
                    'absent'    => (int)$r['absent'],
                    'late'      => (int)$r['late'],
                    'excused'   => (int)$r['excused'],
                    'rate'      => $marked > 0 ? round($present * 100 / $marked, 1) : null,
                ];
            }, $students),
        ], 'Course attendance fetched.');
    }

    /** 403s unless the caller is assigned to $moduleId (in any term). */
    /**
     * Every per-course endpoint goes through here: you may only touch a module
     * you actually teach.
     *
     * Superadmin is exempt, matching TeacherPortalMiddleware and the app-wide
     * rule that superadmin bypasses permission checks. Without the exemption a
     * superadmin — who by definition holds no teaching assignment — could not
     * open a course at all, which would make the enrolment management on this
     * page unusable for the only role allowed to do it. It grants no new
     * reach: the same class lists are already readable through the admin
     * endpoints.
     */
    private function ensureTeaches(Request $request, Response $response, int $moduleId): void
    {
        if (AuthService::isSuperadmin((array)$request->param('_auth_user'))) {
            return;
        }
        $uid = $this->userId($request);
        if ($uid <= 0 || !LecturerScope::teaches($this->db, $uid, $moduleId)) {
            $this->error($response, 'You are not assigned to this module.', 403);
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // GET /api/teacher/courses
    // ──────────────────────────────────────────────────────────────────────

    /**
     * The lecturer's assigned modules, each enriched with the numbers the
     * dashboard and the course list both need: enrolled students, marks
     * progress, attendance rate — and the timetable blocks that say WHEN and
     * WHERE the module actually runs.
     *
     * By default only SCHEDULED modules are returned: an assignment with no
     * timetable block is not something a lecturer can teach, take attendance
     * for, or turn up to, so showing it is noise. Pass `?scheduled=0` to get
     * every assignment including the unscheduled ones.
     */
    public function courses(Request $request, Response $response): never
    {
        $uid = $this->userId($request);
        if ($uid <= 0) {
            $this->error($response, 'No user record linked to this account.', 400);
        }

        $termId      = $this->resolveTermId($request);
        $assignments = LecturerScope::assignments($this->db, $uid, $termId);
        $scheduledOnly = ((string)($request->query('scheduled') ?? '1')) !== '0';

        // ?status=ongoing|upcoming|completed (comma-separated, or 'all').
        $statusRaw = strtolower(trim((string)($request->query('status') ?? 'all')));
        $wanted    = ($statusRaw === '' || $statusRaw === 'all')
            ? null
            : array_values(array_filter(array_map('trim', explode(',', $statusRaw))));

        // ?q= free-text over module code and name.
        $needle = strtolower(trim((string)($request->query('q') ?? '')));

        $schedules = $this->schedulesForModules(
            array_map(static fn ($a) => (int)$a['module_id'], $assignments),
            $termId,
        );

        $out = [];
        foreach ($assignments as $a) {
            $moduleId = (int)$a['module_id'];
            $term     = (int)$a['term_id'];

            $blocks = $schedules[$moduleId] ?? [];
            if ($scheduledOnly && $blocks === []) {
                continue;
            }

            if ($needle !== ''
                && !str_contains(strtolower((string)$a['module_code']), $needle)
                && !str_contains(strtolower((string)$a['module_name']), $needle)) {
                continue;
            }

            $course = $this->buildCourse($a, $blocks);

            if ($wanted !== null && !in_array($course['status'], $wanted, true)) {
                continue;
            }

            $out[] = $course;
        }

        // Ongoing first (what you teach today), then what is coming, then the
        // archive newest-first. Within a group, by start date then code.
        $rank = ['ongoing' => 0, 'upcoming' => 1, 'unscheduled' => 2, 'completed' => 3];
        usort($out, static function (array $x, array $y) use ($rank): int {
            $rx = $rank[$x['status']] ?? 9;
            $ry = $rank[$y['status']] ?? 9;
            if ($rx !== $ry) {
                return $rx <=> $ry;
            }
            if ($x['status'] === 'completed') {
                // Most recently finished first.
                $c = strcmp((string)$y['end_date'], (string)$x['end_date']);
                if ($c !== 0) return $c;
            } else {
                $c = strcmp((string)$x['start_date'], (string)$y['start_date']);
                if ($c !== 0) return $c;
            }
            return strcmp((string)$x['module_code'], (string)$y['module_code']);
        });

        $this->success($response, $out, 'My courses fetched.');
    }

    // ──────────────────────────────────────────────────────────────────────
    // GET /api/teacher/courses/:moduleId/students
    // ──────────────────────────────────────────────────────────────────────

    /** The class list for one of the lecturer's modules. */
    public function courseStudents(Request $request, Response $response): never
    {
        $moduleId = (int)$request->param('moduleId');
        if ($moduleId <= 0) {
            $this->error($response, 'A module id is required.', 422);
        }
        $this->ensureTeaches($request, $response, $moduleId);

        // `?? 0` would turn "all terms" (null) into the literal term 0 and match
        // nothing. Bind the term only when one was actually resolved.
        $termId  = $this->resolveTermId($request);
        $hasTerm = $termId !== null && $termId > 0;
        $rTerm   = $hasTerm ? ' AND r.academic_term_id = ?' : '';

        $rows = $this->db->fetchAll(
            "SELECT
                r.student_regnumber                          AS regnumber,
                TRIM(CONCAT(COALESCE(s.fname,''),' ',COALESCE(s.lname,''))) AS full_name,
                s.gender,
                s.email,
                s.phone,
                s.photo,
                s.current_level                              AS level,
                s.student_state,
                mm.total,
                mm.percentage,
                mm.grade,
                mm.decision,
                mm.status                                    AS marks_status
             FROM `module_registrations` r
             LEFT JOIN `student` s ON s.regnumber = r.student_regnumber COLLATE utf8mb4_general_ci
             LEFT JOIN `module_marks` mm
                    ON mm.module_id = r.module_id
                   AND mm.student_regnumber = r.student_regnumber COLLATE utf8mb4_general_ci
                   AND mm.academic_term_id = r.academic_term_id
             WHERE r.module_id = ? AND r.status <> 'dropped'{$rTerm}
             ORDER BY full_name ASC, r.student_regnumber ASC",
            $hasTerm ? [$moduleId, $termId] : [$moduleId]
        );

        // Per-student attendance rate across this module's sessions.
        $attendance = [];
        foreach ($this->db->fetchAll(
            "SELECT rec.student_regnumber,
                    COUNT(*) AS marked,
                    SUM(CASE WHEN rec.status IN ('present','late') THEN 1 ELSE 0 END) AS present
             FROM `attendance_records` rec
             JOIN `attendance_sessions` ses ON ses.id = rec.session_id
             WHERE ses.module_id = ? AND ses.academic_term_id = ?
             GROUP BY rec.student_regnumber",
            [$moduleId, $termId]
        ) as $a) {
            $marked = (int)$a['marked'];
            $attendance[(string)$a['student_regnumber']] = $marked > 0
                ? round((int)$a['present'] * 100 / $marked, 1)
                : null;
        }

        $out  = [];
        $seen = [];
        foreach ($rows as $r) {
            $reg = (string)$r['regnumber'];
            // `student` contains duplicated regnumbers, so the join can return
            // the same student more than once. One row per registration.
            if (isset($seen[$reg])) {
                continue;
            }
            $seen[$reg] = true;
            $out[] = [
                'regnumber'       => $reg,
                'full_name'       => $r['full_name'] !== null && trim((string)$r['full_name']) !== ''
                                        ? trim((string)$r['full_name'])
                                        : $reg,
                'gender'          => $r['gender'] ?: null,
                'email'           => $r['email'] ?: null,
                'phone'           => $r['phone'] ?: null,
                'photo'           => $r['photo'] ?: null,
                'level'           => $r['level'] !== null ? (int)$r['level'] : null,
                'level_name'      => LevelHelper::name($r['level'] ?? null) ?: null,
                'student_state'   => $r['student_state'] ?: null,
                'total'           => $r['total'] !== null ? (float)$r['total'] : null,
                'percentage'      => $r['percentage'] !== null ? (float)$r['percentage'] : null,
                'grade'           => $r['grade'] ?: null,
                'decision'        => $r['decision'] ?: null,
                'marks_status'    => $r['marks_status'] ?: null,
                'attendance_rate' => $attendance[$reg] ?? null,
            ];
        }

        $this->success($response, $out, 'Class list fetched.');
    }

    // ──────────────────────────────────────────────────────────────────────
    // GET /api/teacher/students
    // ──────────────────────────────────────────────────────────────────────


    /**
     * GET /api/teacher/student-filters
     *
     * The intakes, classes and modes actually present in THIS lecturer's
     * classes, each with a headcount.
     *
     * Faceted rather than a full catalogue: the intakes table now carries 16
     * rows, and offering a lecturer 16 intakes when their class spans three is
     * a worse experience than the problem being fixed. Counts also make the
     * mixing visible — the report's actual complaint is that a class quietly
     * blends several cohorts.
     */
    public function studentFilters(Request $request, Response $response): never
    {
        $uid    = $this->userId($request);
        $termId = $this->resolveTermId($request);
        $ids    = LecturerScope::moduleIds($this->db, $uid, $termId);

        if ($ids === []) {
            $this->success($response, ['intakes' => [], 'levels' => [], 'modes' => []], 'No module assignments.');
        }

        $ph      = implode(',', array_fill(0, count($ids), '?'));
        $args    = $ids;
        $termSql = '';
        if ($termId !== null && $termId > 0) {
            $termSql = ' AND r.academic_term_id = ?';
            $args[]  = $termId;
        }

        // One pass over the class list; the three facets are grouped from it
        // in PHP rather than by three near-identical queries.
        // GROUP BY the registration number with MAX() aggregates, exactly as
        // students() does — NOT SELECT DISTINCT. `student.regnumber` is not
        // unique in practice (e.g. "1CUR 12AK02306" matches two rows), so a
        // DISTINCT over the joined columns yields one row per MATCH and every
        // facet count comes out inflated. Grouping first counts students.
        $rows = $this->db->fetchAll(
            "SELECT r.student_regnumber AS reg,
                    MAX(s.intake_id)     AS intake_id,
                    MAX(i.name)          AS intake_name,
                    MAX(s.intake)        AS intake_raw,
                    MAX(s.current_level) AS current_level,
                    MAX(s.program)       AS program
               FROM `module_registrations` r
               LEFT JOIN `student` s ON s.regnumber = r.student_regnumber COLLATE utf8mb4_general_ci
               LEFT JOIN `intakes` i ON i.id = s.intake_id
              WHERE r.module_id IN ($ph) AND r.status <> 'dropped'{$termSql}
              GROUP BY r.student_regnumber",
            $args
        );

        $intakes = [];
        $levels  = [];
        $modes   = [];

        foreach ($rows as $r) {
            $iid = $r['intake_id'] !== null ? (int) $r['intake_id'] : 0;
            if (!isset($intakes[$iid])) {
                $intakes[$iid] = [
                    'id'    => $iid ?: null,
                    // Unresolved rows are grouped under one honest bucket
                    // rather than being scattered as raw strings.
                    'label' => $iid ? (string) $r['intake_name'] : 'Not recorded',
                    'count' => 0,
                ];
            }
            $intakes[$iid]['count']++;

            $lvl = $r['current_level'] !== null && $r['current_level'] !== '' ? (int) $r['current_level'] : 0;
            if (!isset($levels[$lvl])) {
                $levels[$lvl] = [
                    'value' => $lvl ?: null,
                    'label' => $lvl ? (LevelHelper::name($lvl) ?: "Level {$lvl}") : 'Not recorded',
                    'count' => 0,
                ];
            }
            $levels[$lvl]['count']++;

            $mode = self::normaliseMode($r['program'] ?? null) ?? 'Not recorded';
            if (!isset($modes[$mode])) {
                $modes[$mode] = ['value' => $mode === 'Not recorded' ? null : $mode, 'label' => $mode, 'count' => 0];
            }
            $modes[$mode]['count']++;
        }

        // Busiest first — the cohort a lecturer most likely wants is the one
        // most of their class belongs to.
        $sortByCount = static function (array $a): array {
            usort($a, fn ($x, $y) => $y['count'] <=> $x['count']);
            return $a;
        };

        $this->success($response, [
            'intakes' => $sortByCount(array_values($intakes)),
            'levels'  => $sortByCount(array_values($levels)),
            'modes'   => $sortByCount(array_values($modes)),
            'total'   => count($rows),
        ], 'Student filters fetched.');
    }

    /**
     * Tidy the hand-entered mode of study.
     *
     * `student.program` holds "Day", " Day", "DAY", "Weekend" and "Holiday"
     * across 13,235 rows, so the raw value cannot be grouped on or compared
     * without folding case and stray whitespace first.
     */
    private static function normaliseMode(?string $raw): ?string
    {
        $v = ucfirst(strtolower(trim((string) $raw)));
        return $v !== '' ? $v : null;
    }

    /** Every distinct student the lecturer teaches, across all their modules. */
    public function students(Request $request, Response $response): never
    {
        $uid    = $this->userId($request);
        $termId = $this->resolveTermId($request);
        $ids    = LecturerScope::moduleIds($this->db, $uid, $termId);

        if ($ids === []) {
            $this->success($response, [], 'No students — you have no module assignments.');
        }

        $ph   = implode(',', array_fill(0, count($ids), '?'));
        $args = $ids;
        $termSql = '';
        if ($termId !== null && $termId > 0) {
            $termSql = ' AND r.academic_term_id = ?';
            $args[]  = $termId;
        }

        // Intake / class / mode filters. A lecturer's class mixes cohorts —
        // that is the problem the report describes — so these narrow the list
        // rather than replacing it.
        $filterSql = '';

        $intakeId = (int) ($request->query('intake_id') ?? 0);
        if ($intakeId > 0) {
            $filterSql .= ' AND s.intake_id = ?';
            $args[]     = $intakeId;
        }

        // "Class" is the level of study — the same value the ID card prints
        // as Class, and the only class-like grouping the schema has.
        $level = trim((string) ($request->query('level') ?? ''));
        if ($level !== '') {
            $filterSql .= ' AND CAST(NULLIF(s.current_level, \'\') AS UNSIGNED) = ?';
            $args[]     = (int) $level;
        }

        $mode = trim((string) ($request->query('mode_of_study') ?? ''));
        if ($mode !== '') {
            // `student.program` is hand-entered and holds "Day", " Day" and
            // "DAY" among others, so compare case- and space-insensitively.
            $filterSql .= ' AND UPPER(TRIM(s.program)) = ?';
            $args[]     = strtoupper($mode);
        }

        $rows = $this->db->fetchAll(
            "SELECT
                r.student_regnumber                          AS regnumber,
                -- Aggregated, not grouped: grouping by the regnumber alone keeps
                -- the temp-table key to one column and keeps `photo` (TEXT) out
                -- of the GROUP BY entirely, while still satisfying
                -- ONLY_FULL_GROUP_BY. The student join already picks one row.
                MAX(TRIM(CONCAT(COALESCE(s.fname,''),' ',COALESCE(s.lname,'')))) AS full_name,
                MAX(s.gender)        AS gender,
                MAX(s.email)         AS email,
                MAX(s.phone)         AS phone,
                MAX(s.photo)         AS photo,
                MAX(s.current_level) AS level,
                -- Intake, class and programme type: the three things the
                -- August 2026 report says a lecturer needs to tell apart the
                -- students in a mixed class. `intake_id` resolves to the
                -- catalogue (migration 146); `intake` is kept beside it
                -- because 1,749 students hold an academic-year string that
                -- resolves to no intake, and blanking them on screen would
                -- hide information the registry still has.
                MAX(s.intake_id)     AS intake_id,
                MAX(i.name)          AS intake_name,
                MAX(s.intake)        AS intake_raw,
                -- Mode of study (Day / Weekend / Holiday) already lives on
                -- `student.program` — StudentIdCardHelper prints it on the ID
                -- card. No new column was needed.
                MAX(s.program)       AS mode_of_study,
                COUNT(DISTINCT r.module_id)                  AS modules,
                GROUP_CONCAT(DISTINCT TRIM(m.module_code) ORDER BY m.module_code SEPARATOR ', ') AS module_codes
             FROM `module_registrations` r
             JOIN `modules` m  ON m.module_id = r.module_id
             LEFT JOIN `student` s ON s.regnumber = r.student_regnumber COLLATE utf8mb4_general_ci
             LEFT JOIN `intakes` i ON i.id = s.intake_id
             WHERE r.module_id IN ($ph) AND r.status <> 'dropped'{$termSql}{$filterSql}
             GROUP BY r.student_regnumber
             ORDER BY full_name ASC, r.student_regnumber ASC",
            $args
        );

        $out = [];
        foreach ($rows as $r) {
            $reg = (string)$r['regnumber'];
            $out[] = [
                'regnumber'    => $reg,
                'full_name'    => trim((string)$r['full_name']) !== '' ? trim((string)$r['full_name']) : $reg,
                'gender'       => $r['gender'] ?: null,
                'email'        => $r['email'] ?: null,
                'phone'        => $r['phone'] ?: null,
                'photo'        => $r['photo'] ?: null,
                'level'        => $r['level'] !== null ? (int)$r['level'] : null,
                'level_name'   => LevelHelper::name($r['level'] ?? null) ?: null,
                'intake_id'    => $r['intake_id'] !== null ? (int)$r['intake_id'] : null,
                // Resolved catalogue name, else the raw text the registry
                // typed, else nothing. Never a guess.
                'intake_name'  => $r['intake_name'] ?: ($r['intake_raw'] ?: null),
                'intake_resolved' => $r['intake_id'] !== null,
                'mode_of_study'=> self::normaliseMode($r['mode_of_study'] ?? null),
                'modules'      => (int)$r['modules'],
                'module_codes' => $r['module_codes'] ?: '',
            ];
        }

        $this->success($response, $out, 'My students fetched.');
    }

    // ──────────────────────────────────────────────────────────────────────
    // GET /api/teacher/calendar
    // ──────────────────────────────────────────────────────────────────────

    /**
     * The lecturer's calendar: recurring class blocks, exam sittings and their
     * own approved leave, over a date window (defaults to the next 30 days).
     */
    public function calendar(Request $request, Response $response): never
    {
        $uid    = $this->userId($request);
        $termId = $this->resolveTermId($request);
        $ids    = LecturerScope::moduleIds($this->db, $uid, $termId);

        $from = (string)($request->query('from') ?? date('Y-m-d', strtotime('-7 days')));
        $to   = (string)($request->query('to')   ?? date('Y-m-d', strtotime('+30 days')));

        $classes = [];
        $exams   = [];

        if ($ids !== []) {
            $ph = implode(',', array_fill(0, count($ids), '?'));

            // Recurring weekly class blocks, resolved through the SAME helper the
            // courses endpoints use so a module timetabled only in
            // `module_offerings` still appears here. Reading `module_schedules`
            // directly made the calendar disagree with the course list.
            $blocks = $this->schedulesForModules($ids, $termId);
            $names  = [];
            foreach ($this->db->fetchAll(
                "SELECT module_id, TRIM(module_code) AS module_code, module_name
                 FROM `modules` WHERE module_id IN ($ph)", $ids) as $m) {
                $names[(int)$m['module_id']] = $m;
            }
            $classes = [];
            $seq = 0;
            foreach ($blocks as $mid => $list) {
                foreach ($list as $b) {
                    $classes[] = [
                        'id'           => ++$seq,
                        'module_id'    => $mid,
                        'day_of_week'  => $b['day_of_week'],
                        'start_time'   => $b['start_time'],
                        'end_time'     => $b['end_time'],
                        'session_type' => $b['session_type'],
                        'start_date'   => $b['start_date'],
                        'end_date'     => $b['end_date'],
                        'module_code'  => $names[$mid]['module_code'] ?? '',
                        'module_name'  => $names[$mid]['module_name'] ?? '',
                        'room_name'    => $b['room'],
                        'building'     => $b['building'],
                    ];
                }
            }

            // Exam sittings — either for a module I teach, or one I invigilate.
            $examArgs = array_merge($ids, [$uid, $from, $to]);
            $exams = $this->db->fetchAll(
                "SELECT
                    es.id, es.module_id, es.component, es.exam_date,
                    es.start_time, es.end_time, es.invigilator_user_id,
                    TRIM(m.module_code) AS module_code, m.module_name,
                    rm.name AS room_name, rm.building, rm.capacity
                 FROM `exam_schedules` es
                 JOIN `modules` m ON m.module_id = es.module_id
                 LEFT JOIN `rooms` rm ON rm.id = es.room_id
                 WHERE (es.module_id IN ($ph) OR es.invigilator_user_id = ?)
                   AND es.exam_date BETWEEN ? AND ?
                 ORDER BY es.exam_date ASC, es.start_time ASC",
                $examArgs
            );
        }

        // The lecturer's own in-flight or granted leave, so the calendar shows
        // why they are away. Keyed on users.id, matching
        // LeaveController::myRequests. 'ChangesRequested' counts as in-flight —
        // it is still an intended absence the lecturer is working through.
        $leave = $this->db->fetchAll(
            "SELECT lr.id, lr.start_date, lr.end_date, lr.status, lr.days_requested,
                    COALESCE(lt.name, lr.leave_type) AS leave_type
             FROM `leave_requests` lr
             LEFT JOIN `leave_types` lt ON lt.id = lr.leave_type_id
             WHERE lr.user_id = ?
               AND lr.status IN ('Pending','ChangesRequested','Approved')
               AND lr.end_date >= ? AND lr.start_date <= ?
             ORDER BY lr.start_date ASC",
            [$uid, $from, $to]
        );

        $this->success($response, [
            'from'    => $from,
            'to'      => $to,
            'term_id' => $termId,
            'classes' => array_map(static fn ($c) => [
                'id'           => (int)$c['id'],
                'module_id'    => (int)$c['module_id'],
                'module_code'  => (string)$c['module_code'],
                'module_name'  => (string)$c['module_name'],
                'day_of_week'  => (int)$c['day_of_week'],
                'start_time'   => (string)$c['start_time'],
                'end_time'     => (string)$c['end_time'],
                'session_type' => (string)$c['session_type'],
                'start_date'   => $c['start_date'],
                'end_date'     => $c['end_date'],
                'room'         => $c['room_name'] ?: null,
                'building'     => $c['building'] ?: null,
            ], $classes),
            'exams' => array_map(static fn ($e) => [
                'id'            => (int)$e['id'],
                'module_id'     => (int)$e['module_id'],
                'module_code'   => (string)$e['module_code'],
                'module_name'   => (string)$e['module_name'],
                'component'     => (string)$e['component'],
                'exam_date'     => $e['exam_date'],
                'start_time'    => $e['start_time'],
                'end_time'      => $e['end_time'],
                'room'          => $e['room_name'] ?: null,
                'building'      => $e['building'] ?: null,
                'capacity'      => $e['capacity'] !== null ? (int)$e['capacity'] : null,
                'is_invigilator' => (int)($e['invigilator_user_id'] ?? 0) === $uid,
            ], $exams),
            'leave' => array_map(static fn ($l) => [
                'id'          => (int)$l['id'],
                'start_date'  => $l['start_date'],
                'end_date'    => $l['end_date'],
                'status'      => (string)$l['status'],
                'days'        => $l['days_requested'] !== null ? (float)$l['days_requested'] : null,
                'leave_type'  => $l['leave_type'] ?: null,
            ], $leave),
        ], 'Calendar fetched.');
    }

    // ──────────────────────────────────────────────────────────────────────
    // GET /api/teacher/summary
    // ──────────────────────────────────────────────────────────────────────

    /** One call powering the dashboard's stat tiles and action lists. */
    public function summary(Request $request, Response $response): never
    {
        $uid    = $this->userId($request);
        $termId = $this->resolveTermId($request);
        $ids    = LecturerScope::moduleIds($this->db, $uid, $termId);

        // Scheduled-only, so the "My courses" tile agrees with /teacher/courses,
        // which hides assignments that carry no timetable.
        $scheduledIds = array_keys($this->schedulesForModules($ids, $termId));

        $stats = [
            'courses'            => count($scheduledIds),
            'students'           => 0,
            'sessions_held'      => 0,
            'attendance_rate'    => null,
            'marks_pending'      => 0,
            'upcoming_exams'     => 0,
            'pending_leave'      => 0,
        ];
        $todayClasses   = [];
        $upcomingExams  = [];
        $marksByModule  = [];

        if ($ids !== []) {
            $ph = implode(',', array_fill(0, count($ids), '?'));

            // Every aggregate below is term-filtered to match the pages the
            // tiles link to. Without it the dashboard reported totals spanning
            // every term the lecturer has ever taught while /teacher/courses
            // showed only the current one.
            $tSql  = ($termId !== null && $termId > 0);
            $regT  = $tSql ? ' AND academic_term_id = ?'      : '';
            $sesT  = $tSql ? ' AND ses.academic_term_id = ?'  : '';
            $rT    = $tSql ? ' AND r.academic_term_id = ?'    : '';

            $stats['students'] = (int)($this->db->fetchOne(
                "SELECT COUNT(DISTINCT student_regnumber) AS n FROM `module_registrations`
                 WHERE module_id IN ($ph) AND status <> 'dropped'{$regT}",
                $tSql ? array_merge($ids, [$termId]) : $ids
            )['n'] ?? 0);

            $att = $this->db->fetchOne(
                "SELECT COUNT(DISTINCT ses.id) AS sessions,
                        COUNT(rec.id) AS marked,
                        SUM(CASE WHEN rec.status IN ('present','late') THEN 1 ELSE 0 END) AS present
                 FROM `attendance_sessions` ses
                 LEFT JOIN `attendance_records` rec ON rec.session_id = ses.id
                 WHERE ses.module_id IN ($ph){$sesT}",
                $tSql ? array_merge($ids, [$termId]) : $ids
            ) ?: [];
            $stats['sessions_held'] = (int)($att['sessions'] ?? 0);
            $marked = (int)($att['marked'] ?? 0);
            $stats['attendance_rate'] = $marked > 0
                ? round((int)($att['present'] ?? 0) * 100 / $marked, 1)
                : null;

            // A module counts as "pending marks" when at least one registered
            // student has no total recorded yet.
            $marksByModule = $this->db->fetchAll(
                "SELECT r.module_id,
                        TRIM(m.module_code) AS module_code,
                        m.module_name,
                        COUNT(*) AS enrolled,
                        SUM(CASE WHEN mm.total IS NULL THEN 1 ELSE 0 END) AS unmarked
                 FROM `module_registrations` r
                 JOIN `modules` m ON m.module_id = r.module_id
                 LEFT JOIN `module_marks` mm
                        ON mm.module_id = r.module_id
                       AND mm.student_regnumber = r.student_regnumber COLLATE utf8mb4_general_ci
                       AND mm.academic_term_id = r.academic_term_id
                 WHERE r.module_id IN ($ph) AND r.status <> 'dropped'{$rT}
                 GROUP BY r.module_id, module_code, m.module_name
                 ORDER BY unmarked DESC, module_code ASC",
                $tSql ? array_merge($ids, [$termId]) : $ids
            );
            foreach ($marksByModule as $m) {
                if ((int)$m['unmarked'] > 0) {
                    $stats['marks_pending']++;
                }
            }

            // Today's classes, by weekday (1 = Monday).
            //
            // Derived from schedulesForModules() — the SAME union of
            // `module_schedules` and `module_offerings` that courses() and
            // calendar() use. Reading module_schedules directly made the
            // dashboard say "No classes scheduled for today" for a module the
            // calendar beside it was showing, whenever that module was
            // timetabled only in module_offerings.
            $dow   = (int)date('N');
            $today = date('Y-m-d');
            $names = [];
            foreach ($this->db->fetchAll(
                "SELECT module_id, TRIM(module_code) AS module_code, module_name
                 FROM `modules` WHERE module_id IN ($ph)", $ids) as $m) {
                $names[(int)$m['module_id']] = $m;
            }
            $todayClasses = [];
            foreach ($this->schedulesForModules($ids, $termId) as $mid => $list) {
                foreach ($list as $b) {
                    if ((int)($b['day_of_week'] ?? 0) !== $dow)            continue;
                    if ($b['start_date'] !== null && $b['start_date'] > $today) continue;
                    if ($b['end_date']   !== null && $b['end_date']   < $today) continue;
                    $todayClasses[] = [
                        'module_id'    => $mid,
                        'start_time'   => $b['start_time'],
                        'end_time'     => $b['end_time'],
                        'session_type' => $b['session_type'],
                        'module_code'  => $names[$mid]['module_code'] ?? '',
                        'module_name'  => $names[$mid]['module_name'] ?? '',
                        'room_name'    => $b['room'],
                    ];
                }
            }
            usort($todayClasses, static fn ($a, $b) => strcmp((string)$a['start_time'], (string)$b['start_time']));

            $upcomingExams = $this->db->fetchAll(
                "SELECT es.id, es.module_id, es.component, es.exam_date, es.start_time, es.end_time,
                        TRIM(m.module_code) AS module_code, m.module_name,
                        rm.name AS room_name
                 FROM `exam_schedules` es
                 JOIN `modules` m ON m.module_id = es.module_id
                 LEFT JOIN `rooms` rm ON rm.id = es.room_id
                 WHERE (es.module_id IN ($ph) OR es.invigilator_user_id = ?)
                   AND es.exam_date >= CURDATE()
                 ORDER BY es.exam_date ASC, es.start_time ASC
                 LIMIT 5",
                array_merge($ids, [$uid])
            );
            // Counted separately: $upcomingExams carries LIMIT 5 for the preview
            // list, so counting it would cap the tile at 5.
            $stats['upcoming_exams'] = (int)($this->db->fetchOne(
                "SELECT COUNT(*) AS n FROM `exam_schedules` es
                 WHERE (es.module_id IN ($ph) OR es.invigilator_user_id = ?)
                   AND es.exam_date >= CURDATE()",
                array_merge($ids, [$uid])
            )['n'] ?? 0);
        }

        // Anything not yet settled — under review OR sent back for changes.
        $stats['pending_leave'] = (int)($this->db->fetchOne(
            "SELECT COUNT(*) AS n FROM `leave_requests`
             WHERE user_id = ? AND status IN ('Pending','ChangesRequested')",
            [$uid]
        )['n'] ?? 0);

        // Latest payslip, for the finance tile. Resolved through employees.user_id.
        $payslip = null;
        try {
            $payslip = $this->db->fetchOne(
                "SELECT p.period_year, p.period_month, p.net_pay, p.gross_pay
                 FROM `hr_payroll` p
                 JOIN `employees` e ON e.employee_id = p.employee_id
                 WHERE e.user_id = ?
                 ORDER BY p.period_year DESC, p.period_month DESC
                 LIMIT 1",
                [$uid]
            ) ?: null;
        } catch (\Throwable) { /* payroll shape differs — tile just stays empty */ }

        $this->success($response, [
            'term_id'        => $termId,
            'stats'          => $stats,
            'today_classes'  => array_map(static fn ($c) => [
                'module_id'    => (int)$c['module_id'],
                'module_code'  => (string)$c['module_code'],
                'module_name'  => (string)$c['module_name'],
                'start_time'   => (string)$c['start_time'],
                'end_time'     => (string)$c['end_time'],
                'session_type' => (string)$c['session_type'],
                'room'         => $c['room_name'] ?: null,
            ], $todayClasses),
            'upcoming_exams' => array_map(static fn ($e) => [
                'id'          => (int)$e['id'],
                'module_id'   => (int)$e['module_id'],
                'module_code' => (string)$e['module_code'],
                'module_name' => (string)$e['module_name'],
                'component'   => (string)$e['component'],
                'exam_date'   => $e['exam_date'],
                'start_time'  => $e['start_time'],
                'end_time'    => $e['end_time'],
                'room'        => $e['room_name'] ?: null,
            ], $upcomingExams),
            'marks_progress' => array_map(static fn ($m) => [
                'module_id'   => (int)$m['module_id'],
                'module_code' => (string)$m['module_code'],
                'module_name' => (string)$m['module_name'],
                'enrolled'    => (int)$m['enrolled'],
                'unmarked'    => (int)$m['unmarked'],
            ], $marksByModule),
            'latest_payslip' => $payslip ? [
                'period_year'  => (int)$payslip['period_year'],
                'period_month' => (int)$payslip['period_month'],
                'net_pay'      => (float)$payslip['net_pay'],
                'gross_pay'    => isset($payslip['gross_pay']) ? (float)$payslip['gross_pay'] : null,
            ] : null,
        ], 'Teacher summary fetched.');
    }

    // ──────────────────────────────────────────────────────────────────────
    // Exams
    // ──────────────────────────────────────────────────────────────────────

    /** GET /api/teacher/exams — sittings for my modules or that I invigilate. */
    public function exams(Request $request, Response $response): never
    {
        $uid = $this->userId($request);
        $ids = LecturerScope::moduleIds($this->db, $uid, null);

        if ($ids === []) {
            // Might still be invigilating something without teaching it.
            $rows = $this->db->fetchAll(
                "SELECT es.*, TRIM(m.module_code) AS module_code, m.module_name,
                        rm.name AS room_name, rm.building, rm.capacity
                 FROM `exam_schedules` es
                 JOIN `modules` m ON m.module_id = es.module_id
                 LEFT JOIN `rooms` rm ON rm.id = es.room_id
                 WHERE es.invigilator_user_id = ?
                 ORDER BY es.exam_date DESC",
                [$uid]
            );
        } else {
            $ph = implode(',', array_fill(0, count($ids), '?'));
            $rows = $this->db->fetchAll(
                "SELECT es.*, TRIM(m.module_code) AS module_code, m.module_name,
                        rm.name AS room_name, rm.building, rm.capacity
                 FROM `exam_schedules` es
                 JOIN `modules` m ON m.module_id = es.module_id
                 LEFT JOIN `rooms` rm ON rm.id = es.room_id
                 WHERE es.module_id IN ($ph) OR es.invigilator_user_id = ?
                 ORDER BY es.exam_date DESC",
                array_merge($ids, [$uid])
            );
        }

        $out = [];
        foreach ($rows as $e) {
            $examId = (int)$e['id'];
            $counts = $this->db->fetchOne(
                "SELECT COUNT(*) AS marked,
                        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) AS present,
                        SUM(CASE WHEN status = 'absent'  THEN 1 ELSE 0 END) AS absent
                 FROM `exam_attendance` WHERE exam_schedule_id = ?",
                [$examId]
            ) ?: [];

            $out[] = [
                'id'             => $examId,
                'module_id'      => (int)$e['module_id'],
                'module_code'    => (string)$e['module_code'],
                'module_name'    => (string)$e['module_name'],
                'component'      => (string)$e['component'],
                'exam_date'      => $e['exam_date'],
                'start_time'     => $e['start_time'],
                'end_time'       => $e['end_time'],
                'room'           => $e['room_name'] ?: null,
                'building'       => $e['building'] ?: null,
                'capacity'       => $e['capacity'] !== null ? (int)$e['capacity'] : null,
                'is_invigilator' => (int)($e['invigilator_user_id'] ?? 0) === $uid,
                'marked'         => (int)($counts['marked'] ?? 0),
                'present'        => (int)($counts['present'] ?? 0),
                'absent'         => (int)($counts['absent'] ?? 0),
            ];
        }

        $this->success($response, $out, 'My exams fetched.');
    }

    /** GET /api/teacher/exams/:id/attendance — roster + any saved attendance. */
    public function examAttendance(Request $request, Response $response): never
    {
        $examId = (int)$request->param('id');
        $exam   = $this->loadExamForTeacher($request, $response, $examId);

        $rows = $this->db->fetchAll(
            "SELECT
                r.student_regnumber AS regnumber,
                TRIM(CONCAT(COALESCE(s.fname,''),' ',COALESCE(s.lname,''))) AS full_name,
                s.gender, s.photo, s.current_level AS level,
                ea.status, ea.seat_no, ea.signed_in_at, ea.signed_out_at, ea.remarks
             FROM `module_registrations` r
             LEFT JOIN `student` s ON s.regnumber = r.student_regnumber COLLATE utf8mb4_general_ci
             LEFT JOIN `exam_attendance` ea
                    ON ea.exam_schedule_id = ?
                   AND ea.student_regnumber = r.student_regnumber COLLATE utf8mb4_general_ci
             WHERE r.module_id = ? AND r.status <> 'dropped'
             " . ($exam['term_id'] !== null ? "AND r.academic_term_id = ?" : "") . "
             ORDER BY full_name ASC, r.student_regnumber ASC",
            $exam['term_id'] !== null
                ? [$examId, (int)$exam['module_id'], (int)$exam['term_id']]
                : [$examId, (int)$exam['module_id']]
        );

        $students = [];
        $seenExam = [];
        foreach ($rows as $r) {
            $reg = (string)$r['regnumber'];
            if (isset($seenExam[$reg])) {
                continue; // duplicated `student` rows must not duplicate a candidate
            }
            $seenExam[$reg] = true;
            $students[] = [
                'regnumber'     => $reg,
                'full_name'     => trim((string)$r['full_name']) !== '' ? trim((string)$r['full_name']) : $reg,
                'gender'        => $r['gender'] ?: null,
                'photo'         => $r['photo'] ?: null,
                'level'         => $r['level'] !== null ? (int)$r['level'] : null,
                'level_name'    => LevelHelper::name($r['level'] ?? null) ?: null,
                'status'        => $r['status'] ?: null,
                'seat_no'       => $r['seat_no'] ?: null,
                'signed_in_at'  => $r['signed_in_at'],
                'signed_out_at' => $r['signed_out_at'],
                'remarks'       => $r['remarks'] ?: null,
            ];
        }

        $this->success($response, [
            'exam'     => $exam,
            'students' => $students,
        ], 'Exam attendance fetched.');
    }

    /** POST /api/teacher/exams/:id/attendance — upsert the sheet. */
    public function saveExamAttendance(Request $request, Response $response): never
    {
        $examId = (int)$request->param('id');
        $exam   = $this->loadExamForTeacher($request, $response, $examId);
        $uid    = $this->userId($request);

        $body    = $request->body();
        $records = $body['records'] ?? null;
        if (!is_array($records)) {
            $this->error($response, 'A `records` array is required.', 422);
        }

        $valid = ['present', 'absent', 'excused', 'malpractice'];

        // Validate the whole payload FIRST. Validating inside the write loop
        // meant a bad row half-way down left every earlier row already committed
        // while the caller got a 422 and assumed nothing had been saved.
        foreach ($records as $rec) {
            if (!is_array($rec)) {
                continue;
            }
            $st = strtolower((string)($rec['status'] ?? 'absent'));
            if (!in_array($st, $valid, true)) {
                $reg = trim((string)($rec['regnumber'] ?? '?'));
                $this->error($response, "Invalid attendance status \"{$st}\" for {$reg}.", 422);
            }
        }

        $saved   = 0;
        $skipped = [];

        foreach ($records as $rec) {
            if (!is_array($rec)) {
                continue;
            }
            $reg = trim((string)($rec['regnumber'] ?? ''));
            if ($reg === '') {
                continue;
            }
            $status = strtolower((string)($rec['status'] ?? 'absent'));

            // Only students actually registered for this module may be marked.
            $isRegistered = $this->db->fetchOne(
                "SELECT 1 AS ok FROM `module_registrations`
                 WHERE module_id = ? AND student_regnumber = ? AND status <> 'dropped' LIMIT 1",
                [(int)$exam['module_id'], $reg]
            );
            if (!$isRegistered) {
                $skipped[] = $reg;
                continue;
            }

            $this->db->execute(
                "INSERT INTO `exam_attendance`
                    (exam_schedule_id, student_regnumber, status, seat_no, room_id, remarks, recorded_by, signed_in_at)
                 VALUES (?,?,?,?,?,?,?, CASE WHEN ? = 'present' THEN NOW() ELSE NULL END)
                 ON DUPLICATE KEY UPDATE
                    `status`       = VALUES(`status`),
                    `seat_no`      = VALUES(`seat_no`),
                    `room_id`      = VALUES(`room_id`),
                    `remarks`      = VALUES(`remarks`),
                    `recorded_by`  = VALUES(`recorded_by`),
                    `signed_in_at` = COALESCE(`exam_attendance`.`signed_in_at`, VALUES(`signed_in_at`))",
                [
                    $examId,
                    $reg,
                    $status,
                    ($rec['seat_no'] ?? null) !== null && trim((string)$rec['seat_no']) !== ''
                        ? trim((string)$rec['seat_no']) : null,
                    $exam['room_id'] !== null ? (int)$exam['room_id'] : null,
                    ($rec['remarks'] ?? null) !== null && trim((string)$rec['remarks']) !== ''
                        ? trim((string)$rec['remarks']) : null,
                    $uid,
                    $status,
                ]
            );
            $saved++;
        }

        $msg = "Exam attendance saved ({$saved} student(s)).";
        if ($skipped !== []) {
            $msg .= ' Skipped ' . count($skipped) . ' not registered for this module: '
                  . implode(', ', array_slice($skipped, 0, 5))
                  . (count($skipped) > 5 ? '…' : '') . '.';
        }
        $this->success($response, ['saved' => $saved, 'skipped' => $skipped], $msg);
    }

    /**
     * Loads an exam and 403s unless the caller teaches its module or is its
     * assigned invigilator. Returns the exam as a normalised array.
     */
    private function loadExamForTeacher(Request $request, Response $response, int $examId): array
    {
        if ($examId <= 0) {
            $this->error($response, 'An exam id is required.', 422);
        }

        $exam = $this->db->fetchOne(
            "SELECT es.*, TRIM(m.module_code) AS module_code, m.module_name,
                    rm.name AS room_name, rm.building, rm.capacity
             FROM `exam_schedules` es
             JOIN `modules` m ON m.module_id = es.module_id
             LEFT JOIN `rooms` rm ON rm.id = es.room_id
             WHERE es.id = ? LIMIT 1",
            [$examId]
        );
        if (!$exam) {
            $this->error($response, 'Exam not found.', 404);
        }

        $uid           = $this->userId($request);
        $isInvigilator = (int)($exam['invigilator_user_id'] ?? 0) === $uid;
        if (!$isInvigilator && !LecturerScope::teaches($this->db, $uid, (int)$exam['module_id'])) {
            $this->error($response, 'You are not assigned to this exam.', 403);
        }

        return [
            'id'             => (int)$exam['id'],
            'module_id'      => (int)$exam['module_id'],
            'module_code'    => (string)$exam['module_code'],
            'module_name'    => (string)$exam['module_name'],
            'component'      => (string)$exam['component'],
            'exam_date'      => $exam['exam_date'],
            'start_time'     => $exam['start_time'],
            'end_time'       => $exam['end_time'],
            'term_id'        => $exam['term_id'] !== null ? (int)$exam['term_id'] : null,
            'room_id'        => $exam['room_id'] !== null ? (int)$exam['room_id'] : null,
            'room'           => $exam['room_name'] ?: null,
            'building'       => $exam['building'] ?: null,
            'capacity'       => $exam['capacity'] !== null ? (int)$exam['capacity'] : null,
            'instructor_name'=> $exam['instructor_name'] ?: null,
            'is_invigilator' => $isInvigilator,
        ];
    }
}

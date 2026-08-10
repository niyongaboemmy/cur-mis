<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use Core\Database;
use App\Constants\Permissions;
use App\Helpers\ValidationHelper;
use App\Helpers\AttendanceReportPdf;
use App\Services\AuthService;

/**
 * Attendance module controller.
 *
 * Two-table model:
 *   - attendance_sessions : one row per teacher-run class meeting
 *   - attendance_records  : one row per student per session (status)
 *
 * Scoping rules:
 *   - MANAGE_ATTENDANCE  → unrestricted (admin)
 *   - RECORD_ATTENDANCE  → can only create/edit sessions for modules they
 *                          are assigned to (module_assignments.staff_id →
 *                          staff.user_id = $authUserId)
 *   - VIEW_ATTENDANCE    → read-only, unrestricted by module
 */
class AttendanceController extends BaseController
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    /* ══════════════════════════════════════════════════════════════════════
     * Helpers
     * ═══════════════════════════════════════════════════════════════════ */

    /** Current authenticated user id (int) or 0. */
    private function authUserId(Request $request): int
    {
        $user = (array) ($request->param('_auth_user') ?? []);
        return (int) ($user['id'] ?? 0);
    }

    /** Current authenticated permissions array. */
    private function authPerms(Request $request): array
    {
        $user = (array) ($request->param('_auth_user') ?? []);
        return (array) ($user['permissions'] ?? []);
    }

    private function hasPerm(Request $request, string $slug): bool
    {
        $user = (array) ($request->param('_auth_user') ?? []);
        if (AuthService::isSuperadmin($user))
            return true;
        return in_array($slug, $this->authPerms($request), true);
    }

    /**
     * Returns the staff_id for the authenticated user, or null when the user
     * has no linked staff profile.
     */
    private function authStaffId(Request $request): ?int
    {
        $uid = $this->authUserId($request);
        if ($uid <= 0)
            return null;
        $row = $this->db->fetchOne("SELECT id FROM staff WHERE user_id = ? LIMIT 1", [$uid]);
        return $row ? (int) $row['id'] : null;
    }

    /**
     * Resolve the set of module_ids the authenticated user is allowed to
     * record attendance for. Empty array when the user has full scope
     * (MANAGE_ATTENDANCE / superadmin).
     *
     * @return ?array<int>  null = full access, [] = no modules, else list
     */
    private function teachableModuleIds(Request $request): ?array
    {
        if ($this->hasPerm($request, Permissions::MANAGE_ATTENDANCE))
            return null;

        // Delegated to the shared resolver so this guard, the marks guard, the
        // module picker and the teacher portal all agree on what "mine" means.
        // The previous inline version considered only `staff.id` and
        // `USER_OFFSET + users.id`, and `staff.user_id` is NULL on every staff
        // row, so a real lecturer resolved to zero teachable modules.
        $uid = $this->authUserId($request);
        if ($uid <= 0)
            return [];

        return \App\Helpers\LecturerScope::moduleIds($this->db, $uid);
    }

    private function ensureCanRecordForModule(Request $request, Response $response, int $moduleId): void
    {
        $allowed = $this->teachableModuleIds($request);
        if ($allowed === null)
            return; // full scope
        if (!in_array($moduleId, $allowed, true)) {
            $this->error($response, 'You are not assigned to this module.', 403);
        }
    }

    /**
     * READ-side counterpart of ensureCanRecordForModule.
     *
     * Every read endpoint here used to be institution-wide: a lecturer holding
     * VIEW_ATTENDANCE could enumerate every session, open any module's roster
     * and export any class's report. Reads are now held to the same scope as
     * writes — you may read attendance for a module you are assigned to, and
     * MANAGE_ATTENDANCE still grants the full institutional view.
     */
    private function ensureCanReadModule(Request $request, Response $response, int $moduleId): void
    {
        $allowed = $this->teachableModuleIds($request);
        if ($allowed === null)
            return; // full scope
        if ($moduleId <= 0 || !in_array($moduleId, $allowed, true)) {
            $this->error($response, 'You are not assigned to this module.', 403);
        }
    }

    /**
     * SQL fragment restricting a query to the caller's modules.
     * Returns [sql, bindings]; sql is '1=1' when the caller has full scope.
     *
     * @return array{0:string,1:array<int,int>}
     */
    private function moduleScopeSql(Request $request, string $column): array
    {
        $allowed = $this->teachableModuleIds($request);
        if ($allowed === null) {
            return ['1 = 1', []];
        }
        if ($allowed === []) {
            return ['1 = 0', []];
        }
        $ph = implode(',', array_fill(0, count($allowed), '?'));
        return ["{$column} IN ($ph)", $allowed];
    }

    /* ══════════════════════════════════════════════════════════════════════
     * "Modules I teach" — drives the picker in the Record tab
     * ═══════════════════════════════════════════════════════════════════ */

    /**
     * GET /api/attendance/scheduled-blocks
     * Returns every module_offerings block (flat, across all programmes
     * and modes) with module / programme / instructor labels joined in.
     * Powers the attendance landing table — same shape the Module
     * scheduling page consumes per programme, but unfiltered so
     * attendance can show the entire timetable at once.
     */
    public function listScheduledBlocks(Request $request, Response $response): never
    {
        // Optional permissive filters in case we want to drill in later.
        $programId = (int) ($request->query('program_id') ?? 0);
        $mode      = trim((string) ($request->query('mode') ?? ''));

        $where    = [];
        $bindings = [];
        if ($programId > 0) {
            $where[]    = 'mo.option_id = ?';
            $bindings[] = $programId;
        }
        if ($mode !== '') {
            $where[]    = 'mo.`mode` = ?';
            $bindings[] = $mode;
        }

        // Restrict to the caller's own modules unless they hold MANAGE_ATTENDANCE.
        // This endpoint feeds the module pickers on both the Attendance and Marks
        // pages; without scoping it put the entire institution's timetable on the
        // wire and the pages then narrowed it in the browser, which is not a
        // security boundary.
        [$scopeSql, $scopeArgs] = $this->moduleScopeSql($request, 'mo.module_id');
        $where[]  = $scopeSql;
        $bindings = array_merge($bindings, $scopeArgs);

        $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

        $rows = $this->db->fetchAll(
            "SELECT mo.id AS block_id, mo.module_id, mo.option_id,
                    m.module_code, m.module_name, m.level,
                    o.name AS program_name, o.code AS program_code, o.acro AS program_acro,
                    mo.start_date, mo.end_date, mo.semesters, mo.academic_year,
                    mo.day_of_week, mo.day_pattern,
                    mo.start_time, mo.end_time,
                    mo.activity, mo.`mode`,
                    mo.year_of_study, mo.campus_id,
                    COALESCE(e.full_name, mo.instructor_name) AS instructor_name,
                    mo.instructor_id
             FROM `module_offerings` mo
             JOIN `modules`  m ON m.module_id = mo.module_id
             LEFT JOIN `options`     o ON o.id = mo.option_id
             LEFT JOIN `hr_employees` e ON e.id = mo.instructor_id
             {$whereSql}
             ORDER BY mo.start_date ASC, mo.start_time ASC, m.module_code ASC",
            $bindings,
        );

        $this->success($response, ['rows' => $rows, 'count' => count($rows)], 'Scheduled blocks fetched.');
    }

    public function myTeachableModules(Request $request, Response $response): never
    {
        $termId = (int) ($request->query('academic_term_id') ?? 0);

        if ($this->hasPerm($request, Permissions::MANAGE_ATTENDANCE)) {
            // Admins see every module that has at least one teacher assigned
            // (optionally scoped to the chosen term) — NOT the full catalog,
            // because recording for modules no one teaches makes no sense.
            $sql = "SELECT DISTINCT m.module_id, m.module_code, m.module_name, m.level,
                           (SELECT s.first_name  FROM module_assignments ma2
                              LEFT JOIN staff s ON s.id = ma2.staff_id
                              WHERE ma2.module_id = m.module_id"
                . ($termId > 0 ? " AND ma2.academic_term_id = ?" : "")
                . " ORDER BY ma2.role ASC, ma2.id ASC LIMIT 1) AS teacher_first_name,
                           (SELECT s.last_name   FROM module_assignments ma3
                              LEFT JOIN staff s ON s.id = ma3.staff_id
                              WHERE ma3.module_id = m.module_id"
                . ($termId > 0 ? " AND ma3.academic_term_id = ?" : "")
                . " ORDER BY ma3.role ASC, ma3.id ASC LIMIT 1) AS teacher_last_name
                    FROM modules m
                    JOIN module_assignments ma ON ma.module_id = m.module_id
                    WHERE m.status = 'active'"
                . ($termId > 0 ? " AND ma.academic_term_id = ?" : "")
                . " ORDER BY m.module_code ASC
                    LIMIT 500";
            $bindings = [];
            if ($termId > 0) {
                // Three placeholders above use the same term id
                $bindings = [$termId, $termId, $termId];
            }
            $rows = $this->db->fetchAll($sql, $bindings);
        } else {
            // Resolved via LecturerScope so the picker shows exactly the modules
            // the write guard will accept. The previous version matched only
            // `staff.user_id`, which is NULL on every staff row, so this branch
            // always returned "No staff profile linked to this user."
            $uid = $this->authUserId($request);
            if ($uid <= 0) {
                $this->success($response, [], 'No user record linked to this account.');
            }
            // Driven by moduleIds() — the SAME resolver the write guard uses —
            // so the picker can never disagree with what you are allowed to
            // record for. It also covers modules assigned purely through the
            // timetable (module_offerings.instructor_id), which an
            // assignments-only query missed.
            $mine = \App\Helpers\LecturerScope::moduleIds($this->db, $uid, $termId > 0 ? $termId : null);
            if ($mine === []) {
                $mine = \App\Helpers\LecturerScope::moduleIds($this->db, $uid);
            }
            if ($mine === []) {
                $this->success($response, [], 'You are not assigned to any module.');
            }
            $ph   = implode(',', array_fill(0, count($mine), '?'));
            $rows = $this->db->fetchAll(
                "SELECT DISTINCT m.module_id, m.module_code, m.module_name, m.level,
                        NULL AS academic_term_id, NULL AS academic_year_id,
                        NULL AS teacher_first_name, NULL AS teacher_last_name
                 FROM modules m
                 WHERE m.module_id IN ($ph)
                 ORDER BY m.module_code ASC",
                $mine
            );
        }

        $this->success($response, $rows, 'Teachable modules fetched.');
    }

    /* ══════════════════════════════════════════════════════════════════════
     * Sessions — CRUD
     * ═══════════════════════════════════════════════════════════════════ */

    /** List sessions with filters (module, term, date range, mine only). */
    public function listSessions(Request $request, Response $response): never
    {
        $moduleId = (int) ($request->query('module_id') ?? 0);
        $termId = (int) ($request->query('academic_term_id') ?? 0);
        $dateFrom = trim((string) ($request->query('date_from') ?? ''));
        $dateTo = trim((string) ($request->query('date_to') ?? ''));
        $mineOnly = (int) ($request->query('mine') ?? 0) === 1;
        $perPage = max(1, min(100, (int) ($request->query('per_page') ?? 50)));
        $page = max(1, (int) ($request->query('page') ?? 1));

        $clauses = [];
        $bindings = [];

        if ($moduleId > 0) {
            $clauses[] = "s.module_id = ?";
            $bindings[] = $moduleId;
        }
        if ($termId > 0) {
            $clauses[] = "s.academic_term_id = ?";
            $bindings[] = $termId;
        }
        if ($dateFrom !== '') {
            $clauses[] = "s.session_date >= ?";
            $bindings[] = $dateFrom;
        }
        if ($dateTo !== '') {
            $clauses[] = "s.session_date <= ?";
            $bindings[] = $dateTo;
        }
        if ($mineOnly) {
            $clauses[] = "s.started_by = ?";
            $bindings[] = $this->authUserId($request);
        }

        // Restrict to the caller's own modules unless they hold MANAGE_ATTENDANCE.
        // Without this a lecturer could list every attendance session in the
        // institution simply by calling this endpoint with no filters.
        [$scopeSql, $scopeArgs] = $this->moduleScopeSql($request, 's.module_id');
        $clauses[] = $scopeSql;
        $bindings  = array_merge($bindings, $scopeArgs);

        $where = $clauses ? 'WHERE ' . implode(' AND ', $clauses) : '';

        $countRow = $this->db->fetchOne("SELECT COUNT(*) AS total FROM attendance_sessions s $where", $bindings);
        $total = (int) ($countRow['total'] ?? 0);

        $offset = ($page - 1) * $perPage;
        $sql = "SELECT s.*, m.module_code, m.module_name, t.label AS term_label,
                       u.full_name AS started_by_name,
                       (SELECT COUNT(*) FROM attendance_records r WHERE r.session_id = s.id) AS recorded_count,
                       (SELECT COUNT(*) FROM attendance_records r WHERE r.session_id = s.id AND r.status = 'present') AS present_count
                FROM attendance_sessions s
                LEFT JOIN modules m         ON m.module_id = s.module_id
                LEFT JOIN academic_terms t  ON t.id = s.academic_term_id
                LEFT JOIN users u           ON u.id = s.started_by
                $where
                ORDER BY s.session_date DESC, s.id DESC
                LIMIT $perPage OFFSET $offset";

        $rows = $this->db->fetchAll($sql, $bindings);

        $this->success($response, [
            'data' => $rows,
            'total' => $total,
            'page' => $page,
            'per_page' => $perPage,
            'last_page' => (int) ceil($total / $perPage),
        ], 'Sessions fetched.');
    }

    /** POST /api/attendance/sessions */
    public function createSession(Request $request, Response $response): never
    {
        $data = $request->body();

        $errors = ValidationHelper::validate($data, [
            'module_id' => ['required'],
            'academic_term_id' => ['required'],
            'session_date' => ['required'],
        ]);
        if (!empty($errors))
            $this->error($response, 'Validation failed', 422, $errors);

        $moduleId = (int) $data['module_id'];
        $this->ensureCanRecordForModule($request, $response, $moduleId);

        $sessionType = in_array(($data['session_type'] ?? ''), ['lecture', 'lab', 'tutorial', 'seminar', 'exam'], true)
            ? (string) $data['session_type'] : 'lecture';

        // De-dupe via the uniq_session constraint — try insert, fall back to
        // returning the existing row so the user can continue recording.
        try {
            $this->db->execute(
                "INSERT INTO attendance_sessions
                   (module_id, module_schedule_id, academic_term_id, session_date, session_type, notes, started_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?)",
                [
                    $moduleId,
                    isset($data['module_schedule_id']) && $data['module_schedule_id'] !== '' ? (int) $data['module_schedule_id'] : null,
                    (int) $data['academic_term_id'],
                    (string) $data['session_date'],
                    $sessionType,
                    $data['notes'] ?? null,
                    $this->authUserId($request) ?: null,
                ]
            );
            $id = (int) $this->db->lastInsertId();
        } catch (\PDOException $e) {
            if ((int) $e->getCode() === 23000) {
                $existing = $this->db->fetchOne(
                    "SELECT id FROM attendance_sessions WHERE module_id = ? AND session_date = ? AND session_type = ? LIMIT 1",
                    [$moduleId, (string) $data['session_date'], $sessionType]
                );
                $id = (int) ($existing['id'] ?? 0);
            } else {
                throw $e;
            }
        }

        $this->success($response, ['id' => $id], 'Session ready.', 201);
    }

    /**
     * GET /api/attendance/sessions/find?module_id=&date=&type=
     * Returns the matching session (if any) WITHOUT creating one. Powers the
     * "auto-load on date change" flow on the record tab.
     */
    public function findSession(Request $request, Response $response): never
    {
        $moduleId = (int) ($request->query('module_id') ?? 0);
        $date = trim((string) ($request->query('session_date') ?? ''));
        $type = (string) ($request->query('session_type') ?? 'lecture');

        if ($moduleId <= 0 || $date === '') {
            $this->success($response, ['session' => null], 'Missing filters.');
        }
        if (!in_array($type, ['lecture', 'lab', 'tutorial', 'seminar', 'exam'], true))
            $type = 'lecture';

        // Same scope as every other read here — otherwise a lecturer could probe
        // any module's session metadata by guessing module_id + date.
        $this->ensureCanReadModule($request, $response, $moduleId);

        $row = $this->db->fetchOne(
            "SELECT s.*, m.module_code, m.module_name, t.label AS term_label, u.full_name AS started_by_name,
                    (SELECT COUNT(*) FROM attendance_records r WHERE r.session_id = s.id) AS recorded_count
             FROM attendance_sessions s
             LEFT JOIN modules m         ON m.module_id = s.module_id
             LEFT JOIN academic_terms t  ON t.id = s.academic_term_id
             LEFT JOIN users u           ON u.id = s.started_by
             WHERE s.module_id = ? AND s.session_date = ? AND s.session_type = ?
             LIMIT 1",
            [$moduleId, $date, $type]
        );

        $this->success($response, ['session' => $row ?: null], 'Session lookup complete.');
    }

    /** GET /api/attendance/sessions/:id — session + roster + per-student summary. */
    public function showSession(Request $request, Response $response): never
    {
        $id = (int) $request->param('id');
        $session = $this->db->fetchOne(
            "SELECT s.*, m.module_code, m.module_name, t.label AS term_label, u.full_name AS started_by_name
             FROM attendance_sessions s
             LEFT JOIN modules m         ON m.module_id = s.module_id
             LEFT JOIN academic_terms t  ON t.id = s.academic_term_id
             LEFT JOIN users u           ON u.id = s.started_by
             WHERE s.id = ? LIMIT 1",
            [$id]
        );
        if (!$session)
            $this->error($response, 'Session not found.', 404);

        $moduleId = (int) $session['module_id'];
        $termId = (int) $session['academic_term_id'];

        // Opening a roster is a read of someone's class list — same scope as writing it.
        $this->ensureCanReadModule($request, $response, $moduleId);

        // Roster = every registered student for this module+term.
        $roster = $this->db->fetchAll(
            "SELECT st.id AS student_id, st.regnumber, st.fname, st.lname, st.email,
                    r.status AS record_status, r.remarks, r.recorded_at,
                    (
                      SELECT COUNT(*)
                      FROM attendance_records ar
                      JOIN attendance_sessions asx ON asx.id = ar.session_id
                      WHERE asx.module_id = ? AND ar.student_regnumber = st.regnumber
                    ) AS total_sessions,
                    (
                      SELECT COUNT(*)
                      FROM attendance_records ar
                      JOIN attendance_sessions asx ON asx.id = ar.session_id
                      WHERE asx.module_id = ? AND ar.student_regnumber = st.regnumber
                        AND ar.status IN ('present','late')
                    ) AS present_sessions
             FROM module_registrations mr
             JOIN student st ON st.regnumber = mr.student_regnumber
             LEFT JOIN attendance_records r
                    ON r.session_id = ? AND r.student_regnumber = st.regnumber
             WHERE mr.module_id = ? AND mr.academic_term_id = ?
               AND mr.status <> 'dropped'
             ORDER BY st.lname, st.fname",
            [$moduleId, $moduleId, $id, $moduleId, $termId]
        );

        // Attach percentages
        foreach ($roster as &$row) {
            $tot = (int) $row['total_sessions'];
            $pr = (int) $row['present_sessions'];
            $row['attendance_pct'] = $tot > 0 ? (int) round(($pr / $tot) * 100) : 0;
        }
        unset($row);

        $summary = [
            'total_roster' => count($roster),
            'present' => 0,
            'absent' => 0,
            'late' => 0,
            'excused' => 0,
            'unmarked' => 0,
        ];
        foreach ($roster as $r) {
            $s = $r['record_status'] ?: 'unmarked';
            if (!isset($summary[$s]))
                $summary[$s] = 0;
            $summary[$s]++;
        }

        $this->success($response, [
            'session' => $session,
            'roster' => $roster,
            'summary' => $summary,
        ], 'Session fetched.');
    }

    /** POST /api/attendance/sessions/:id/reopen — flip status back to open. */
    public function reopenSession(Request $request, Response $response): never
    {
        $id = (int) $request->param('id');
        $session = $this->db->fetchOne("SELECT module_id, started_by, is_locked FROM attendance_sessions WHERE id = ?", [$id]);
        if (!$session)
            $this->error($response, 'Session not found.', 404);

        if ((int) $session['is_locked'] === 1 && !$this->hasPerm($request, Permissions::MANAGE_ATTENDANCE)) {
            $this->error($response, 'This session is locked. Ask an administrator to unlock it.', 403);
        }

        if (!$this->hasPerm($request, Permissions::MANAGE_ATTENDANCE)) {
            if ((int) $session['started_by'] !== $this->authUserId($request)) {
                $this->error($response, 'Only the teacher who started this session can reopen it.', 403);
            }
            $this->ensureCanRecordForModule($request, $response, (int) $session['module_id']);
        }

        $this->db->execute("UPDATE attendance_sessions SET status = 'open' WHERE id = ?", [$id]);
        $this->success($response, ['id' => $id, 'status' => 'open'], 'Session reopened.');
    }

    /**
     * POST /api/attendance/sessions/:id/lock
     * Admin-only toggle. Body: { locked: bool } — defaults to true.
     */
    public function toggleLock(Request $request, Response $response): never
    {
        if (!$this->hasPerm($request, Permissions::MANAGE_ATTENDANCE)) {
            $this->error($response, 'Only administrators can lock or unlock attendance sessions.', 403);
        }

        $id = (int) $request->param('id');
        $session = $this->db->fetchOne("SELECT id FROM attendance_sessions WHERE id = ?", [$id]);
        if (!$session)
            $this->error($response, 'Session not found.', 404);

        $body = $request->body();
        $locked = isset($body['locked']) ? (bool) $body['locked'] : true;

        $this->db->execute("UPDATE attendance_sessions SET is_locked = ? WHERE id = ?", [$locked ? 1 : 0, $id]);
        $this->success($response, [
            'id' => $id,
            'is_locked' => $locked ? 1 : 0,
        ], $locked ? 'Session locked.' : 'Session unlocked.');
    }

    /** DELETE /api/attendance/sessions/:id */
    public function deleteSession(Request $request, Response $response): never
    {
        $id = (int) $request->param('id');
        $session = $this->db->fetchOne("SELECT module_id, started_by FROM attendance_sessions WHERE id = ?", [$id]);
        if (!$session)
            $this->error($response, 'Session not found.', 404);

        if (!$this->hasPerm($request, Permissions::MANAGE_ATTENDANCE)) {
            // teachers can only delete their own sessions
            if ((int) $session['started_by'] !== $this->authUserId($request)) {
                $this->error($response, 'You cannot delete this session.', 403);
            }
            $this->ensureCanRecordForModule($request, $response, (int) $session['module_id']);
        }

        $this->db->execute("DELETE FROM attendance_sessions WHERE id = ?", [$id]);
        $this->success($response, null, 'Session deleted.');
    }

    /* ══════════════════════════════════════════════════════════════════════
     * Records — bulk upsert
     * ═══════════════════════════════════════════════════════════════════ */

    /**
     * PUT /api/attendance/sessions/:id/records
     * Body: { records: [ { student_regnumber, status, remarks? }, ... ] }
     * Upserts every row in one pass, deleting any omitted students so the
     * roster always matches the client's state.
     */
    public function saveRecords(Request $request, Response $response): never
    {
        $id = (int) $request->param('id');
        $session = $this->db->fetchOne("SELECT id, module_id, status, is_locked FROM attendance_sessions WHERE id = ?", [$id]);
        if (!$session)
            $this->error($response, 'Session not found.', 404);

        if ((int) $session['is_locked'] === 1 && !$this->hasPerm($request, Permissions::MANAGE_ATTENDANCE)) {
            $this->error($response, 'This session is locked by an administrator.', 403);
        }

        $this->ensureCanRecordForModule($request, $response, (int) $session['module_id']);

        $body = $request->body();
        $records = $body['records'] ?? [];
        if (!is_array($records))
            $this->error($response, 'records must be an array', 422);

        $allowed = ['present', 'absent', 'late', 'excused'];
        $userId = $this->authUserId($request) ?: null;

        $saved = 0;
        foreach ($records as $r) {
            $reg = trim((string) ($r['student_regnumber'] ?? ''));
            $status = strtolower((string) ($r['status'] ?? 'present'));
            $remark = isset($r['remarks']) && $r['remarks'] !== '' ? (string) $r['remarks'] : null;

            if ($reg === '' || !in_array($status, $allowed, true))
                continue;

            $this->db->execute(
                "INSERT INTO attendance_records
                   (session_id, student_regnumber, status, remarks, recorded_by)
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                   status = VALUES(status),
                   remarks = VALUES(remarks),
                   recorded_by = VALUES(recorded_by)",
                [$id, $reg, $status, $remark, $userId]
            );
            $saved++;
        }

        $this->db->execute("UPDATE attendance_sessions SET status = 'closed' WHERE id = ? AND status = 'open'", [$id]);

        $this->success($response, ['saved' => $saved], "$saved record(s) saved.");
    }

    /* ══════════════════════════════════════════════════════════════════════
     * Overview / KPIs
     * ═══════════════════════════════════════════════════════════════════ */

    /**
     * GET /api/attendance/overview
     * Query params: academic_term_id?, module_id?, date_from?, date_to?, mine?
     */
    public function overview(Request $request, Response $response): never
    {
        $termId = (int) ($request->query('academic_term_id') ?? 0);
        $moduleId = (int) ($request->query('module_id') ?? 0);
        $dateFrom = trim((string) ($request->query('date_from') ?? ''));
        $dateTo = trim((string) ($request->query('date_to') ?? ''));
        $mineOnly = (int) ($request->query('mine') ?? 0) === 1;

        $sClauses = [];
        $sBindings = [];
        if ($termId > 0) {
            $sClauses[] = "s.academic_term_id = ?";
            $sBindings[] = $termId;
        }
        if ($moduleId > 0) {
            $sClauses[] = "s.module_id = ?";
            $sBindings[] = $moduleId;
        }
        if ($dateFrom !== '') {
            $sClauses[] = "s.session_date >= ?";
            $sBindings[] = $dateFrom;
        }
        if ($dateTo !== '') {
            $sClauses[] = "s.session_date <= ?";
            $sBindings[] = $dateTo;
        }
        if ($mineOnly) {
            $sClauses[] = "s.started_by = ?";
            $sBindings[] = $this->authUserId($request);
        }

        // Scope the whole overview to the caller's modules. Note this is broader
        // than `mine=1`, which filters on s.started_by (session OWNERSHIP) and so
        // misses sessions a colleague opened on a module you co-teach.
        [$scopeSql, $scopeArgs] = $this->moduleScopeSql($request, 's.module_id');
        $sClauses[]  = $scopeSql;
        $sBindings   = array_merge($sBindings, $scopeArgs);

        $sessWhere = $sClauses ? 'WHERE ' . implode(' AND ', $sClauses) : '';

        $totals = $this->db->fetchOne(
            "SELECT COUNT(*) AS session_count,
                    COUNT(DISTINCT s.module_id) AS module_count
             FROM attendance_sessions s
             $sessWhere",
            $sBindings
        ) ?: [];

        $statusCounts = $this->db->fetchOne(
            "SELECT
                SUM(CASE WHEN r.status = 'present' THEN 1 ELSE 0 END) AS present,
                SUM(CASE WHEN r.status = 'absent'  THEN 1 ELSE 0 END) AS absent,
                SUM(CASE WHEN r.status = 'late'    THEN 1 ELSE 0 END) AS late,
                SUM(CASE WHEN r.status = 'excused' THEN 1 ELSE 0 END) AS excused,
                COUNT(*) AS total_records
             FROM attendance_records r
             JOIN attendance_sessions s ON s.id = r.session_id
             $sessWhere",
            $sBindings
        ) ?: [];

        $totalRecords = (int) ($statusCounts['total_records'] ?? 0);
        $presentish = (int) ($statusCounts['present'] ?? 0) + (int) ($statusCounts['late'] ?? 0);
        $avgPct = $totalRecords > 0 ? (int) round(($presentish / $totalRecords) * 100) : 0;

        // Per-module breakdown (attendance % = present+late / total records)
        $byModule = $this->db->fetchAll(
            "SELECT m.module_id, m.module_code, m.module_name,
                    COUNT(DISTINCT s.id) AS sessions,
                    COUNT(r.id)           AS records,
                    SUM(CASE WHEN r.status IN ('present','late') THEN 1 ELSE 0 END) AS present_like
             FROM attendance_sessions s
             LEFT JOIN modules m           ON m.module_id = s.module_id
             LEFT JOIN attendance_records r ON r.session_id = s.id
             $sessWhere
             GROUP BY m.module_id, m.module_code, m.module_name
             ORDER BY sessions DESC, m.module_code ASC
             LIMIT 10",
            $sBindings
        );
        foreach ($byModule as &$row) {
            $r = (int) $row['records'];
            $p = (int) $row['present_like'];
            $row['attendance_pct'] = $r > 0 ? (int) round(($p / $r) * 100) : 0;
        }
        unset($row);

        // Recent sessions snapshot
        $recent = $this->db->fetchAll(
            "SELECT s.id, s.session_date, s.session_type, s.status,
                    m.module_code, m.module_name,
                    (SELECT COUNT(*) FROM attendance_records r WHERE r.session_id = s.id) AS recorded_count,
                    (SELECT COUNT(*) FROM attendance_records r WHERE r.session_id = s.id AND r.status IN ('present','late')) AS present_like
             FROM attendance_sessions s
             LEFT JOIN modules m ON m.module_id = s.module_id
             $sessWhere
             ORDER BY s.session_date DESC, s.id DESC
             LIMIT 8",
            $sBindings
        );
        foreach ($recent as &$row) {
            $r = (int) $row['recorded_count'];
            $p = (int) $row['present_like'];
            $row['attendance_pct'] = $r > 0 ? (int) round(($p / $r) * 100) : 0;
        }
        unset($row);

        // Students at risk — bottom 10 attendance % across filtered scope
        $atRisk = $this->db->fetchAll(
            "SELECT st.regnumber, st.fname, st.lname,
                    COUNT(*)                                                    AS total_records,
                    SUM(CASE WHEN r.status IN ('present','late') THEN 1 ELSE 0 END) AS present_like
             FROM attendance_records r
             JOIN attendance_sessions s ON s.id = r.session_id
             JOIN student st ON st.regnumber = r.student_regnumber
             $sessWhere
             GROUP BY st.regnumber, st.fname, st.lname
             HAVING total_records >= 1
             ORDER BY (SUM(CASE WHEN r.status IN ('present','late') THEN 1 ELSE 0 END) / COUNT(*)) ASC, total_records DESC
             LIMIT 10",
            $sBindings
        );
        foreach ($atRisk as &$row) {
            $t = (int) $row['total_records'];
            $p = (int) $row['present_like'];
            $row['attendance_pct'] = $t > 0 ? (int) round(($p / $t) * 100) : 0;
        }
        unset($row);

        $this->success($response, [
            'totals' => [
                'sessions' => (int) ($totals['session_count'] ?? 0),
                'modules' => (int) ($totals['module_count'] ?? 0),
                'records' => $totalRecords,
                'present' => (int) ($statusCounts['present'] ?? 0),
                'absent' => (int) ($statusCounts['absent'] ?? 0),
                'late' => (int) ($statusCounts['late'] ?? 0),
                'excused' => (int) ($statusCounts['excused'] ?? 0),
                'attendance_pct' => $avgPct,
            ],
            'by_module' => $byModule,
            'recent_sessions' => $recent,
            'at_risk' => $atRisk,
        ], 'Overview fetched.');
    }

    /* ══════════════════════════════════════════════════════════════════════
     * Per-student summary (used on StudentDetailsPage)
     * ═══════════════════════════════════════════════════════════════════ */

    /** Same as `studentSummary` but takes a numeric student id, used so the
     *  caller doesn't have to URL-encode regnumbers that contain slashes. */
    /**
     * A whole-student attendance history spans every module they take, so it is
     * far broader than a single module's roster and must not be readable by any
     * lecturer holding VIEW_ATTENDANCE. MANAGE_ATTENDANCE keeps the full view; a
     * lecturer may only open a student registered on one of THEIR modules.
     */
    private function ensureCanReadStudent(Request $request, Response $response, string $reg): void
    {
        $allowed = $this->teachableModuleIds($request);
        if ($allowed === null) {
            return; // full scope
        }
        if ($allowed === [] || $reg === '') {
            $this->error($response, 'You are not assigned to any of this student\'s modules.', 403);
        }
        $ph  = implode(',', array_fill(0, count($allowed), '?'));
        $hit = $this->db->fetchOne(
            "SELECT 1 AS ok FROM `module_registrations`
              WHERE student_regnumber = ? AND module_id IN ($ph) LIMIT 1",
            array_merge([$reg], $allowed)
        );
        if (!$hit) {
            $this->error($response, 'You are not assigned to any of this student\'s modules.', 403);
        }
    }

    public function studentSummaryById(Request $request, Response $response): never
    {
        $id = (int) $request->param('id');
        if ($id <= 0) {
            $this->error($response, 'student id required', 422);
        }
        $row = $this->db->fetchOne('SELECT regnumber FROM `student` WHERE id = ? LIMIT 1', [$id]);
        if (!$row || empty($row['regnumber'])) {
            $this->error($response, 'Student not found.', 404);
        }
        // Hand off to the regnumber-based handler by injecting the resolved
        // value into the route params bag the controller reads from.
        $request->setRouteParams(['regnumber' => (string) $row['regnumber']]);
        $this->studentSummary($request, $response);
    }

    /**
     * Self-service: return the authenticated student's own attendance
     * summary. Same payload as `studentSummary` — but resolves the
     * regnumber from the auth user instead of a route param, so it can
     * sit outside the VIEW_ATTENDANCE permission gate (the student is
     * only ever shown their own data).
     */
    public function meSummary(Request $request, Response $response): never
    {
        $user   = (array) ($request->param('_auth_user') ?? []);
        $userId = (int) ($user['id'] ?? 0);
        $email  = is_string($user['email'] ?? null) ? $user['email'] : null;

        if ($userId <= 0) {
            $this->error($response, 'Unauthenticated.', 401);
        }

        // user_id is set when the student claims their account; email is the
        // fallback for older rows whose user_id was never backfilled.
        $row = $this->db->fetchOne(
            'SELECT regnumber FROM `student` WHERE user_id = ? LIMIT 1',
            [$userId]
        );
        if ((!$row || empty($row['regnumber'])) && $email) {
            $row = $this->db->fetchOne(
                'SELECT regnumber FROM `student` WHERE email = ? LIMIT 1',
                [$email]
            );
        }
        if (!$row || empty($row['regnumber'])) {
            $this->error($response, 'No student record is linked to your account.', 404);
        }

        $request->setRouteParams(['regnumber' => (string) $row['regnumber']]);
        $this->studentSummary($request, $response);
    }

    public function studentSummary(Request $request, Response $response): never
    {
        $reg = trim((string) $request->param('regnumber'));
        if ($reg === '')
            $this->error($response, 'regnumber required', 422);
        $this->ensureCanReadStudent($request, $response, $reg);

        $termId = (int) ($request->query('academic_term_id') ?? 0);
        $termClauseMr = $termId > 0 ? " AND mr.academic_term_id = ?" : "";
        $termClauseS  = $termId > 0 ? " AND s.academic_term_id = ?" : "";
        $termBinding  = $termId > 0 ? [$termId] : [];

        // Per-module breakdown driven by module_registrations so every
        // registered module appears, even ones with zero sessions or zero
        // recorded marks for this student.
        $byModule = $this->db->fetchAll(
            "SELECT m.module_id, m.module_code, m.module_name,
                    mr.academic_term_id,
                    mr.status AS registration_status,
                    COALESCE(stats.sessions, 0)     AS sessions,
                    COALESCE(stats.records, 0)      AS records,
                    COALESCE(stats.present, 0)      AS present,
                    COALESCE(stats.late, 0)         AS late,
                    COALESCE(stats.absent, 0)       AS absent,
                    COALESCE(stats.excused, 0)      AS excused,
                    COALESCE(stats.present_like, 0) AS present_like
             FROM module_registrations mr
             JOIN modules m ON m.module_id = mr.module_id
             LEFT JOIN (
               SELECT s.module_id, s.academic_term_id,
                      COUNT(s.id) AS sessions,
                      SUM(CASE WHEN r.id IS NOT NULL THEN 1 ELSE 0 END) AS records,
                      SUM(CASE WHEN r.status = 'present' THEN 1 ELSE 0 END) AS present,
                      SUM(CASE WHEN r.status = 'late'    THEN 1 ELSE 0 END) AS late,
                      SUM(CASE WHEN r.status = 'absent'  THEN 1 ELSE 0 END) AS absent,
                      SUM(CASE WHEN r.status = 'excused' THEN 1 ELSE 0 END) AS excused,
                      SUM(CASE WHEN r.status IN ('present','late') THEN 1 ELSE 0 END) AS present_like
               FROM attendance_sessions s
               LEFT JOIN attendance_records r
                      ON r.session_id = s.id AND r.student_regnumber = ?
               GROUP BY s.module_id, s.academic_term_id
             ) stats ON stats.module_id = mr.module_id
                    AND stats.academic_term_id = mr.academic_term_id
             WHERE mr.student_regnumber = ?
               AND mr.status IN ('registered','completed')
               $termClauseMr
             ORDER BY m.module_code",
            array_merge([$reg, $reg], $termBinding)
        );

        $totalSessions = 0; $totalRecords = 0;
        $totPresent = 0; $totLate = 0; $totAbsent = 0; $totExcused = 0;
        foreach ($byModule as &$row) {
            $sCount = (int) $row['sessions'];
            $pLike  = (int) $row['present_like'];
            // Attendance % is present-like over sessions (unmarked sessions
            // count against the student so the figure reflects real exposure).
            $row['attendance_pct'] = $sCount > 0 ? (int) round(($pLike / $sCount) * 100) : 0;
            $row['not_recorded']   = max(0, $sCount - (int) $row['records']);
            $totalSessions += $sCount;
            $totalRecords  += (int) $row['records'];
            $totPresent    += (int) $row['present'];
            $totLate       += (int) $row['late'];
            $totAbsent     += (int) $row['absent'];
            $totExcused    += (int) $row['excused'];
        }
        unset($row);

        $totalPresentLike = $totPresent + $totLate;
        $pct = $totalSessions > 0
            ? (int) round(($totalPresentLike / $totalSessions) * 100)
            : 0;

        $limitParam = $request->query('limit');
        $limitClause = '';
        if ($limitParam !== null && (int) $limitParam > 0) {
            $limitClause = ' LIMIT ' . (int) $limitParam;
        }

        // Every session in a module the student is registered to, whether
        // or not the student has a record on it. Missing records surface
        // as 'not_recorded' so the student details page reflects the full
        // class timeline.
        $recent = $this->db->fetchAll(
            "SELECT COALESCE(r.status, 'not_recorded') AS status,
                    r.remarks, r.recorded_at,
                    s.id AS session_id, s.session_date, s.session_type,
                    m.module_id, m.module_code, m.module_name
             FROM attendance_sessions s
             JOIN module_registrations mr
                  ON mr.module_id = s.module_id
                 AND mr.academic_term_id = s.academic_term_id
                 AND mr.student_regnumber = ?
                 AND mr.status IN ('registered','completed')
             JOIN modules m ON m.module_id = s.module_id
             LEFT JOIN attendance_records r
                  ON r.session_id = s.id AND r.student_regnumber = ?
             WHERE 1=1 $termClauseS
             ORDER BY s.session_date DESC, s.id DESC
             $limitClause",
            array_merge([$reg, $reg], $termBinding)
        );

        $this->success($response, [
            'totals' => [
                'sessions'       => $totalSessions,
                'records'        => $totalRecords,
                'present'        => $totPresent,
                'late'           => $totLate,
                'absent'         => $totAbsent,
                'excused'        => $totExcused,
                'not_recorded'   => max(0, $totalSessions - $totalRecords),
                'attendance_pct' => $pct,
            ],
            'by_module' => $byModule,
            'recent'    => $recent,
        ], 'Student attendance fetched.');
    }

    /* ══════════════════════════════════════════════════════════════════════
     * Reports — printable attendance sheet (per-session) and module summary
     * ═══════════════════════════════════════════════════════════════════ */

    /**
     * GET /api/attendance/sessions/:id/report?format=pdf|csv
     * Single-session attendance roster, formatted for print or spreadsheet.
     */
    public function sessionReport(Request $request, Response $response): never
    {
        $id = (int) $request->param('id');
        $format = strtolower((string) ($request->query('format') ?? 'pdf'));

        $session = $this->db->fetchOne(
            "SELECT s.*, m.module_code, m.module_name, t.label AS term_label, u.full_name AS started_by_name
             FROM attendance_sessions s
             LEFT JOIN modules m         ON m.module_id = s.module_id
             LEFT JOIN academic_terms t  ON t.id = s.academic_term_id
             LEFT JOIN users u           ON u.id = s.started_by
             WHERE s.id = ? LIMIT 1",
            [$id]
        );
        if (!$session)
            $this->error($response, 'Session not found.', 404);

        $moduleId = (int) $session['module_id'];
        $termId = (int) $session['academic_term_id'];

        // Exporting a session sheet is a read of that class — scope it like the rest.
        $this->ensureCanReadModule($request, $response, $moduleId);

        $roster = $this->db->fetchAll(
            "SELECT st.regnumber, st.fname, st.lname,
                    r.status AS record_status, r.remarks,
                    (SELECT COUNT(*) FROM attendance_records ar
                       JOIN attendance_sessions asx ON asx.id = ar.session_id
                       WHERE asx.module_id = ? AND ar.student_regnumber = st.regnumber) AS total_sessions,
                    (SELECT COUNT(*) FROM attendance_records ar
                       JOIN attendance_sessions asx ON asx.id = ar.session_id
                       WHERE asx.module_id = ? AND ar.student_regnumber = st.regnumber
                         AND ar.status IN ('present','late')) AS present_sessions
             FROM module_registrations mr
             JOIN student st ON st.regnumber = mr.student_regnumber
             LEFT JOIN attendance_records r ON r.session_id = ? AND r.student_regnumber = st.regnumber
             WHERE mr.module_id = ? AND mr.academic_term_id = ? AND mr.status <> 'dropped'
             ORDER BY st.lname, st.fname",
            [$moduleId, $moduleId, $id, $moduleId, $termId]
        );
        foreach ($roster as &$r) {
            $tot = (int) $r['total_sessions'];
            $pr = (int) $r['present_sessions'];
            $r['attendance_pct'] = $tot > 0 ? (int) round(($pr / $tot) * 100) : 0;
        }
        unset($r);

        $summary = ['total_roster' => count($roster), 'present' => 0, 'late' => 0, 'absent' => 0, 'excused' => 0];
        foreach ($roster as $r) {
            $s = $r['record_status'];
            if ($s && isset($summary[$s]))
                $summary[$s]++;
        }

        $code = preg_replace('/[^A-Za-z0-9_-]+/', '', (string) ($session['module_code'] ?? 'session'));
        $date = (string) ($session['session_date'] ?? date('Y-m-d'));

        if ($format === 'csv') {
            $csv = AttendanceReportPdf::buildSessionCsv($session, $roster, $summary);
            AttendanceReportPdf::streamCsv($csv, "attendance-{$code}-{$date}.csv");
        }
        $html = AttendanceReportPdf::buildSessionHtml($session, $roster, $summary);
        AttendanceReportPdf::streamPdf($html, "attendance-{$code}-{$date}.pdf");
    }

    /**
     * GET /api/attendance/modules/:moduleId/report?academic_term_id=&format=pdf|csv
     * Module-wide summary across all its sessions for the (optional) term.
     */
    public function moduleReport(Request $request, Response $response): never
    {
        $moduleId = (int) $request->param('moduleId');
        $termId = (int) ($request->query('academic_term_id') ?? 0);
        $format = strtolower((string) ($request->query('format') ?? 'pdf'));

        $module = $this->db->fetchOne(
            "SELECT module_id, module_code, module_name FROM modules WHERE module_id = ? LIMIT 1",
            [$moduleId]
        );
        if (!$module)
            $this->error($response, 'Module not found.', 404);

        // A whole-module attendance report is the broadest read here — scope it.
        $this->ensureCanReadModule($request, $response, $moduleId);

        $termClause = $termId > 0 ? ' AND s.academic_term_id = ?' : '';
        $termBind = $termId > 0 ? [$termId] : [];

        $termLabel = null;
        if ($termId > 0) {
            $row = $this->db->fetchOne("SELECT label FROM academic_terms WHERE id = ? LIMIT 1", [$termId]);
            $termLabel = $row['label'] ?? null;
        }

        // Session list with per-status counts
        $sessions = $this->db->fetchAll(
            "SELECT s.id, s.session_date, s.session_type, s.status,
                    (SELECT COUNT(*) FROM attendance_records r WHERE r.session_id = s.id) AS recorded_count,
                    (SELECT COUNT(*) FROM attendance_records r WHERE r.session_id = s.id AND r.status = 'present') AS present_count,
                    (SELECT COUNT(*) FROM attendance_records r WHERE r.session_id = s.id AND r.status = 'late')    AS late_count,
                    (SELECT COUNT(*) FROM attendance_records r WHERE r.session_id = s.id AND r.status = 'absent')  AS absent_count,
                    (SELECT COUNT(*) FROM attendance_records r WHERE r.session_id = s.id AND r.status = 'excused') AS excused_count
             FROM attendance_sessions s
             WHERE s.module_id = ?{$termClause}
             ORDER BY s.session_date ASC, s.id ASC",
            array_merge([$moduleId], $termBind)
        );

        // Per-student summary across all sessions of this module/term
        $studentSummary = $this->db->fetchAll(
            "SELECT st.regnumber, st.fname, st.lname,
                    COUNT(*) AS total_records,
                    SUM(CASE WHEN r.status = 'present' THEN 1 ELSE 0 END) AS present,
                    SUM(CASE WHEN r.status = 'late'    THEN 1 ELSE 0 END) AS late,
                    SUM(CASE WHEN r.status = 'absent'  THEN 1 ELSE 0 END) AS absent,
                    SUM(CASE WHEN r.status = 'excused' THEN 1 ELSE 0 END) AS excused
             FROM attendance_records r
             JOIN attendance_sessions s ON s.id = r.session_id
             JOIN student st            ON st.regnumber = r.student_regnumber
             WHERE s.module_id = ?{$termClause}
             GROUP BY st.regnumber, st.fname, st.lname
             ORDER BY st.lname, st.fname",
            array_merge([$moduleId], $termBind)
        );
        foreach ($studentSummary as &$s) {
            $tot = (int) $s['total_records'];
            $pr = (int) $s['present'] + (int) $s['late'];
            $s['attendance_pct'] = $tot > 0 ? (int) round(($pr / $tot) * 100) : 0;
        }
        unset($s);

        $sessCount = count($sessions);
        $totalRecords = 0;
        $totPresent = 0;
        $totLate = 0;
        $totAbsent = 0;
        $totExcused = 0;
        foreach ($sessions as $s) {
            $totalRecords += (int) $s['recorded_count'];
            $totPresent += (int) $s['present_count'];
            $totLate += (int) $s['late_count'];
            $totAbsent += (int) $s['absent_count'];
            $totExcused += (int) $s['excused_count'];
        }
        $avgPct = $totalRecords > 0 ? (int) round((($totPresent + $totLate) / $totalRecords) * 100) : 0;
        $totals = [
            'sessions' => $sessCount,
            'records' => $totalRecords,
            'present' => $totPresent,
            'late' => $totLate,
            'absent' => $totAbsent,
            'excused' => $totExcused,
            'attendance_pct' => $avgPct,
        ];

        $code = preg_replace('/[^A-Za-z0-9_-]+/', '', (string) $module['module_code']);
        $stamp = date('Y-m-d');

        if ($format === 'csv') {
            $csv = AttendanceReportPdf::buildModuleCsv($module, $termLabel, $sessions, $studentSummary, $totals);
            AttendanceReportPdf::streamCsv($csv, "attendance-{$code}-{$stamp}.csv");
        }
        $html = AttendanceReportPdf::buildModuleHtml($module, $termLabel, $sessions, $studentSummary, $totals);
        AttendanceReportPdf::streamPdf($html, "attendance-{$code}-{$stamp}.pdf");
    }
}

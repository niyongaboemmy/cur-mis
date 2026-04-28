<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use Core\Database;
use App\Constants\Permissions;
use App\Helpers\ValidationHelper;
use App\Helpers\AttendanceReportPdf;

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
        if (($user['role'] ?? '') === 'superadmin')
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

        $staffId = $this->authStaffId($request);
        if ($staffId === null)
            return [];

        $rows = $this->db->fetchAll(
            "SELECT DISTINCT module_id FROM module_assignments WHERE staff_id = ?",
            [$staffId]
        );
        return array_map(fn($r) => (int) $r['module_id'], $rows);
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

    /* ══════════════════════════════════════════════════════════════════════
     * "Modules I teach" — drives the picker in the Record tab
     * ═══════════════════════════════════════════════════════════════════ */

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
            $staffId = $this->authStaffId($request);
            if ($staffId === null) {
                $this->success($response, [], 'No staff profile linked to this user.');
            }
            $sql = "SELECT DISTINCT m.module_id, m.module_code, m.module_name, m.level,
                           ma.academic_term_id, ma.academic_year_id,
                           NULL AS teacher_first_name, NULL AS teacher_last_name
                    FROM module_assignments ma
                    JOIN modules m ON m.module_id = ma.module_id
                    WHERE ma.staff_id = ?"
                . ($termId > 0 ? " AND ma.academic_term_id = ?" : "")
                . " ORDER BY m.module_code ASC";
            $bindings = [$staffId];
            if ($termId > 0)
                $bindings[] = $termId;
            $rows = $this->db->fetchAll($sql, $bindings);
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
               AND mr.status = 'registered'
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
             ORDER BY (present_like / total_records) ASC, total_records DESC
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

    public function studentSummary(Request $request, Response $response): never
    {
        $reg = trim((string) $request->param('regnumber'));
        if ($reg === '')
            $this->error($response, 'regnumber required', 422);

        $termId = (int) ($request->query('academic_term_id') ?? 0);
        $termClause = $termId > 0 ? " AND s.academic_term_id = ?" : "";
        $termBinding = $termId > 0 ? [$termId] : [];

        $totals = $this->db->fetchOne(
            "SELECT COUNT(*) AS records,
                    SUM(CASE WHEN r.status = 'present' THEN 1 ELSE 0 END) AS present,
                    SUM(CASE WHEN r.status = 'late'    THEN 1 ELSE 0 END) AS late,
                    SUM(CASE WHEN r.status = 'absent'  THEN 1 ELSE 0 END) AS absent,
                    SUM(CASE WHEN r.status = 'excused' THEN 1 ELSE 0 END) AS excused
             FROM attendance_records r
             JOIN attendance_sessions s ON s.id = r.session_id
             WHERE r.student_regnumber = ? $termClause",
            array_merge([$reg], $termBinding)
        ) ?: [];

        $records = (int) ($totals['records'] ?? 0);
        $pr = (int) ($totals['present'] ?? 0) + (int) ($totals['late'] ?? 0);
        $pct = $records > 0 ? (int) round(($pr / $records) * 100) : 0;

        $byModule = $this->db->fetchAll(
            "SELECT m.module_id, m.module_code, m.module_name,
                    COUNT(*) AS records,
                    SUM(CASE WHEN r.status IN ('present','late') THEN 1 ELSE 0 END) AS present_like
             FROM attendance_records r
             JOIN attendance_sessions s ON s.id = r.session_id
             LEFT JOIN modules m ON m.module_id = s.module_id
             WHERE r.student_regnumber = ? $termClause
             GROUP BY m.module_id, m.module_code, m.module_name
             ORDER BY m.module_code",
            array_merge([$reg], $termBinding)
        );
        foreach ($byModule as &$row) {
            $r = (int) $row['records'];
            $p = (int) $row['present_like'];
            $row['attendance_pct'] = $r > 0 ? (int) round(($p / $r) * 100) : 0;
        }
        unset($row);

        $limitParam = $request->query('limit');
        $limitClause = '';
        if ($limitParam !== null && (int) $limitParam > 0) {
            $limitClause = ' LIMIT ' . (int) $limitParam;
        }

        $recent = $this->db->fetchAll(
            "SELECT r.status, r.remarks, r.recorded_at,
                    s.session_date, s.session_type,
                    m.module_code, m.module_name
             FROM attendance_records r
             JOIN attendance_sessions s ON s.id = r.session_id
             LEFT JOIN modules m ON m.module_id = s.module_id
             WHERE r.student_regnumber = ? $termClause
             ORDER BY s.session_date DESC, r.id DESC
             $limitClause",
            array_merge([$reg], $termBinding)
        );

        $this->success($response, [
            'totals' => [
                'records' => $records,
                'present' => (int) ($totals['present'] ?? 0),
                'late' => (int) ($totals['late'] ?? 0),
                'absent' => (int) ($totals['absent'] ?? 0),
                'excused' => (int) ($totals['excused'] ?? 0),
                'attendance_pct' => $pct,
            ],
            'by_module' => $byModule,
            'recent' => $recent,
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
             WHERE mr.module_id = ? AND mr.academic_term_id = ? AND mr.status = 'registered'
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

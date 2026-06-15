<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Database;
use Core\Request;
use Core\Response;
use App\Services\DegreeClassificationService;
use App\Services\SystemLogService;

/**
 * Manages the graduand lifecycle:
 *   eligibility check → graduation list → approve → graduate / defer
 *
 * Routes:
 *   GET  /api/graduands/eligibility          → VIEW_GRADUANDS
 *   GET  /api/graduands                      → VIEW_GRADUANDS
 *   POST /api/graduands                      → MANAGE_GRADUANDS
 *   PUT  /api/graduands/:id/approve          → MANAGE_GRADUANDS
 *   PUT  /api/graduands/:id/graduate         → MANAGE_GRADUANDS
 *   PUT  /api/graduands/:id/defer            → MANAGE_GRADUANDS
 *   DELETE /api/graduands/:id               → MANAGE_GRADUANDS
 */
class GraduandController extends BaseController
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    private function authUserId(Request $request): int
    {
        $user = (array)($request->param('_auth_user') ?? []);
        return (int)($user['id'] ?? 0);
    }

    /* ── Eligibility list ────────────────────────────────────────────────── */

    /**
     * GET /api/graduands/eligibility
     * Returns active students who have marks recorded, along with their
     * weighted average, degree class suggestion, and pass/fail counts.
     *
     * Filters: academic_year_id, std_option (program option id), current_level
     */
    public function eligibilityList(Request $request, Response $response): never
    {
        $yearId  = (int)($request->query('academic_year_id') ?? 0);
        $option  = $request->query('std_option')   ?? null;
        $level   = (int)($request->query('current_level')   ?? 0);
        $page    = max(1, (int)($request->query('page')     ?? 1));
        $perPage = min(100, max(10, (int)($request->query('per_page') ?? 20)));
        $offset  = ($page - 1) * $perPage;

        // Pull all active students with at least one mark recorded
        $where  = ["st.student_state = 'active'"];
        $args   = [];

        if ($option) {
            $where[] = 'st.std_option = ?';
            $args[]  = $option;
        }
        if ($level > 0) {
            $where[] = 'CAST(NULLIF(st.current_level,\'\') AS UNSIGNED) = ?';
            $args[]  = $level;
        }

        // Optionally narrow marks to a specific academic year
        $yearJoin   = '';
        $yearFilter = '';
        if ($yearId > 0) {
            $yearJoin   = "LEFT JOIN academic_terms t2 ON t2.id = mm2.academic_term_id";
            $yearFilter = "AND t2.academic_year_id = {$yearId}";
        }

        $whereStr = implode(' AND ', $where);

        $total = (int)($this->db->fetchOne(
            "SELECT COUNT(DISTINCT st.id) AS n
             FROM `student` st
             INNER JOIN module_marks mm2 ON mm2.student_regnumber = st.regnumber
                                        AND mm2.percentage IS NOT NULL
             {$yearJoin}
             WHERE {$whereStr} {$yearFilter}",
            $args
        )['n'] ?? 0);

        $students = $this->db->fetchAll(
            "SELECT DISTINCT st.id, st.regnumber, st.fname, st.lname,
                    st.current_level, st.std_option, st.faculty, st.department,
                    f.fac_name, d.dep_name,
                    o.acro AS option_acronym, o.title AS option_title
             FROM `student` st
             INNER JOIN module_marks mm2 ON mm2.student_regnumber = st.regnumber
                                        AND mm2.percentage IS NOT NULL
             {$yearJoin}
             LEFT JOIN faculty       f ON CAST(f.fac_id AS CHAR) = st.faculty
             LEFT JOIN departements  d ON CAST(d.dep_id AS CHAR) = st.department
             LEFT JOIN dep_options   do2 ON do2.op_id = st.std_option
             LEFT JOIN options       o  ON o.acro = do2.option_acronym
             WHERE {$whereStr} {$yearFilter}
             ORDER BY st.lname, st.fname
             LIMIT ? OFFSET ?",
            [...$args, $perPage, $offset]
        );

        // Compute eligibility for each student
        $result = [];
        foreach ($students as $s) {
            $eligibility = DegreeClassificationService::eligibleForGraduation(
                $s['regnumber'],
                $yearId > 0 ? $yearId : null
            );
            $result[] = array_merge($s, $eligibility);
        }

        $this->success($response, [
            'data'      => $result,
            'total'     => $total,
            'page'      => $page,
            'per_page'  => $perPage,
            'last_page' => (int)ceil($total / $perPage),
        ], 'Eligibility list fetched.');
    }

    /* ── Graduation list ─────────────────────────────────────────────────── */

    /** GET /api/graduands */
    public function list(Request $request, Response $response): never
    {
        $status  = $request->query('status')          ?? null;
        $yearId  = (int)($request->query('academic_year_id') ?? 0);
        $page    = max(1, (int)($request->query('page')     ?? 1));
        $perPage = min(100, max(10, (int)($request->query('per_page') ?? 20)));
        $offset  = ($page - 1) * $perPage;

        $where = ['1=1'];
        $args  = [];

        if ($status && in_array($status, ['pending','approved','graduated','deferred'], true)) {
            $where[] = 'g.status = ?';
            $args[]  = $status;
        }
        if ($yearId > 0) {
            $where[] = 'g.academic_year_id = ?';
            $args[]  = $yearId;
        }

        $whereStr = implode(' AND ', $where);
        $total    = (int)($this->db->fetchOne(
            "SELECT COUNT(*) AS n FROM graduands g WHERE {$whereStr}", $args
        )['n'] ?? 0);

        $rows = $this->db->fetchAll(
            "SELECT g.id, g.student_id, g.academic_year_id, g.graduation_date,
                    g.degree_class, g.cgpa, g.total_credits, g.ceremony_number,
                    g.status, g.approved_by, g.approved_at, g.created_at,
                    s.regnumber, s.fname, s.lname, s.faculty, s.department,
                    y.label AS year_label,
                    CONCAT(u.first_name,' ',u.last_name) AS approved_by_name
             FROM graduands g
             LEFT JOIN `student`      s ON s.id = g.student_id
             LEFT JOIN academic_years y ON y.id = g.academic_year_id
             LEFT JOIN users          u ON u.id = g.approved_by
             WHERE {$whereStr}
             ORDER BY g.created_at DESC
             LIMIT ? OFFSET ?",
            [...$args, $perPage, $offset]
        );

        $this->success($response, [
            'data'      => $rows,
            'total'     => $total,
            'page'      => $page,
            'per_page'  => $perPage,
            'last_page' => (int)ceil($total / $perPage),
        ], 'Graduation list fetched.');
    }

    /* ── Add student to graduation list ─────────────────────────────────── */

    /** POST /api/graduands */
    public function add(Request $request, Response $response): never
    {
        $body      = $request->body();
        $studentId = (int)($body['student_id']       ?? 0);
        $yearId    = (int)($body['academic_year_id'] ?? 0) ?: null;

        if ($studentId <= 0) $this->error($response, 'student_id is required.', 422);

        // Prevent duplicate entries for the same student/year
        $existing = $this->db->fetchOne(
            "SELECT id FROM graduands WHERE student_id = ?"
            . ($yearId ? " AND academic_year_id = ?" : " AND academic_year_id IS NULL")
            . " LIMIT 1",
            $yearId ? [$studentId, $yearId] : [$studentId]
        );
        if ($existing) {
            $this->error($response, 'Student is already on the graduation list for this year.', 409);
        }

        // Resolve regnumber for eligibility check
        $row = $this->db->fetchOne(
            "SELECT regnumber FROM `student` WHERE id = ? LIMIT 1", [$studentId]
        );
        if (!$row) $this->error($response, 'Student not found.', 404);

        $elig = DegreeClassificationService::eligibleForGraduation(
            $row['regnumber'], $yearId
        );

        // Allow override via body; default to computed classification
        $degreeClass = isset($body['degree_class'])
            && in_array($body['degree_class'], ['First Class','Upper Second','Lower Second','Pass','Distinction'], true)
            ? $body['degree_class']
            : ($elig['degree_class'] ?? 'Pass');

        $this->db->execute(
            "INSERT INTO graduands
               (student_id, academic_year_id, degree_class, cgpa, total_credits)
             VALUES (?, ?, ?, ?, ?)",
            [
                $studentId, $yearId,
                $degreeClass,
                $elig['weighted_avg'],
                $elig['total_credits'],
            ]
        );

        $id = $this->db->lastInsertId();
        SystemLogService::log(
            'CREATE', 'STUDENTS',
            "Student #{$studentId} added to graduation list (#{$id})",
            $id, 'graduand'
        );

        $this->success($response, ['id' => $id], 'Student added to graduation list.', 201);
    }

    /* ── Approve ─────────────────────────────────────────────────────────── */

    public function approve(Request $request, Response $response): never
    {
        $id  = (int)$request->param('id');
        $row = $this->fetchGraduand($response, $id);
        if ($row['status'] !== 'pending') {
            $this->error($response, 'Only pending entries can be approved.', 409);
        }

        $this->db->execute(
            "UPDATE graduands SET status='approved', approved_by=?, approved_at=NOW() WHERE id=?",
            [$this->authUserId($request) ?: null, $id]
        );
        SystemLogService::log('APPROVE','STUDENTS',"Graduand #{$id} approved", $id,'graduand');
        $this->success($response, null, 'Graduand approved.');
    }

    /* ── Graduate ────────────────────────────────────────────────────────── */

    public function graduate(Request $request, Response $response): never
    {
        $id  = (int)$request->param('id');
        $row = $this->fetchGraduand($response, $id);
        if ($row['status'] !== 'approved') {
            $this->error($response, 'Only approved entries can be marked as graduated.', 409);
        }

        $body            = $request->body();
        $graduationDate  = $body['graduation_date']  ?? date('Y-m-d');
        $ceremonyNumber  = $body['ceremony_number']  ?? null;

        $this->db->execute(
            "UPDATE graduands
             SET status='graduated', graduation_date=?, ceremony_number=?
             WHERE id=?",
            [$graduationDate, $ceremonyNumber, $id]
        );
        SystemLogService::log('UPDATE','STUDENTS',"Graduand #{$id} marked as graduated",$id,'graduand');
        $this->success($response, null, 'Student marked as graduated.');
    }

    /* ── Defer ───────────────────────────────────────────────────────────── */

    public function defer(Request $request, Response $response): never
    {
        $id  = (int)$request->param('id');
        $this->fetchGraduand($response, $id);

        $this->db->execute(
            "UPDATE graduands SET status='deferred' WHERE id=?", [$id]
        );
        SystemLogService::log('UPDATE','STUDENTS',"Graduand #{$id} deferred",$id,'graduand');
        $this->success($response, null, 'Graduand deferred.');
    }

    /* ── Delete ──────────────────────────────────────────────────────────── */

    public function delete(Request $request, Response $response): never
    {
        $id = (int)$request->param('id');
        $this->fetchGraduand($response, $id);
        $this->db->execute("DELETE FROM graduands WHERE id=?", [$id]);
        SystemLogService::log('DELETE','STUDENTS',"Graduand #{$id} removed",$id,'graduand');
        $this->success($response, null, 'Graduand removed.');
    }

    /* ── private helper ──────────────────────────────────────────────────── */

    private function fetchGraduand(Response $response, int $id): array
    {
        $row = $this->db->fetchOne(
            "SELECT id, student_id, status FROM graduands WHERE id = ? LIMIT 1", [$id]
        );
        if (!$row) $this->error($response, 'Graduand record not found.', 404);
        return $row;
    }
}

<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Database;
use Core\Request;
use Core\Response;
use App\Constants\Permissions;
use App\Services\SystemLogService;

/**
 * Manages the transcript request lifecycle.
 *
 * Students submit requests; registry staff review (approve/reject)
 * and then dispatch the physical or digital copy.
 *
 * Routes:
 *   GET  /api/transcripts           → admin list (MANAGE_TRANSCRIPT_REQUESTS)
 *   GET  /api/transcripts/my        → student's own requests (ACCESS_STUDENT_PORTAL)
 *   POST /api/transcripts           → student submits request (ACCESS_STUDENT_PORTAL)
 *   PUT  /api/transcripts/:id/review  → approve or reject (MANAGE_TRANSCRIPT_REQUESTS)
 *   PUT  /api/transcripts/:id/dispatch → dispatch approved request (MANAGE_TRANSCRIPT_REQUESTS)
 */
class TranscriptController extends BaseController
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    /* ── helpers ─────────────────────────────────────────────────────────── */

    private function authUser(Request $request): array
    {
        return (array)($request->param('_auth_user') ?? []);
    }

    private function authUserId(Request $request): int
    {
        return (int)($this->authUser($request)['id'] ?? 0);
    }

    private function studentIdForAuthUser(Request $request): ?int
    {
        $uid = $this->authUserId($request);
        if ($uid <= 0) return null;
        $row = $this->db->fetchOne(
            "SELECT id FROM `student` WHERE user_id = ? LIMIT 1",
            [$uid]
        );
        return $row ? (int)$row['id'] : null;
    }

    private function baseJoin(): string
    {
        return "SELECT tr.id, tr.student_id, tr.academic_year_id, tr.request_type,
                       tr.purpose, tr.copies, tr.status, tr.reviewed_by, tr.reviewed_at,
                       tr.dispatch_notes, tr.fee_paid, tr.created_at, tr.updated_at,
                       s.regnumber, s.fname, s.lname,
                       y.label AS year_label,
                       CONCAT(u.first_name,' ',u.last_name) AS reviewed_by_name
                FROM transcript_requests tr
                LEFT JOIN `student`        s ON s.id = tr.student_id
                LEFT JOIN academic_years   y ON y.id = tr.academic_year_id
                LEFT JOIN users            u ON u.id = tr.reviewed_by";
    }

    /* ── Admin: list all requests ──────────────────────────────────────── */

    public function list(Request $request, Response $response): never
    {
        $status    = $request->query('status')          ?? null;
        $yearId    = (int)($request->query('academic_year_id') ?? 0);
        $search    = trim((string)($request->query('search') ?? ''));
        $page      = max(1, (int)($request->query('page')     ?? 1));
        $perPage   = min(100, max(10, (int)($request->query('per_page') ?? 20)));
        $offset    = ($page - 1) * $perPage;

        $where  = ['1=1'];
        $args   = [];

        if ($status && in_array($status, ['pending','approved','dispatched','rejected'], true)) {
            $where[] = 'tr.status = ?';
            $args[]  = $status;
        }
        if ($yearId > 0) {
            $where[] = 'tr.academic_year_id = ?';
            $args[]  = $yearId;
        }
        if ($search !== '') {
            $where[] = '(s.regnumber LIKE ? OR s.fname LIKE ? OR s.lname LIKE ?)';
            $like    = "%{$search}%";
            array_push($args, $like, $like, $like);
        }

        $whereStr = implode(' AND ', $where);
        $total    = (int)($this->db->fetchOne(
            "SELECT COUNT(*) AS n FROM transcript_requests tr
             LEFT JOIN `student` s ON s.id = tr.student_id
             WHERE {$whereStr}",
            $args
        )['n'] ?? 0);

        $rows = $this->db->fetchAll(
            $this->baseJoin() . " WHERE {$whereStr} ORDER BY tr.created_at DESC LIMIT ? OFFSET ?",
            [...$args, $perPage, $offset]
        );

        $this->success($response, [
            'data'       => $rows,
            'total'      => $total,
            'page'       => $page,
            'per_page'   => $perPage,
            'last_page'  => (int)ceil($total / $perPage),
        ], 'Transcript requests fetched.');
    }

    /* ── Student: own requests ──────────────────────────────────────────── */

    public function myRequests(Request $request, Response $response): never
    {
        $studentId = $this->studentIdForAuthUser($request);
        if (!$studentId) {
            $this->error($response, 'No student profile linked to this account.', 404);
        }

        $rows = $this->db->fetchAll(
            $this->baseJoin() . " WHERE tr.student_id = ? ORDER BY tr.created_at DESC",
            [$studentId]
        );

        $this->success($response, $rows, 'Your transcript requests fetched.');
    }

    /* ── Student: submit a new request ─────────────────────────────────── */

    public function create(Request $request, Response $response): never
    {
        $studentId = $this->studentIdForAuthUser($request);
        if (!$studentId) {
            $this->error($response, 'No student profile linked to this account.', 404);
        }

        $body        = $request->body();
        $type        = in_array($body['request_type'] ?? '', ['official','unofficial'], true)
                       ? $body['request_type'] : 'official';
        $purpose     = trim((string)($body['purpose']  ?? ''));
        $copies      = max(1, (int)($body['copies']    ?? 1));
        $yearId      = (int)($body['academic_year_id'] ?? 0) ?: null;

        $this->db->execute(
            "INSERT INTO transcript_requests
               (student_id, academic_year_id, request_type, purpose, copies)
             VALUES (?, ?, ?, ?, ?)",
            [$studentId, $yearId, $type, $purpose ?: null, $copies]
        );

        $id = $this->db->lastInsertId();

        SystemLogService::log(
            'GENERATE', 'STUDENTS',
            "Transcript request #{$id} submitted by student #{$studentId}",
            $id, 'transcript_request'
        );

        $this->success($response, ['id' => $id], 'Transcript request submitted.', 201);
    }

    /* ── Admin: approve or reject ───────────────────────────────────────── */

    public function review(Request $request, Response $response): never
    {
        $id   = (int)$request->param('id');
        $row  = $this->db->fetchOne(
            "SELECT id, status FROM transcript_requests WHERE id = ? LIMIT 1",
            [$id]
        );
        if (!$row) $this->error($response, 'Request not found.', 404);
        if ($row['status'] !== 'pending') {
            $this->error($response, 'Only pending requests can be reviewed.', 409);
        }

        $body       = $request->body();
        $action     = $body['action'] ?? '';
        if (!in_array($action, ['approve', 'reject'], true)) {
            $this->error($response, 'action must be approve or reject.', 422);
        }

        $newStatus  = $action === 'approve' ? 'approved' : 'rejected';
        $reviewerId = $this->authUserId($request);

        $this->db->execute(
            "UPDATE transcript_requests
             SET status = ?, reviewed_by = ?, reviewed_at = NOW(), updated_at = NOW()
             WHERE id = ?",
            [$newStatus, $reviewerId ?: null, $id]
        );

        SystemLogService::log(
            strtoupper($action) === 'APPROVE' ? 'APPROVE' : 'REJECT',
            'STUDENTS',
            "Transcript request #{$id} {$newStatus}",
            $id, 'transcript_request'
        );

        $this->success($response, ['status' => $newStatus], "Request {$newStatus}.");
    }

    /* ── Admin: dispatch ────────────────────────────────────────────────── */

    public function dispatch(Request $request, Response $response): never
    {
        $id  = (int)$request->param('id');
        $row = $this->db->fetchOne(
            "SELECT id, status FROM transcript_requests WHERE id = ? LIMIT 1",
            [$id]
        );
        if (!$row) $this->error($response, 'Request not found.', 404);
        if ($row['status'] !== 'approved') {
            $this->error($response, 'Only approved requests can be dispatched.', 409);
        }

        $body         = $request->body();
        $dispatchNotes = trim((string)($body['dispatch_notes'] ?? ''));

        $this->db->execute(
            "UPDATE transcript_requests
             SET status = 'dispatched', dispatch_notes = ?, updated_at = NOW()
             WHERE id = ?",
            [$dispatchNotes ?: null, $id]
        );

        SystemLogService::log(
            'GENERATE', 'STUDENTS',
            "Transcript request #{$id} dispatched",
            $id, 'transcript_request'
        );

        $this->success($response, null, 'Request marked as dispatched.');
    }
}

<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Database;
use Core\Request;
use Core\Response;
use App\Services\SystemLogService;

/**
 * Issues, tracks and manages academic certificates (degrees, diplomas, etc.).
 *
 * Certificate numbers are auto-generated in the format: CUR/{YYYY}/{SEQ}
 * where SEQ is the zero-padded annual sequence number.
 *
 * Routes:
 *   GET    /api/academic-certificates           → list
 *   POST   /api/academic-certificates           → issue
 *   PUT    /api/academic-certificates/:id/dispatch → dispatch
 *   PUT    /api/academic-certificates/:id/revoke   → revoke
 *   DELETE /api/academic-certificates/:id          → delete (draft only)
 */
class AcademicCertificateController extends BaseController
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

    private function baseJoin(): string
    {
        return "SELECT ac.id, ac.student_id, ac.academic_year_id, ac.certificate_type,
                       ac.certificate_number, ac.degree_class, ac.issue_date,
                       ac.issued_by, ac.dispatch_date, ac.dispatch_notes,
                       ac.is_replacement, ac.replacement_reason, ac.status,
                       ac.created_at, ac.updated_at,
                       s.regnumber, s.fname, s.lname,
                       y.label AS year_label,
                       u.full_name AS issued_by_name
                FROM academic_certificates ac
                LEFT JOIN `student`      s ON s.id = ac.student_id
                LEFT JOIN academic_years y ON y.id = ac.academic_year_id
                LEFT JOIN users          u ON u.id = ac.issued_by";
    }

    /** GET /api/academic-certificates */
    public function list(Request $request, Response $response): never
    {
        $status  = $request->query('status')             ?? null;
        $type    = $request->query('certificate_type')   ?? null;
        $yearId  = (int)($request->query('academic_year_id') ?? 0);
        $search  = trim((string)($request->query('search') ?? ''));
        $page    = max(1, (int)($request->query('page')    ?? 1));
        $perPage = min(100, max(10, (int)($request->query('per_page') ?? 20)));
        $offset  = ($page - 1) * $perPage;

        $where = ['1=1'];
        $args  = [];

        if ($status && in_array($status, ['draft','issued','dispatched','revoked'], true)) {
            $where[] = 'ac.status = ?'; $args[] = $status;
        }
        if ($type && in_array($type, ['degree','diploma','certificate','provisional'], true)) {
            $where[] = 'ac.certificate_type = ?'; $args[] = $type;
        }
        if ($yearId > 0) {
            $where[] = 'ac.academic_year_id = ?'; $args[] = $yearId;
        }
        if ($search !== '') {
            $where[] = '(s.regnumber LIKE ? OR s.fname LIKE ? OR s.lname LIKE ? OR ac.certificate_number LIKE ?)';
            $like    = "%{$search}%";
            array_push($args, $like, $like, $like, $like);
        }

        $whereStr = implode(' AND ', $where);
        $total    = (int)($this->db->fetchOne(
            "SELECT COUNT(*) AS n FROM academic_certificates ac
             LEFT JOIN `student` s ON s.id = ac.student_id
             WHERE {$whereStr}", $args
        )['n'] ?? 0);

        $rows = $this->db->fetchAll(
            $this->baseJoin() . " WHERE {$whereStr} ORDER BY ac.created_at DESC LIMIT ? OFFSET ?",
            [...$args, $perPage, $offset]
        );

        $this->success($response, [
            'data'      => $rows,
            'total'     => $total,
            'page'      => $page,
            'per_page'  => $perPage,
            'last_page' => (int)ceil($total / $perPage),
        ], 'Certificates fetched.');
    }

    /**
     * POST /api/academic-certificates
     * Body: { student_id, academic_year_id?, certificate_type, degree_class?,
     *         issue_date?, is_replacement?, replacement_reason? }
     */
    public function issue(Request $request, Response $response): never
    {
        $body      = $request->body();
        $studentId = (int)($body['student_id'] ?? 0);
        $type      = $body['certificate_type'] ?? 'degree';

        if ($studentId <= 0) $this->error($response, 'student_id is required.', 422);
        if (!in_array($type, ['degree','diploma','certificate','provisional'], true)) {
            $this->error($response, 'Invalid certificate_type.', 422);
        }

        $row = $this->db->fetchOne("SELECT id FROM `student` WHERE id=? LIMIT 1", [$studentId]);
        if (!$row) $this->error($response, 'Student not found.', 404);

        $certNumber = $this->generateCertNumber($type);
        $yearId     = (int)($body['academic_year_id'] ?? 0) ?: null;
        $issueDate  = $body['issue_date'] ?? date('Y-m-d');
        $issuer     = $this->authUserId($request) ?: null;

        $this->db->execute(
            "INSERT INTO academic_certificates
               (student_id, academic_year_id, certificate_type, certificate_number,
                degree_class, issue_date, issued_by, is_replacement, replacement_reason, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'issued')",
            [
                $studentId, $yearId, $type, $certNumber,
                $body['degree_class']        ?? null,
                $issueDate, $issuer,
                !empty($body['is_replacement']) ? 1 : 0,
                $body['replacement_reason']  ?? null,
            ]
        );

        $id = $this->db->lastInsertId();
        SystemLogService::log(
            'GENERATE', 'STUDENTS',
            "Certificate {$certNumber} issued to student #{$studentId}",
            $id, 'academic_certificate'
        );

        $this->success($response, ['id' => $id, 'certificate_number' => $certNumber],
            'Certificate issued.', 201);
    }

    /** PUT /api/academic-certificates/:id/dispatch */
    public function dispatch(Request $request, Response $response): never
    {
        $id  = (int)$request->param('id');
        $row = $this->fetchCert($response, $id);
        if ($row['status'] !== 'issued') {
            $this->error($response, 'Only issued certificates can be dispatched.', 409);
        }

        $body = $request->body();
        $this->db->execute(
            "UPDATE academic_certificates
             SET status='dispatched', dispatch_date=?, dispatch_notes=?, updated_at=NOW()
             WHERE id=?",
            [
                $body['dispatch_date'] ?? date('Y-m-d'),
                $body['dispatch_notes'] ?? null,
                $id,
            ]
        );

        SystemLogService::log('GENERATE','STUDENTS',"Certificate #{$id} dispatched",$id,'academic_certificate');
        $this->success($response, null, 'Certificate marked as dispatched.');
    }

    /** PUT /api/academic-certificates/:id/revoke */
    public function revoke(Request $request, Response $response): never
    {
        $id  = (int)$request->param('id');
        $row = $this->fetchCert($response, $id);
        if ($row['status'] === 'revoked') {
            $this->error($response, 'Certificate is already revoked.', 409);
        }

        $this->db->execute(
            "UPDATE academic_certificates SET status='revoked', updated_at=NOW() WHERE id=?",
            [$id]
        );
        SystemLogService::log('UPDATE','STUDENTS',"Certificate #{$id} revoked",$id,'academic_certificate');
        $this->success($response, null, 'Certificate revoked.');
    }

    /** DELETE /api/academic-certificates/:id  (draft-only safety guard) */
    public function delete(Request $request, Response $response): never
    {
        $id  = (int)$request->param('id');
        $row = $this->fetchCert($response, $id);
        if ($row['status'] !== 'draft') {
            $this->error($response, 'Only draft certificates can be deleted. Revoke issued ones instead.', 409);
        }

        $this->db->execute("DELETE FROM academic_certificates WHERE id=?", [$id]);
        SystemLogService::log('DELETE','STUDENTS',"Certificate #{$id} deleted",$id,'academic_certificate');
        $this->success($response, null, 'Certificate deleted.');
    }

    /* ── helpers ─────────────────────────────────────────────────────────── */

    private function fetchCert(Response $response, int $id): array
    {
        $row = $this->db->fetchOne(
            "SELECT id, status FROM academic_certificates WHERE id=? LIMIT 1", [$id]
        );
        if (!$row) $this->error($response, 'Certificate not found.', 404);
        return $row;
    }

    private function generateCertNumber(string $type): string
    {
        $year   = date('Y');
        $prefix = match ($type) {
            'diploma'      => 'DIP',
            'certificate'  => 'CERT',
            'provisional'  => 'PROV',
            default        => 'DEG',
        };

        // Find the current max sequence for this year + type prefix
        $row = $this->db->fetchOne(
            "SELECT certificate_number FROM academic_certificates
             WHERE certificate_number LIKE ? ORDER BY id DESC LIMIT 1",
            ["CUR/{$year}/{$prefix}/%"]
        );

        $seq = 1;
        if ($row) {
            $parts = explode('/', $row['certificate_number']);
            $seq   = (int)end($parts) + 1;
        }

        return "CUR/{$year}/{$prefix}/" . str_pad((string)$seq, 4, '0', STR_PAD_LEFT);
    }
}

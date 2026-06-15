<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use Core\Database;
use App\Models\RevaluationModel;
use App\Helpers\ValidationHelper;
use App\Services\SystemLogService;

/**
 * Revaluation & backlog management.
 *
 * Students request a re-mark of a contested module result (a `module_marks`
 * row, referenced via revaluations.exam_id) and track its status. Registry
 * staff review requests (approve / reject / process, optionally recording the
 * revised marks). Backlog = the student's failed modules, surfaced from the
 * live marks data.
 */
class RevaluationController extends BaseController
{
    private RevaluationModel $model;
    private Database         $db;

    private const PASS_MARK = 50.0;

    public function __construct()
    {
        $this->model = new RevaluationModel();
        $this->db    = Database::getInstance();
    }

    /* ══════════════════════════════════════════════════════════════════════
     * Student self-service
     * ═══════════════════════════════════════════════════════════════════ */

    // POST /api/revaluations/request   body: { mark_id, reason }
    public function request(Request $request, Response $response): never
    {
        $actor   = (array) $request->param('_auth_user');
        $body    = $request->body();
        $student = $this->resolveStudent($actor);
        if (!$student) {
            $this->error($response, 'No student profile linked to this account.', 404);
        }

        $errors = ValidationHelper::validate($body, ['reason' => ['required', 'min:5']]);
        if (!empty($errors)) {
            $this->error($response, 'Please give a reason (at least 5 characters).', 422, $errors);
        }

        $markId = (int) ($body['mark_id'] ?? 0);
        if ($markId <= 0) {
            $this->error($response, 'mark_id is required.', 422);
        }

        // The contested mark must belong to this student.
        $mark = $this->db->fetchOne(
            "SELECT id, student_regnumber FROM module_marks WHERE id = ? LIMIT 1",
            [$markId]
        );
        if (!$mark || (string) $mark['student_regnumber'] !== (string) $student['regnumber']) {
            $this->error($response, 'That result was not found on your record.', 404);
        }

        if ($this->model->hasOpenRequest((int) $student['id'], $markId)) {
            $this->error($response, 'You already have an open revaluation for this module.', 409);
        }

        $id = (int) $this->model->create([
            'student_id' => (int) $student['id'],
            'exam_id'    => $markId,
            'reason'     => trim((string) $body['reason']),
            'fee_paid'   => 0,
            'status'     => 'pending',
        ]);

        SystemLogService::log('CREATE', 'REVALUATION',
            "Student {$student['id']} requested revaluation {$id} for mark {$markId}.",
            $id, 'revaluation', null, $actor);

        $this->success($response, $this->model->find($id), 'Revaluation request submitted.', 201);
    }

    // GET /api/revaluations/my
    public function my(Request $request, Response $response): never
    {
        $student = $this->resolveStudent((array) $request->param('_auth_user'));
        if (!$student) {
            $this->error($response, 'No student profile linked to this account.', 404);
        }
        $this->success($response, $this->model->listForStudent((int) $student['id']), 'Revaluations fetched.');
    }

    // GET /api/revaluations/my-backlog
    public function myBacklog(Request $request, Response $response): never
    {
        $student = $this->resolveStudent((array) $request->param('_auth_user'));
        if (!$student) {
            $this->error($response, 'No student profile linked to this account.', 404);
        }
        $this->success($response, $this->model->backlogForStudent((string) $student['regnumber'], self::PASS_MARK), 'Backlog fetched.');
    }

    /* ══════════════════════════════════════════════════════════════════════
     * Staff / registry
     * ═══════════════════════════════════════════════════════════════════ */

    // GET /api/revaluations[?status=]
    public function index(Request $request, Response $response): never
    {
        $status = $request->query('status');
        $this->success($response, $this->model->adminList($status ? (string) $status : null), 'Revaluations fetched.');
    }

    // GET /api/revaluations/backlog/by-id/:id
    public function backlogById(Request $request, Response $response): never
    {
        $id  = (int) $request->param('id');
        $row = $this->db->fetchOne('SELECT regnumber FROM `student` WHERE id = ? LIMIT 1', [$id]);
        if (!$row) {
            $this->error($response, 'Student not found.', 404);
        }
        $this->success($response, $this->model->backlogForStudent((string) $row['regnumber'], self::PASS_MARK), 'Backlog fetched.');
    }

    // PUT /api/revaluations/:id   body: { status, new_marks?, fee_paid? }
    public function review(Request $request, Response $response): never
    {
        $actor = (array) $request->param('_auth_user');
        $id    = (int) $request->param('id');
        $body  = $request->body();

        $rev = $this->model->find($id);
        if (!$rev) {
            $this->error($response, 'Revaluation not found.', 404);
        }

        $status = (string) ($body['status'] ?? '');
        if (!in_array($status, RevaluationModel::STATUSES, true)) {
            $this->error($response, 'Invalid status.', 422);
        }

        $update = [
            'status'      => $status,
            'reviewed_by' => (int) $actor['id'],
            'reviewed_at' => date('Y-m-d H:i:s'),
        ];

        if (array_key_exists('fee_paid', $body) && $body['fee_paid'] !== '') {
            $update['fee_paid'] = (float) $body['fee_paid'];
        }

        // new_marks only meaningful once the result is processed.
        if ($status === 'processed') {
            if (!isset($body['new_marks']) || $body['new_marks'] === '') {
                $this->error($response, 'Provide the revised marks to mark this as processed.', 422);
            }
            $newMarks = (float) $body['new_marks'];
            if ($newMarks < 0 || $newMarks > 100) {
                $this->error($response, 'Revised marks must be between 0 and 100.', 422);
            }
            $update['new_marks'] = $newMarks;
        }

        $this->model->update($id, $update);

        SystemLogService::log('UPDATE', 'REVALUATION',
            "User {$actor['id']} set revaluation {$id} to '{$status}'.",
            $id, 'revaluation', ['status' => $status, 'new_marks' => $update['new_marks'] ?? null], $actor);

        $this->success($response, $this->model->find($id), 'Revaluation updated.');
    }

    /* ── helpers ──────────────────────────────────────────────────────────── */

    /** Resolve the auth user to a student row {id, regnumber}, or null. */
    private function resolveStudent(array $user): ?array
    {
        foreach ([
            ['regnumber', $user['regnumber'] ?? null],
            ['regnumber', $user['username'] ?? null],
            ['email',     $user['email'] ?? null],
        ] as [$col, $val]) {
            if (!$val) continue;
            $row = $this->db->fetchOne("SELECT id, regnumber FROM `student` WHERE {$col} = ? LIMIT 1", [$val]);
            if ($row) return $row;
        }
        return null;
    }
}

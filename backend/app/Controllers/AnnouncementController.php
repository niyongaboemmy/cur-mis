<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use Core\Database;
use App\Models\AnnouncementModel;
use App\Helpers\ValidationHelper;
use App\Services\SystemLogService;

/**
 * Broadcast announcements — exam schedules, results, holidays, notices.
 *
 * Read endpoints (the personalised feed) are open to any authenticated user;
 * the management endpoints require MANAGE_ANNOUNCEMENTS (gated in the route).
 */
class AnnouncementController extends BaseController
{
    private AnnouncementModel $model;
    private Database          $db;

    public function __construct()
    {
        $this->model = new AnnouncementModel();
        $this->db    = Database::getInstance();
    }

    // ── GET /api/announcements ────────────────────────────────────────────────
    /**
     * Personalised feed for the authenticated user — only active, non-expired
     * announcements whose audience matches the viewer's role.
     */
    public function feed(Request $request, Response $response): never
    {
        $actor     = (array) $request->param('_auth_user');
        $role      = (string) ($actor['role'] ?? '');
        $audiences = AnnouncementModel::audiencesForRole($role);

        $items = $this->model->feedFor($audiences);
        $this->success($response, $items, 'Announcements fetched.');
    }

    // ── GET /api/announcements/manage ─────────────────────────────────────────
    /**
     * Full management list — every announcement incl. inactive / expired.
     * Query: audience, is_active, q
     */
    public function index(Request $request, Response $response): never
    {
        $items = $this->model->adminList([
            'audience'  => $request->query('audience'),
            'is_active' => $request->query('is_active'),
            'q'         => $request->query('q'),
        ]);
        $this->success($response, $items, 'Announcements fetched.');
    }

    // ── POST /api/announcements ───────────────────────────────────────────────
    public function store(Request $request, Response $response): never
    {
        $actor  = (array) $request->param('_auth_user');
        $body   = $request->body();

        $errors = ValidationHelper::validate($body, [
            'title' => ['required', 'max:200'],
            'body'  => ['required', 'min:1'],
        ]);
        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $payload = $this->sanitize($body, $actor);

        $id = (int) $this->model->create($payload);

        SystemLogService::log('CREATE', 'ANNOUNCEMENTS',
            "User {$actor['id']} posted announcement {$id} to '{$payload['audience']}'.",
            $id, 'announcement', ['audience' => $payload['audience'], 'priority' => $payload['priority']], $actor
        );

        $this->success($response, $this->model->findWithAuthor($id), 'Announcement posted.', 201);
    }

    // ── PUT /api/announcements/:id ────────────────────────────────────────────
    public function update(Request $request, Response $response): never
    {
        $actor = (array) $request->param('_auth_user');
        $id    = (int) $request->param('id');
        $body  = $request->body();

        if (!$this->model->find($id)) {
            $this->error($response, 'Announcement not found.', 404);
        }

        $errors = ValidationHelper::validate($body, [
            'title' => ['required', 'max:200'],
            'body'  => ['required', 'min:1'],
        ]);
        if (!empty($errors)) {
            $this->error($response, 'Validation failed.', 422, $errors);
        }

        $payload = $this->sanitize($body, $actor, isUpdate: true);
        $this->model->update($id, $payload);

        SystemLogService::log('UPDATE', 'ANNOUNCEMENTS',
            "User {$actor['id']} updated announcement {$id}.",
            $id, 'announcement', null, $actor
        );

        $this->success($response, $this->model->findWithAuthor($id), 'Announcement updated.');
    }

    // ── DELETE /api/announcements/:id ─────────────────────────────────────────
    public function destroy(Request $request, Response $response): never
    {
        $actor = (array) $request->param('_auth_user');
        $id    = (int) $request->param('id');

        if (!$this->model->find($id)) {
            $this->error($response, 'Announcement not found.', 404);
        }

        $this->model->delete($id);

        SystemLogService::log('DELETE', 'ANNOUNCEMENTS',
            "User {$actor['id']} deleted announcement {$id}.",
            $id, 'announcement', null, $actor
        );

        $this->success($response, null, 'Announcement deleted.');
    }

    /* ── helpers ──────────────────────────────────────────────────────────── */

    /**
     * Validate/normalise the writable fields. On create, posted_by is the actor
     * and is_active defaults to 1.
     */
    private function sanitize(array $body, array $actor, bool $isUpdate = false): array
    {
        $audience = in_array($body['audience'] ?? '', AnnouncementModel::AUDIENCES, true)
            ? $body['audience'] : 'all';
        $priority = in_array($body['priority'] ?? '', AnnouncementModel::PRIORITIES, true)
            ? $body['priority'] : 'normal';

        $expires = trim((string) ($body['expires_at'] ?? ''));
        $expires = ($expires !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $expires)) ? $expires : null;

        $payload = [
            'title'      => trim((string) $body['title']),
            'body'       => trim((string) $body['body']),
            'audience'   => $audience,
            'priority'   => $priority,
            'expires_at' => $expires,
            'is_active'  => isset($body['is_active']) ? (int) ((bool) $body['is_active']) : 1,
        ];

        if (!$isUpdate) {
            $payload['posted_by'] = (int) $actor['id'];
        }

        return $payload;
    }
}

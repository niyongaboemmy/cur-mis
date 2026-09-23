<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use App\Models\NotificationModel;

/**
 * The signed-in user's own notifications. Every query is scoped to
 * $_auth_user['id'] — there is no permission to read anyone else's, by design,
 * so these routes need authentication only.
 */
class NotificationController extends BaseController
{
    private NotificationModel $model;

    public function __construct()
    {
        $this->model = new NotificationModel();
    }

    /**
     * GET /api/notifications?page=&per_page=&unread=1
     */
    public function index(Request $request, Response $response): never
    {
        $userId  = $this->userId($request, $response);
        if ($userId === 0) {
            $this->success($response, [
                'data' => [], 'total' => 0, 'unread_total' => 0,
                'per_page' => 20, 'current_page' => 1, 'last_page' => 1,
            ], 'Notifications fetched.');
        }
        $page    = max(1, (int) ($request->query('page') ?? 1));
        $perPage = min(50, max(1, (int) ($request->query('per_page') ?? 20)));
        $unread  = in_array((string) ($request->query('unread') ?? ''), ['1', 'true'], true);

        $total = $this->model->countForUser($userId, $unread);
        $rows  = $this->model->listForUser($userId, $perPage, ($page - 1) * $perPage, $unread);

        $this->success($response, [
            'data'         => $rows,
            'total'        => $total,
            'unread_total' => $this->model->countForUser($userId, true),
            'per_page'     => $perPage,
            'current_page' => $page,
            'last_page'    => (int) ceil($total / max(1, $perPage)),
        ], 'Notifications fetched.');
    }

    /**
     * GET /api/notifications/unread-count
     * The bell polls this, so it stays deliberately cheap: a count plus the few
     * most recent unread rows for the dropdown preview.
     */
    public function unreadCount(Request $request, Response $response): never
    {
        $userId = $this->userId($request, $response);
        if ($userId === 0) {
            $this->success($response, ['total' => 0, 'recent' => []], 'Unread notification count fetched.');
        }

        $this->success($response, [
            'total'  => $this->model->countForUser($userId, true),
            'recent' => $this->model->listForUser($userId, 8, 0, true),
        ], 'Unread notification count fetched.');
    }

    /**
     * POST /api/notifications/:id/read
     */
    public function markRead(Request $request, Response $response): never
    {
        $userId = $this->userId($request, $response);
        if ($userId === 0) {
            $this->success($response, null, 'No change.');
        }
        $id     = (int) $request->param('id');

        $row = $this->model->find($id);
        if (!$row || (int) $row['user_id'] !== $userId) {
            $this->error($response, 'Notification not found.', 404);
        }

        $this->model->markRead($id, $userId);
        $this->success($response, null, 'Notification marked as read.');
    }

    /**
     * POST /api/notifications/read-all
     */
    public function markAllRead(Request $request, Response $response): never
    {
        $userId  = $this->userId($request, $response);
        if ($userId === 0) {
            $this->success($response, ['marked' => 0], 'All notifications marked as read.');
        }
        $changed = $this->model->markAllRead($userId);

        $this->success($response, ['marked' => $changed], 'All notifications marked as read.');
    }

    /**
     * POST /api/notifications/read-entity
     * Body: { entity_type: string, entity_id: number }
     * Clears the badges about one record once the user has actually opened it.
     */
    public function markEntityRead(Request $request, Response $response): never
    {
        $userId = $this->userId($request, $response);
        if ($userId === 0) {
            $this->success($response, ['marked' => 0], 'Notifications marked as read.');
        }
        $body   = $request->body();

        $entityType = trim((string) ($body['entity_type'] ?? ''));
        $entityId   = (int) ($body['entity_id'] ?? 0);

        if ($entityType === '' || $entityId <= 0) {
            $this->error($response, 'entity_type and entity_id are required.', 422);
        }

        $changed = $this->model->markEntityRead($userId, $entityType, $entityId);
        $this->success($response, ['marked' => $changed], 'Notifications marked as read.');
    }

    /**
     * Id of the signed-in user, or 0 when the token carries no usable id.
     *
     * Deliberately does NOT answer 401. AuthMiddleware has already validated
     * the token, so the request IS authenticated — and the frontend treats any
     * 401 as an expired session, so answering 401 here signed the user out of a
     * perfectly good session. Accounts carrying id 0 (rows created while the
     * users table was missing AUTO_INCREMENT) could not stay logged in at all,
     * because the bell polls this on every page.
     *
     * Callers return an empty result for 0 instead: there is nothing to show
     * and nothing to leak.
     */
    private function userId(Request $request, Response $response): int
    {
        $actor = (array) $request->param('_auth_user');
        $id    = (int) ($actor['id'] ?? 0);

        if ($id <= 0) {
            error_log(sprintf(
                '[Notifications] authenticated token carries a non-positive user id (%s, email=%s).',
                var_export($actor['id'] ?? null, true),
                (string) ($actor['email'] ?? 'unknown')
            ));
        }

        return max(0, $id);
    }
}

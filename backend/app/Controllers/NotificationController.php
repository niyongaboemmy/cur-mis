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
        $body   = $request->body();

        $entityType = trim((string) ($body['entity_type'] ?? ''));
        $entityId   = (int) ($body['entity_id'] ?? 0);

        if ($entityType === '' || $entityId <= 0) {
            $this->error($response, 'entity_type and entity_id are required.', 422);
        }

        $changed = $this->model->markEntityRead($userId, $entityType, $entityId);
        $this->success($response, ['marked' => $changed], 'Notifications marked as read.');
    }

    private function userId(Request $request, Response $response): int
    {
        $actor = (array) $request->param('_auth_user');
        $id    = (int) ($actor['id'] ?? 0);
        if ($id <= 0) {
            $this->error($response, 'Unable to identify the current user.', 401);
        }
        return $id;
    }
}

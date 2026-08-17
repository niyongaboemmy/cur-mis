<?php

declare(strict_types=1);

namespace App\Controllers;

use Core\Request;
use Core\Response;
use Core\Database;

/**
 * Self-service notification feed.
 *
 * Rows have been written to `notifications` for a while (FinesController raises
 * FEE_OVERDUE entries, for example) but nothing ever read them back, which is
 * why the header bell had no data to open onto. Every endpoint here is scoped
 * to the authenticated user — a notification is addressed to exactly one
 * user_id and must never be readable or dismissable by anyone else.
 */
class NotificationController extends BaseController
{
    /** Hard cap so a long-lived account can't ask for an unbounded feed. */
    private const MAX_LIMIT = 50;

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

    /**
     * GET /api/notifications
     * Recent notifications for the current user plus the unread count.
     *
     * The unread count is computed over the whole table, not just the returned
     * page, so the badge stays accurate once a user has more than `limit`
     * unread items.
     */
    public function index(Request $request, Response $response): never
    {
        $userId = $this->authUserId($request);
        if ($userId <= 0) {
            $this->error($response, 'Unauthorized.', 401);
        }

        $limit = (int)($request->query('limit') ?? 10);
        $limit = max(1, min(self::MAX_LIMIT, $limit));

        $rows = $this->db->fetchAll(
            "SELECT id, type, message, link, is_read, created_at
               FROM `notifications`
              WHERE user_id = ?
              ORDER BY is_read ASC, created_at DESC
              LIMIT {$limit}",
            [$userId]
        );

        $unread = (int)($this->db->fetchOne(
            "SELECT COUNT(*) AS c FROM `notifications` WHERE user_id = ? AND is_read = 0",
            [$userId]
        )['c'] ?? 0);

        $this->success($response, [
            'total'  => $unread,
            'recent' => array_map(static fn (array $r): array => [
                'id'         => (int)$r['id'],
                'type'       => $r['type'],
                'message'    => (string)$r['message'],
                'link'       => $r['link'],
                'is_read'    => (int)$r['is_read'] === 1,
                'created_at' => $r['created_at'],
            ], $rows),
        ], 'Notifications retrieved.');
    }

    /**
     * POST /api/notifications/:id/read
     * Mark one notification read. Scoped by user_id in the WHERE clause so a
     * guessed id belonging to someone else affects nothing.
     */
    public function markRead(Request $request, Response $response): never
    {
        $userId = $this->authUserId($request);
        if ($userId <= 0) {
            $this->error($response, 'Unauthorized.', 401);
        }

        $id = (int)$request->param('id');
        if ($id <= 0) {
            $this->error($response, 'Invalid notification id.', 422);
        }

        $affected = $this->db->execute(
            "UPDATE `notifications` SET is_read = 1 WHERE id = ? AND user_id = ?",
            [$id, $userId]
        );

        if ($affected === 0) {
            // Covers both "not yours" and "already read" — deliberately does not
            // distinguish the two, so ids can't be probed for existence.
            $this->success($response, ['id' => $id], 'No change.');
        }

        $this->success($response, ['id' => $id], 'Notification marked as read.');
    }

    /**
     * POST /api/notifications/read-all
     */
    public function markAllRead(Request $request, Response $response): never
    {
        $userId = $this->authUserId($request);
        if ($userId <= 0) {
            $this->error($response, 'Unauthorized.', 401);
        }

        $affected = $this->db->execute(
            "UPDATE `notifications` SET is_read = 1 WHERE user_id = ? AND is_read = 0",
            [$userId]
        );

        $this->success($response, ['updated' => $affected], 'All notifications marked as read.');
    }
}

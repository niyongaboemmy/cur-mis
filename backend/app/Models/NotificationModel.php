<?php

declare(strict_types=1);

namespace App\Models;

class NotificationModel extends BaseModel
{
    protected string $table      = 'notifications';
    protected string $primaryKey = 'id';

    protected array $fillable = [
        'user_id', 'type', 'title', 'message', 'link',
        'entity_type', 'entity_id', 'severity', 'is_read', 'read_at',
    ];

    /**
     * A page of one user's notifications, newest first.
     *
     * @return array<int,array<string,mixed>>
     */
    public function listForUser(int $userId, int $limit, int $offset, bool $unreadOnly = false): array
    {
        $where = $unreadOnly ? 'AND `is_read` = 0' : '';

        return $this->db->fetchAll(
            "SELECT * FROM `notifications`
             WHERE `user_id` = ? {$where}
             ORDER BY `created_at` DESC, `id` DESC
             LIMIT ? OFFSET ?",
            [$userId, $limit, $offset]
        );
    }

    public function countForUser(int $userId, bool $unreadOnly = false): int
    {
        $where = $unreadOnly ? 'AND `is_read` = 0' : '';

        return (int) ($this->db->fetchOne(
            "SELECT COUNT(*) AS n FROM `notifications` WHERE `user_id` = ? {$where}",
            [$userId]
        )['n'] ?? 0);
    }

    /** Marks one row read, but only if it belongs to $userId. Returns rows changed. */
    public function markRead(int $id, int $userId): int
    {
        return $this->db->execute(
            "UPDATE `notifications` SET `is_read` = 1, `read_at` = NOW()
             WHERE `id` = ? AND `user_id` = ? AND `is_read` = 0",
            [$id, $userId]
        );
    }

    public function markAllRead(int $userId): int
    {
        return $this->db->execute(
            "UPDATE `notifications` SET `is_read` = 1, `read_at` = NOW()
             WHERE `user_id` = ? AND `is_read` = 0",
            [$userId]
        );
    }

    /**
     * Mark every still-unread notification about one entity as read for one
     * user. Used when someone opens the thing the notification pointed at —
     * a stale "needs your decision" badge after you already decided is worse
     * than no badge at all.
     */
    public function markEntityRead(int $userId, string $entityType, int $entityId): int
    {
        return $this->db->execute(
            "UPDATE `notifications` SET `is_read` = 1, `read_at` = NOW()
             WHERE `user_id` = ? AND `entity_type` = ? AND `entity_id` = ? AND `is_read` = 0",
            [$userId, $entityType, $entityId]
        );
    }

    /**
     * Retire an action-required notification for one entity across EVERY
     * recipient, optionally only of one $type.
     *
     * A "needs your decision" notification is addressed to a group, and the
     * moment one of them decides it is stale for all of them — leaving it unread
     * would send several people to a queue that no longer contains the item.
     */
    public function retireEntityNotifications(string $entityType, int $entityId, ?string $type = null): int
    {
        $sql      = "UPDATE `notifications` SET `is_read` = 1, `read_at` = NOW()
                     WHERE `entity_type` = ? AND `entity_id` = ? AND `is_read` = 0";
        $bindings = [$entityType, $entityId];

        if ($type !== null) {
            $sql        .= ' AND `type` = ?';
            $bindings[] = $type;
        }

        return $this->db->execute($sql, $bindings);
    }
}

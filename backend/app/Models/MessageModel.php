<?php

declare(strict_types=1);

namespace App\Models;

class MessageModel extends BaseModel
{
    protected string $table    = 'messages';
    protected array  $fillable = [
        'conversation_id', 'sender_id', 'body',
        'delivery_channel', 'has_attachment', 'is_draft',
    ];

    /**
     * Paginated messages for a conversation, ordered oldest-first (chat order).
     * Joins sender info, the viewer's read receipt, and any attachments.
     */
    public function listForConversation(int $conversationId, int $viewerId, int $page = 1, int $perPage = 30): array
    {
        $offset = ($page - 1) * $perPage;

        $total = (int) ($this->db->fetchOne("
            SELECT COUNT(*) AS cnt
            FROM messages
            WHERE conversation_id = ? AND is_draft = 0 AND deleted_at IS NULL
        ", [$conversationId])['cnt'] ?? 0);

        $rows = $this->db->fetchAll("
            SELECT
                m.id,
                m.conversation_id,
                m.sender_id,
                u.full_name         AS sender_name,
                r.name              AS sender_role,
                m.body,
                m.delivery_channel,
                m.has_attachment,
                m.is_draft,
                m.created_at,
                mr.seen_at
            FROM messages m
            INNER JOIN users u ON u.id = m.sender_id
            LEFT JOIN roles r  ON r.id = u.role_id
            LEFT JOIN message_recipients mr
                ON mr.message_id = m.id AND mr.user_id = ?
            WHERE m.conversation_id = ?
              AND m.is_draft   = 0
              AND m.deleted_at IS NULL
            ORDER BY m.created_at ASC
            LIMIT ? OFFSET ?
        ", [$viewerId, $conversationId, $perPage, $offset]);

        // Attach file metadata in one additional query (avoids N+1)
        if (!empty($rows)) {
            $msgIds       = array_column($rows, 'id');
            $placeholders = implode(',', array_fill(0, count($msgIds), '?'));
            $attachments  = $this->db->fetchAll("
                SELECT id, message_id, file_name, file_path, mime_type, file_size
                FROM message_attachments
                WHERE message_id IN ({$placeholders})
            ", $msgIds);

            $byMessage = [];
            foreach ($attachments as $att) {
                $byMessage[$att['message_id']][] = $att;
            }
            foreach ($rows as &$row) {
                $row['attachments'] = $byMessage[$row['id']] ?? [];
            }
            unset($row);
        }

        return [
            'data'         => $rows,
            'total'        => $total,
            'per_page'     => $perPage,
            'current_page' => $page,
            'last_page'    => max(1, (int) ceil($total / $perPage)),
        ];
    }

    /**
     * Batch-insert message_recipients rows. INSERT IGNORE prevents duplicates.
     */
    public function createRecipients(int $messageId, array $userIds): void
    {
        if (empty($userIds)) {
            return;
        }

        $placeholders = implode(', ', array_fill(0, count($userIds), '(?, ?)'));
        $bindings     = [];
        foreach ($userIds as $uid) {
            $bindings[] = $messageId;
            $bindings[] = (int) $uid;
        }

        $this->db->execute("
            INSERT IGNORE INTO message_recipients (message_id, user_id)
            VALUES {$placeholders}
        ", $bindings);
    }

    /**
     * Mark a single message as read for one user.
     */
    public function markAsRead(int $messageId, int $userId): void
    {
        $this->db->execute("
            UPDATE message_recipients
            SET seen_at = NOW()
            WHERE message_id = ? AND user_id = ? AND seen_at IS NULL
        ", [$messageId, $userId]);
    }

    /**
     * Bulk-mark all unread messages in a conversation as read for one user.
     * Called automatically when the chat panel is opened.
     */
    public function markConversationRead(int $conversationId, int $userId): void
    {
        $this->db->execute("
            UPDATE message_recipients mr
            INNER JOIN messages m ON m.id = mr.message_id
            SET mr.seen_at = NOW()
            WHERE m.conversation_id = ?
              AND mr.user_id        = ?
              AND mr.seen_at        IS NULL
              AND m.is_draft        = 0
              AND m.deleted_at      IS NULL
        ", [$conversationId, $userId]);
    }

    /**
     * Total unread count across all conversations for the navbar badge.
     */
    public function totalUnread(int $userId): int
    {
        $row = $this->db->fetchOne("
            SELECT COUNT(*) AS cnt
            FROM message_recipients mr
            INNER JOIN messages m ON m.id = mr.message_id
            INNER JOIN conversation_participants cp
                ON cp.conversation_id = m.conversation_id
               AND cp.user_id         = mr.user_id
               AND cp.deleted_at      IS NULL
            WHERE mr.user_id    = ?
              AND mr.seen_at    IS NULL
              AND m.is_draft    = 0
              AND m.deleted_at  IS NULL
        ", [$userId]);

        return (int) ($row['cnt'] ?? 0);
    }

    /**
     * Latest unread message previews for the navbar dropdown.
     */
    public function recentUnread(int $userId, int $limit = 5): array
    {
        return $this->db->fetchAll("
            SELECT
                m.id,
                m.conversation_id,
                m.body,
                m.created_at,
                u.full_name  AS sender_name,
                c.subject    AS conversation_subject
            FROM message_recipients mr
            INNER JOIN messages m       ON m.id  = mr.message_id
            INNER JOIN users u          ON u.id  = m.sender_id
            INNER JOIN conversations c  ON c.id  = m.conversation_id
            INNER JOIN conversation_participants cp
                ON cp.conversation_id = m.conversation_id
               AND cp.user_id         = mr.user_id
               AND cp.deleted_at      IS NULL
            WHERE mr.user_id   = ?
              AND mr.seen_at   IS NULL
              AND m.is_draft   = 0
              AND m.deleted_at IS NULL
            ORDER BY m.created_at DESC
            LIMIT ?
        ", [$userId, $limit]);
    }
}

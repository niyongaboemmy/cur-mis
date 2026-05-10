<?php

declare(strict_types=1);

namespace App\Models;

class ConversationModel extends BaseModel
{
    protected string $table    = 'conversations';
    protected array  $fillable = ['subject', 'type', 'created_by'];

    /**
     * Paginated conversation list for a user.
     * Includes last-message preview, sender name, and per-conversation unread count.
     */
    public function listForUser(int $userId, int $page = 1, int $perPage = 20): array
    {
        $offset = ($page - 1) * $perPage;

        $total = (int) ($this->db->fetchOne("
            SELECT COUNT(*) AS cnt
            FROM conversations c
            INNER JOIN conversation_participants cp
                ON cp.conversation_id = c.id
               AND cp.user_id = ?
               AND cp.deleted_at IS NULL
        ", [$userId])['cnt'] ?? 0);

        $rows = $this->db->fetchAll("
            SELECT
                c.id,
                c.subject,
                c.type,
                c.created_by,
                c.updated_at,
                lm.body         AS last_message_body,
                lm.created_at   AS last_message_at,
                lm_u.full_name  AS last_message_sender_name,
                (
                    SELECT COUNT(*)
                    FROM message_recipients mr2
                    INNER JOIN messages m2 ON m2.id = mr2.message_id
                    WHERE mr2.user_id       = ?
                      AND m2.conversation_id = c.id
                      AND mr2.seen_at        IS NULL
                      AND m2.is_draft        = 0
                      AND m2.deleted_at      IS NULL
                ) AS unread_count,
                (
                    SELECT COUNT(*)
                    FROM conversation_participants cp2
                    WHERE cp2.conversation_id = c.id
                      AND cp2.deleted_at IS NULL
                ) AS participant_count
            FROM conversations c
            INNER JOIN conversation_participants cp
                ON cp.conversation_id = c.id
               AND cp.user_id         = ?
               AND cp.deleted_at      IS NULL
            LEFT JOIN messages lm
                ON lm.id = (
                    SELECT id FROM messages
                    WHERE conversation_id = c.id
                      AND is_draft = 0
                      AND deleted_at IS NULL
                    ORDER BY created_at DESC
                    LIMIT 1
                )
            LEFT JOIN users lm_u ON lm_u.id = lm.sender_id
            ORDER BY COALESCE(lm.created_at, c.created_at) DESC
            LIMIT ? OFFSET ?
        ", [$userId, $userId, $perPage, $offset]);

        return [
            'data'         => $rows,
            'total'        => $total,
            'per_page'     => $perPage,
            'current_page' => $page,
            'last_page'    => max(1, (int) ceil($total / $perPage)),
        ];
    }

    /**
     * Find an existing direct (1:1) conversation between exactly two users.
     * Returns conversation id or null.
     */
    public function findDirect(int $userA, int $userB): ?int
    {
        $row = $this->db->fetchOne("
            SELECT c.id
            FROM conversations c
            INNER JOIN conversation_participants cp1
                ON cp1.conversation_id = c.id AND cp1.user_id = ? AND cp1.deleted_at IS NULL
            INNER JOIN conversation_participants cp2
                ON cp2.conversation_id = c.id AND cp2.user_id = ? AND cp2.deleted_at IS NULL
            WHERE c.type = 'direct'
              AND (
                  SELECT COUNT(*) FROM conversation_participants cp3
                  WHERE cp3.conversation_id = c.id AND cp3.deleted_at IS NULL
              ) = 2
            LIMIT 1
        ", [$userA, $userB]);

        return $row ? (int) $row['id'] : null;
    }

    /**
     * Add a participant. INSERT IGNORE makes this safe to call repeatedly.
     */
    public function addParticipant(int $conversationId, int $userId): void
    {
        $this->db->execute("
            INSERT IGNORE INTO conversation_participants (conversation_id, user_id)
            VALUES (?, ?)
        ", [$conversationId, $userId]);
    }

    /**
     * Restore a soft-deleted participant (user re-opens a conversation they left).
     */
    public function restoreParticipant(int $conversationId, int $userId): void
    {
        $this->db->execute("
            UPDATE conversation_participants
            SET deleted_at = NULL
            WHERE conversation_id = ? AND user_id = ?
        ", [$conversationId, $userId]);
    }

    /**
     * Guard: verify the user is an active (non-deleted) participant.
     */
    public function isParticipant(int $conversationId, int $userId): bool
    {
        $row = $this->db->fetchOne("
            SELECT id FROM conversation_participants
            WHERE conversation_id = ? AND user_id = ? AND deleted_at IS NULL
            LIMIT 1
        ", [$conversationId, $userId]);

        return (bool) $row;
    }

    /**
     * Return all active participant user IDs for a conversation.
     */
    public function getParticipantIds(int $conversationId): array
    {
        $rows = $this->db->fetchAll("
            SELECT user_id FROM conversation_participants
            WHERE conversation_id = ? AND deleted_at IS NULL
        ", [$conversationId]);

        return array_map('intval', array_column($rows, 'user_id'));
    }

    /**
     * Fetch participant user rows (id, full_name, email, role) for display.
     */
    public function getParticipants(int $conversationId): array
    {
        return $this->db->fetchAll("
            SELECT u.id, u.full_name, u.email, r.name AS role
            FROM conversation_participants cp
            INNER JOIN users u ON u.id = cp.user_id
            LEFT JOIN roles r  ON r.id = u.role_id
            WHERE cp.conversation_id = ? AND cp.deleted_at IS NULL
        ", [$conversationId]);
    }
}

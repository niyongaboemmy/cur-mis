<?php

declare(strict_types=1);

namespace App\Models;

/**
 * Forum posts (replies) within a thread. The first post is the opening message.
 */
class ForumPostModel extends BaseModel
{
    protected string $table = 'forum_posts';

    protected array $fillable = [
        'thread_id', 'body', 'created_by', 'is_deleted',
        'attachment_id', 'attachment_name', 'attachment_mime',
    ];

    /** Posts in a thread, oldest first, with author info. */
    public function listForThread(int $threadId): array
    {
        return $this->db->fetchAll(
            "SELECT p.id, p.thread_id, p.body, p.created_by, p.is_deleted, p.created_at, p.updated_at,
                    u.full_name AS author_name, u.photo AS author_photo,
                    r.name AS author_role
             FROM forum_posts p
             LEFT JOIN users u ON u.id = p.created_by
             LEFT JOIN roles r ON r.id = u.role_id
             WHERE p.thread_id = ?
             ORDER BY p.created_at ASC",
            [$threadId]
        );
    }
}

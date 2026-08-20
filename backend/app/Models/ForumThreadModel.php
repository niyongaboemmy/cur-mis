<?php

declare(strict_types=1);

namespace App\Models;

/**
 * Forum threads (topics) within a category.
 */
class ForumThreadModel extends BaseModel
{
    protected string $table = 'forum_threads';

    protected array $fillable = [
        'category_id', 'title', 'created_by', 'is_pinned', 'is_locked', 'is_deleted', 'last_post_at',
    ];

    /** Threads in a category (pinned first, then most recent activity). */
    public function listForCategory(int $categoryId): array
    {
        return $this->db->fetchAll(
            "SELECT t.*,
                    u.full_name AS author_name,
                    (SELECT COUNT(*) FROM forum_posts p WHERE p.thread_id = t.id AND p.is_deleted = 0) AS reply_count
             FROM forum_threads t
             LEFT JOIN users u ON u.id = t.created_by
             WHERE t.category_id = ? AND t.is_deleted = 0
             ORDER BY t.is_pinned DESC, COALESCE(t.last_post_at, t.created_at) DESC",
            [$categoryId]
        );
    }

    public function findWithMeta(int $id): array|false
    {
        return $this->db->fetchOne(
            "SELECT t.*, u.full_name AS author_name, c.name AS category_name, c.audience AS category_audience
             FROM forum_threads t
             LEFT JOIN users u ON u.id = t.created_by
             LEFT JOIN forum_categories c ON c.id = t.category_id
             WHERE t.id = ? LIMIT 1",
            [$id]
        );
    }

    public function touch(int $id): void
    {
        $this->db->execute("UPDATE forum_threads SET last_post_at = NOW() WHERE id = ?", [$id]);
    }

    public function incrementViews(int $id): void
    {
        $this->db->execute("UPDATE forum_threads SET views = views + 1 WHERE id = ?", [$id]);
    }
}

<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\AnnouncementModel;

/**
 * Discussion forum categories. Visibility is audience-scoped, reusing the same
 * role→audience mapping as announcements.
 */
class ForumCategoryModel extends BaseModel
{
    protected string $table = 'forum_categories';

    protected array $fillable = [
        'name', 'slug', 'description', 'audience', 'is_active', 'sort_order', 'created_by',
    ];

    public const AUDIENCES = ['all', 'students', 'staff', 'faculty', 'admin'];

    /**
     * Categories visible to a role, with thread + post counts.
     * Managers pass $includeInactive = true to see hidden categories too.
     *
     * @param string[] $audiences
     */
    public function listFor(array $audiences, bool $includeInactive = false): array
    {
        $audiences = array_values(array_intersect($audiences, self::AUDIENCES)) ?: ['all'];
        $ph   = implode(',', array_fill(0, count($audiences), '?'));
        $args = $audiences;

        $activeSql = $includeInactive ? '' : 'AND c.is_active = 1';

        return $this->db->fetchAll(
            "SELECT c.*,
                    (SELECT COUNT(*) FROM forum_threads t WHERE t.category_id = c.id AND t.is_deleted = 0) AS thread_count,
                    (SELECT COUNT(*) FROM forum_posts p
                       JOIN forum_threads t2 ON t2.id = p.thread_id
                       WHERE t2.category_id = c.id AND p.is_deleted = 0 AND t2.is_deleted = 0) AS post_count,
                    (SELECT MAX(t3.last_post_at) FROM forum_threads t3 WHERE t3.category_id = c.id AND t3.is_deleted = 0) AS last_activity
             FROM forum_categories c
             WHERE c.audience IN ({$ph}) {$activeSql}
             ORDER BY c.sort_order ASC, c.name ASC",
            $args
        );
    }

    public function audienceVisibleToRole(string $audience, string $role): bool
    {
        return in_array($audience, AnnouncementModel::audiencesForRole($role), true);
    }

    public function slugify(string $name): string
    {
        $slug = strtolower(trim(preg_replace('/[^a-zA-Z0-9]+/', '-', $name), '-'));
        $slug = $slug !== '' ? $slug : 'category';
        $base = $slug;
        $i = 1;
        while ($this->exists('slug', $slug)) {
            $slug = $base . '-' . (++$i);
        }
        return substr($slug, 0, 140);
    }
}

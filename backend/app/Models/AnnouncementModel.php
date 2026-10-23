<?php

declare(strict_types=1);

namespace App\Models;

/**
 * Broadcast announcements (exam schedules, results, holidays, notices).
 *
 * Table `announcements`:
 *   id, title, body, audience enum('all','students','staff','faculty','admin'),
 *   priority enum('normal','urgent'), posted_by, expires_at (date|null),
 *   is_active, created_at
 *
 * Unlike `messages`, an announcement is a single broadcast record with no
 * per-recipient row — visibility is computed at read time from the viewer's
 * role against the announcement's `audience`.
 */
class AnnouncementModel extends BaseModel
{
    protected string $table = 'announcements';

    protected array $fillable = [
        'title',
        'body',
        'audience',
        'priority',
        'posted_by',
        'expires_at',
        'is_active',
    ];

    public const AUDIENCES  = ['all', 'students', 'staff', 'faculty', 'admin'];
    public const PRIORITIES = ['normal', 'urgent'];

    /** Role name → audiences whose announcements that role can see. */
    public const ROLE_AUDIENCES = [
        'student'         => ['all', 'students'],
        'applicant'       => ['all'],
        'lecturer'        => ['all', 'staff', 'faculty'],
        'hod'             => ['all', 'staff', 'faculty'],
        'registrar'       => ['all', 'staff', 'admin'],
        'hr_manager'      => ['all', 'staff'],
        'finance_officer' => ['all', 'staff'],
        'gate'            => ['all', 'staff'],
        'admin'           => ['all', 'staff', 'faculty', 'admin', 'students'],
        'superadmin'      => self::AUDIENCES,
    ];

    /**
     * Map a role name to the set of announcement audiences it should see.
     * 'all' is always included.
     */
    public static function audiencesForRole(string $role): array
    {
        return self::ROLE_AUDIENCES[strtolower($role)] ?? ['all'];
    }

    /**
     * The role names that can see announcements aimed at $audience. Used to
     * notify exactly the people the announcement is visible to.
     *
     * @return string[]
     */
    public static function rolesForAudience(string $audience): array
    {
        return array_keys(array_filter(
            self::ROLE_AUDIENCES,
            static fn(array $audiences): bool => in_array($audience, $audiences, true)
        ));
    }

    /**
     * Active, non-expired announcements visible to the given audiences,
     * most recent first. Urgent items float to the top.
     *
     * @param string[] $audiences
     */
    public function feedFor(array $audiences, int $limit = 100): array
    {
        $audiences = array_values(array_intersect($audiences, self::AUDIENCES));
        if (empty($audiences)) {
            $audiences = ['all'];
        }
        $ph = implode(',', array_fill(0, count($audiences), '?'));

        return $this->db->fetchAll(
            "SELECT a.id, a.title, a.body, a.audience, a.priority, a.posted_by,
                    a.expires_at, a.is_active, a.created_at,
                    u.full_name AS posted_by_name
             FROM announcements a
             LEFT JOIN users u ON u.id = a.posted_by
             WHERE a.is_active = 1
               AND a.audience IN ({$ph})
               AND (a.expires_at IS NULL OR a.expires_at >= CURDATE())
             ORDER BY (a.priority = 'urgent') DESC, a.created_at DESC
             LIMIT {$limit}",
            $audiences
        );
    }

    /**
     * Full management list (managers): every announcement including inactive
     * and expired, with optional audience / active filters.
     */
    public function adminList(array $filters = []): array
    {
        $where = [];
        $args  = [];

        if (!empty($filters['audience']) && in_array($filters['audience'], self::AUDIENCES, true)) {
            $where[] = 'a.audience = ?';
            $args[]  = $filters['audience'];
        }
        if (isset($filters['is_active']) && $filters['is_active'] !== '') {
            $where[] = 'a.is_active = ?';
            $args[]  = (int) ((bool) $filters['is_active']);
        }
        if (!empty($filters['q'])) {
            $where[] = '(a.title LIKE ? OR a.body LIKE ?)';
            $args[]  = '%' . $filters['q'] . '%';
            $args[]  = '%' . $filters['q'] . '%';
        }

        $whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';

        return $this->db->fetchAll(
            "SELECT a.id, a.title, a.body, a.audience, a.priority, a.posted_by,
                    a.expires_at, a.is_active, a.created_at,
                    u.full_name AS posted_by_name,
                    (a.expires_at IS NOT NULL AND a.expires_at < CURDATE()) AS is_expired
             FROM announcements a
             LEFT JOIN users u ON u.id = a.posted_by
             {$whereSql}
             ORDER BY a.created_at DESC",
            $args
        );
    }

    public function findWithAuthor(int $id): array|false
    {
        return $this->db->fetchOne(
            "SELECT a.*, u.full_name AS posted_by_name
             FROM announcements a
             LEFT JOIN users u ON u.id = a.posted_by
             WHERE a.id = ? LIMIT 1",
            [$id]
        );
    }
}

<?php

declare(strict_types=1);

namespace App\Models;

class UserCampusAssignmentModel extends BaseModel
{
    protected string $table = 'user_campus_assignments';
    protected array $fillable = [
        'user_id',
        'campus_id',
        'assigned_by',
    ];

    /** Campus rows assigned to a given user (joined with `campuses`). */
    public function listForUser(int $userId): array
    {
        return $this->db->fetchAll(
            "SELECT uca.id            AS assignment_id,
                    uca.assigned_at,
                    uca.assigned_by,
                    c.id, c.name, c.code, c.location, c.is_active
             FROM `user_campus_assignments` uca
             JOIN `campuses` c ON c.id = uca.campus_id
             WHERE uca.user_id = ?
             ORDER BY c.name ASC",
            [$userId]
        );
    }

    /** Plain list of campus IDs assigned to a user. */
    public function campusIdsForUser(int $userId): array
    {
        $rows = $this->db->fetchAll(
            "SELECT campus_id FROM `user_campus_assignments` WHERE user_id = ?",
            [$userId]
        );
        return array_map(fn($r) => (int)$r['campus_id'], $rows);
    }

    public function exists(string $column, mixed $value, int|string|null $excludeId = null): bool
    {
        return parent::exists($column, $value, $excludeId);
    }

    /** True when (user_id, campus_id) pair already exists. */
    public function pairExists(int $userId, int $campusId): bool
    {
        $row = $this->db->fetchOne(
            "SELECT id FROM `user_campus_assignments` WHERE user_id = ? AND campus_id = ? LIMIT 1",
            [$userId, $campusId]
        );
        return $row !== false;
    }

    /** Delete the (user, campus) pair. Returns affected rows. */
    public function deletePair(int $userId, int $campusId): int
    {
        return $this->db->execute(
            "DELETE FROM `user_campus_assignments` WHERE user_id = ? AND campus_id = ?",
            [$userId, $campusId]
        );
    }
}

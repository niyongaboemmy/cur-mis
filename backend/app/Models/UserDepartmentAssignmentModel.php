<?php

declare(strict_types=1);

namespace App\Models;

/**
 * Departments an administrator assigned to a user. When the user's role has
 * "Show only data from assigned department(s)" on, these limit what the user
 * sees (AcademicScopeService).
 */
class UserDepartmentAssignmentModel extends BaseModel
{
    protected string $table = 'user_department_assignments';
    protected array $fillable = [
        'user_id',
        'dep_id',
        'assigned_by',
    ];

    /** Department rows assigned to a given user, with their faculty. */
    public function listForUser(int $userId): array
    {
        return $this->db->fetchAll(
            "SELECT uda.id          AS assignment_id,
                    uda.assigned_at,
                    uda.assigned_by,
                    d.dep_id        AS id,
                    d.dep_name      AS name,
                    d.dep_acronym   AS acronym,
                    f.fac_id,
                    f.fac_name
             FROM `user_department_assignments` uda
             JOIN `departements` d ON d.dep_id = uda.dep_id
             LEFT JOIN `faculty` f ON f.fac_id = d.fac_id
             WHERE uda.user_id = ?
             ORDER BY d.dep_name ASC",
            [$userId]
        );
    }

    /** True when (user_id, dep_id) pair already exists. */
    public function pairExists(int $userId, int $depId): bool
    {
        $row = $this->db->fetchOne(
            "SELECT id FROM `user_department_assignments` WHERE user_id = ? AND dep_id = ? LIMIT 1",
            [$userId, $depId]
        );
        return $row !== false && $row !== null;
    }

    /** Delete the (user, department) pair. Returns affected rows. */
    public function deletePair(int $userId, int $depId): int
    {
        return $this->db->execute(
            "DELETE FROM `user_department_assignments` WHERE user_id = ? AND dep_id = ?",
            [$userId, $depId]
        );
    }
}

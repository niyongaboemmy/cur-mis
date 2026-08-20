<?php

declare(strict_types=1);

namespace App\Models;

use Core\Database;

class UserDepartmentAssignmentModel
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    public function assign(int $userId, int $departmentId, int $assignedBy = null): bool
    {
        $this->db->execute(
            "INSERT INTO `user_department_assignments` (user_id, department_id, assigned_by)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE assigned_at = NOW()",
            [$userId, $departmentId, $assignedBy]
        );
        return true;
    }

    public function unassign(int $userId, int $departmentId): bool
    {
        $this->db->execute(
            "DELETE FROM `user_department_assignments` WHERE user_id = ? AND department_id = ?",
            [$userId, $departmentId]
        );
        return true;
    }

    public function getAssignedDepartments(int $userId): array
    {
        return $this->db->fetchAll(
            "SELECT d.*, uda.assigned_at, uda.assigned_by
             FROM `user_department_assignments` uda
             JOIN `departements` d ON d.dep_id = uda.department_id
             WHERE uda.user_id = ?
             ORDER BY d.dep_name ASC",
            [$userId]
        );
    }

    public function getAssignedUsers(int $departmentId): array
    {
        return $this->db->fetchAll(
            "SELECT u.*, uda.assigned_at, uda.assigned_by
             FROM `user_department_assignments` uda
             JOIN `users` u ON u.id = uda.user_id
             WHERE uda.department_id = ?
             ORDER BY u.full_name ASC",
            [$departmentId]
        );
    }

    public function isAssignedTo(int $userId, int $departmentId): bool
    {
        $result = $this->db->fetch(
            "SELECT 1 FROM `user_department_assignments` WHERE user_id = ? AND department_id = ?",
            [$userId, $departmentId]
        );
        return !empty($result);
    }

    public function hasAssignments(int $userId): bool
    {
        $result = $this->db->fetch(
            "SELECT COUNT(*) as count FROM `user_department_assignments` WHERE user_id = ?",
            [$userId]
        );
        return ($result['count'] ?? 0) > 0;
    }
}

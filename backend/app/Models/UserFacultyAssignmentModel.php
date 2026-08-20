<?php

declare(strict_types=1);

namespace App\Models;

use Core\Database;

class UserFacultyAssignmentModel
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    public function assign(int $userId, int $facultyId, int $assignedBy = null): bool
    {
        $this->db->execute(
            "INSERT INTO `user_faculty_assignments` (user_id, faculty_id, assigned_by)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE assigned_at = NOW()",
            [$userId, $facultyId, $assignedBy]
        );
        return true;
    }

    public function unassign(int $userId, int $facultyId): bool
    {
        $this->db->execute(
            "DELETE FROM `user_faculty_assignments` WHERE user_id = ? AND faculty_id = ?",
            [$userId, $facultyId]
        );
        return true;
    }

    public function getAssignedFaculties(int $userId): array
    {
        return $this->db->fetchAll(
            "SELECT f.*, ufa.assigned_at, ufa.assigned_by
             FROM `user_faculty_assignments` ufa
             JOIN `faculty` f ON f.fac_id = ufa.faculty_id
             WHERE ufa.user_id = ?
             ORDER BY f.fac_name ASC",
            [$userId]
        );
    }

    public function getAssignedUsers(int $facultyId): array
    {
        return $this->db->fetchAll(
            "SELECT u.*, ufa.assigned_at, ufa.assigned_by
             FROM `user_faculty_assignments` ufa
             JOIN `users` u ON u.id = ufa.user_id
             WHERE ufa.faculty_id = ?
             ORDER BY u.full_name ASC",
            [$facultyId]
        );
    }

    public function isAssignedTo(int $userId, int $facultyId): bool
    {
        $result = $this->db->fetch(
            "SELECT 1 FROM `user_faculty_assignments` WHERE user_id = ? AND faculty_id = ?",
            [$userId, $facultyId]
        );
        return !empty($result);
    }

    public function hasAssignments(int $userId): bool
    {
        $result = $this->db->fetch(
            "SELECT COUNT(*) as count FROM `user_faculty_assignments` WHERE user_id = ?",
            [$userId]
        );
        return ($result['count'] ?? 0) > 0;
    }
}

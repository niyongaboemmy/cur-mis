<?php

declare(strict_types=1);

namespace App\Services;

use Core\Database;

/**
 * Service for handling department and faculty scope filtering.
 *
 * Used by controllers to apply department/faculty filters to queries
 * when the user's role has enforce_department_scope or enforce_faculty_scope enabled.
 */
class ScopeService
{
    private Database $db;

    public function __construct()
    {
        $this->db = Database::getInstance();
    }

    /**
     * Get all department IDs in the user's assigned faculties.
     * Useful when filtering by faculty scope.
     */
    public function getDepartmentsInFaculties(array $facultyIds): array
    {
        if (empty($facultyIds)) return [];

        $placeholders = implode(',', array_fill(0, count($facultyIds), '?'));
        $result = $this->db->fetchAll(
            "SELECT dep_id FROM `departements` WHERE fac_id IN ($placeholders)",
            $facultyIds
        );

        return array_map(fn($r) => (int)$r['dep_id'], $result);
    }

    /**
     * Get all staff members in specified departments.
     * Used to filter leave requests, student roster access, etc.
     */
    public function getStaffInDepartments(array $departmentIds): array
    {
        if (empty($departmentIds)) return [];

        $placeholders = implode(',', array_fill(0, count($departmentIds), '?'));
        return $this->db->fetchAll(
            "SELECT id FROM `staff` WHERE department_id IN ($placeholders)",
            $departmentIds
        );
    }

    /**
     * Get all students in specified departments.
     */
    public function getStudentsInDepartments(array $departmentIds): array
    {
        if (empty($departmentIds)) return [];

        $placeholders = implode(',', array_fill(0, count($departmentIds), '?'));
        return $this->db->fetchAll(
            "SELECT DISTINCT s.id FROM `students` s
             JOIN `student_applications` sa ON sa.student_id = s.id
             WHERE sa.department_id IN ($placeholders)",
            $departmentIds
        );
    }

    /**
     * Get all user IDs for staff in specified departments.
     * Useful for filtering who can approve leaves, etc.
     */
    public function getUserIdsForDepartmentStaff(array $departmentIds): array
    {
        if (empty($departmentIds)) return [];

        $placeholders = implode(',', array_fill(0, count($departmentIds), '?'));
        $result = $this->db->fetchAll(
            "SELECT DISTINCT user_id FROM `staff` WHERE department_id IN ($placeholders) AND user_id IS NOT NULL",
            $departmentIds
        );

        return array_map(fn($r) => (int)$r['user_id'], $result);
    }

    /**
     * Check if a department belongs to a user's assigned faculties.
     */
    public function isDepartmentInFaculties(int $departmentId, array $facultyIds): bool
    {
        if (empty($facultyIds)) return false;

        $placeholders = implode(',', array_fill(0, count($facultyIds), '?'));
        $result = $this->db->fetch(
            "SELECT 1 FROM `departements` WHERE dep_id = ? AND fac_id IN ($placeholders)",
            array_merge([$departmentId], $facultyIds)
        );

        return !empty($result);
    }

    /**
     * Get the faculty ID(s) for a given department.
     */
    public function getFacultyForDepartment(int $departmentId): ?int
    {
        $result = $this->db->fetch(
            "SELECT fac_id FROM `departements` WHERE dep_id = ?",
            [$departmentId]
        );

        return $result ? (int)$result['fac_id'] : null;
    }

    /**
     * Build a WHERE clause for department scoping.
     * Returns: ['where' => 'table.department_id IN (?, ?, ...)', 'params' => [...]]
     */
    public function buildDepartmentWhereClause(array $departmentIds, string $columnName = 'department_id'): array
    {
        if (empty($departmentIds)) {
            return ['where' => '1=0', 'params' => []]; // No access
        }

        $placeholders = implode(',', array_fill(0, count($departmentIds), '?'));
        return [
            'where' => "$columnName IN ($placeholders)",
            'params' => $departmentIds,
        ];
    }

    /**
     * Build a WHERE clause for faculty scoping.
     * Returns: ['where' => 'departements.fac_id IN (?, ?, ...)', 'params' => [...]]
     */
    public function buildFacultyWhereClause(array $facultyIds, string $joinAlias = 'd'): array
    {
        if (empty($facultyIds)) {
            return ['where' => '1=0', 'params' => []]; // No access
        }

        $placeholders = implode(',', array_fill(0, count($facultyIds), '?'));
        return [
            'where' => "$joinAlias.fac_id IN ($placeholders)",
            'params' => $facultyIds,
        ];
    }
}

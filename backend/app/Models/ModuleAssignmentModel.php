<?php

declare(strict_types=1);

namespace App\Models;

use App\Helpers\InstructorDirectory;

class ModuleAssignmentModel extends BaseModel
{
    protected string $table = 'module_assignments';
    protected array $fillable = [
        'module_id', 'staff_id', 'academic_year_id', 'academic_term_id',
        'role', 'hours_per_week', 'notes', 'created_by',
    ];

    /**
     * @param array{term_id?:int,staff_id?:int,module_id?:int} $filters
     */
    public function listWithJoins(array $filters = []): array
    {
        $where    = [];
        $bindings = [];

        if (!empty($filters['term_id'])) {
            $where[]    = 'a.academic_term_id = ?';
            $bindings[] = (int)$filters['term_id'];
        }
        if (!empty($filters['staff_id'])) {
            $where[]    = 'a.staff_id = ?';
            $bindings[] = (int)$filters['staff_id'];
        }
        if (!empty($filters['module_id'])) {
            $where[]    = 'a.module_id = ?';
            $bindings[] = (int)$filters['module_id'];
        }

        $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

        // staff_id is a namespaced instructor id: < OFFSET → hr_employees,
        // >= OFFSET → a user account (offset). Resolve the name from both.
        $off = InstructorDirectory::USER_OFFSET;

        return $this->db->fetchAll(
            "SELECT a.*,
                    m.module_code, m.module_name,
                    COALESCE(e.full_name, u.full_name)  AS staff_name,
                    COALESCE(e.email, u.email)          AS staff_email,
                    y.label AS year_label,
                    t.label AS term_label
             FROM `module_assignments` a
             JOIN `modules` m        ON m.module_id = a.module_id
             LEFT JOIN `hr_employees` e ON e.id = a.staff_id AND a.staff_id < {$off}
             LEFT JOIN `users` u        ON u.id = a.staff_id - {$off} AND a.staff_id >= {$off}
             LEFT JOIN `academic_years` y ON y.id = a.academic_year_id
             LEFT JOIN `academic_terms` t ON t.id = a.academic_term_id
             {$whereSql}
             ORDER BY a.academic_term_id DESC, m.module_code ASC",
            $bindings
        );
    }

    /**
     * Workload roll-up per staff member for a given term.
     *
     * @return array<int,array{staff_id:int,staff_name:string,module_count:int,total_hours:float}>
     */
    public function workloadByStaff(int $termId): array
    {
        $off = InstructorDirectory::USER_OFFSET;

        return $this->db->fetchAll(
            "SELECT a.staff_id,
                    COALESCE(e.full_name, u.full_name, CONCAT('Staff #', a.staff_id)) AS staff_name,
                    COUNT(DISTINCT a.module_id) AS module_count,
                    COALESCE(SUM(a.hours_per_week), 0) AS total_hours
             FROM `module_assignments` a
             LEFT JOIN `hr_employees` e ON e.id = a.staff_id AND a.staff_id < {$off}
             LEFT JOIN `users` u        ON u.id = a.staff_id - {$off} AND a.staff_id >= {$off}
             WHERE a.academic_term_id = ?
             GROUP BY a.staff_id, e.full_name, u.full_name
             ORDER BY total_hours DESC",
            [$termId]
        );
    }
}

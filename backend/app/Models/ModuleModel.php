<?php

declare(strict_types=1);

namespace App\Models;

class ModuleModel extends BaseModel
{
    protected string $table = 'modules';
    protected string $primaryKey = 'module_id';
    protected array $fillable = [
        'module_name', 'module_code', 'module_credits',
        'department', 'd_option', 'level', 'hours', 'price',
        'school_id', 'description', 'status',
    ];

    /**
     * Paginated catalog with optional filters.
     * Returns an extra `prerequisites` array on every row
     * (list of { id, module_code, module_name } objects).
     *
     * @param array{department?:int,level?:int,status?:string,q?:string} $filters
     */
    public function listWithPrereqs(int $page = 1, int $perPage = 20, array $filters = []): array
    {
        $where    = [];
        $bindings = [];

        if (!empty($filters['department'])) {
            $where[]    = 'm.department = ?';
            $bindings[] = (int)$filters['department'];
        }
        if (!empty($filters['level'])) {
            $where[]    = 'm.level = ?';
            $bindings[] = (int)$filters['level'];
        }
        if (!empty($filters['status'])) {
            $where[]    = 'm.status = ?';
            $bindings[] = (string)$filters['status'];
        }
        if (!empty($filters['q'])) {
            $where[]    = '(m.module_code LIKE ? OR m.module_name LIKE ?)';
            $bindings[] = '%' . $filters['q'] . '%';
            $bindings[] = '%' . $filters['q'] . '%';
        }

        $whereSql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';
        $page     = max(1, $page);
        $perPage  = max(1, min(100, $perPage));
        $offset   = ($page - 1) * $perPage;

        $totalRow = $this->db->fetchOne(
            "SELECT COUNT(*) AS cnt FROM `modules` m {$whereSql}",
            $bindings
        );
        $total = (int)($totalRow['cnt'] ?? 0);

        $rows = $this->db->fetchAll(
            "SELECT m.*
             FROM `modules` m
             {$whereSql}
             ORDER BY m.module_code ASC
             LIMIT ? OFFSET ?",
            [...$bindings, $perPage, $offset]
        );

        $withPrereqs = array_map(function (array $row) {
            $row['prerequisites'] = $this->prereqsFor((int)$row['module_id']);
            return $row;
        }, $rows);

        return [
            'data'         => $withPrereqs,
            'total'        => $total,
            'per_page'     => $perPage,
            'current_page' => $page,
            'last_page'    => (int)ceil($total / $perPage),
        ];
    }

    /**
     * Fetch the catalog row + prerequisites for a single id.
     */
    public function findWithPrereqs(int $id): array|false
    {
        $row = $this->find($id);
        if (!$row) {
            return false;
        }
        $row['prerequisites'] = $this->prereqsFor($id);
        return $row;
    }

    /** @return array<int,array{id:int,module_code:string,module_name:string}> */
    public function prereqsFor(int $moduleId): array
    {
        return $this->db->fetchAll(
            "SELECT p.prerequisite_module_id AS id, m.module_code, m.module_name
             FROM `module_prerequisites` p
             JOIN `modules` m ON m.module_id = p.prerequisite_module_id
             WHERE p.module_id = ?
             ORDER BY m.module_code ASC",
            [$moduleId]
        );
    }

    /**
     * Modules a given student is currently eligible to register for, in the
     * given term. Filters applied:
     *   - module.status = 'active'
     *   - module.department matches student.department
     *   - module.level <= student.current_level
     *   - every prerequisite is a completed registration for the student
     *   - not already registered this term
     *
     * @return array<int,array<string,mixed>>
     */
    public function listEligibleFor(string $regnumber, int $termId): array
    {
        // Student context (department + level)
        $student = $this->db->fetchOne(
            "SELECT department, current_level FROM `student` WHERE regnumber = ? LIMIT 1",
            [$regnumber]
        );
        if (!$student) {
            return [];
        }

        $level = !empty($student['current_level']) ? (int)$student['current_level'] : 999;

        $rows = $this->db->fetchAll(
            "SELECT m.*
             FROM `modules` m
             WHERE m.status = 'active'
               AND m.level <= ?
               AND m.module_id NOT IN (
                   SELECT module_id FROM `module_registrations`
                   WHERE student_regnumber = ? AND academic_term_id = ?
               )",
            [$level, $regnumber, $termId]
        );

        // Filter by prerequisite completion (cheaper in PHP than nested NOT EXISTS per row)
        $completed = (new ModuleRegistrationModel())->completedModuleIds($regnumber);

        return array_values(array_filter($rows, function (array $m) use ($completed) {
            $prereqIds = array_column($this->prereqsFor((int)$m['module_id']), 'id');
            foreach ($prereqIds as $pid) {
                if (!in_array((int)$pid, $completed, true)) {
                    return false;
                }
            }
            return true;
        }));
    }
}

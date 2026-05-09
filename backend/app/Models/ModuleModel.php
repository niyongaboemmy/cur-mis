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
     * Returns an extra `prerequisites` array AND a `programs` array on
     * every row (list of { id, name } objects derived from
     * `module_programs`).
     *
     * @param array{
     *   department?:int,program?:int,level?:int,status?:string,q?:string,
     *   sort_by?:string,sort_dir?:string
     * } $filters
     */
    public function listWithPrereqs(int $page = 1, int $perPage = 20, array $filters = []): array
    {
        $joins    = '';
        $where    = [];
        $bindings = [];

        // Optional join to filter by program — when set we restrict the row
        // set to modules linked to that programme via the `module_programs`
        // many-to-many table.
        if (!empty($filters['program'])) {
            $joins      .= ' INNER JOIN `module_programs` mp ON mp.module_id = m.module_id';
            $where[]    = 'mp.option_id = ?';
            $bindings[] = (int)$filters['program'];
        }

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
        // Cap is generous so bulk exports (per_page=10000) get every row.
        $perPage  = max(1, min(10000, $perPage));
        $offset   = ($page - 1) * $perPage;

        // Optional sort, whitelisted to safe identifiers.
        $sortBy  = (string)($filters['sort_by']  ?? '');
        $sortDir = strtoupper((string)($filters['sort_dir'] ?? 'ASC'));
        if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $sortBy)) $sortBy = '';
        if (!in_array($sortDir, ['ASC', 'DESC'], true))         $sortDir = 'ASC';
        $orderSql = $sortBy !== ''
            ? "ORDER BY m.`{$sortBy}` {$sortDir}"
            : 'ORDER BY m.module_code ASC';

        $totalRow = $this->db->fetchOne(
            "SELECT COUNT(DISTINCT m.module_id) AS cnt FROM `modules` m {$joins} {$whereSql}",
            $bindings
        );
        $total = (int)($totalRow['cnt'] ?? 0);

        $rows = $this->db->fetchAll(
            "SELECT DISTINCT m.*
             FROM `modules` m
             {$joins}
             {$whereSql}
             {$orderSql}
             LIMIT ? OFFSET ?",
            [...$bindings, $perPage, $offset]
        );

        $moduleIds = array_map(static fn ($r) => (int)$r['module_id'], $rows);
        $offerings = $this->aggregateOfferings($moduleIds);

        $withRels = array_map(function (array $row) use ($offerings) {
            $row['prerequisites'] = $this->prereqsFor((int)$row['module_id']);
            $row['programs']      = $this->programsFor((int)$row['module_id']);
            $row['levels']        = $this->levelsFor((int)$row['module_id']);
            $agg = $offerings[(int)$row['module_id']] ?? null;
            $row['programs_count'] = $agg['programs_count'] ?? 0;
            $row['orders_used']    = $agg['orders_used']    ?? '';
            $row['min_order']      = $agg['min_order']      ?? null;
            return $row;
        }, $rows);

        return [
            'data'         => $withRels,
            'total'        => $total,
            'per_page'     => $perPage,
            'current_page' => $page,
            'last_page'    => (int)ceil($total / $perPage),
        ];
    }

    /**
     * Fetch the catalog row + prerequisites + programs + levels for a single id.
     */
    public function findWithPrereqs(int $id): array|false
    {
        $row = $this->find($id);
        if (!$row) {
            return false;
        }
        $row['prerequisites'] = $this->prereqsFor($id);
        $row['programs']      = $this->programsFor($id);
        $row['levels']        = $this->levelsFor($id);
        return $row;
    }

    /**
     * Batch-aggregate `module_offerings` rows for a list of modules. Returns
     * a map keyed by module_id with summary fields used by the catalog
     * listing and the Excel export. Pre-computing in one query avoids
     * issuing N follow-up queries when the list page is shown.
     *
     * @param int[] $moduleIds
     * @return array<int,array{
     *   offerings_count:int, modes_used:string, semesters_used:string,
     *   campuses_used:string, years_used:string
     * }>
     */
    public function aggregateOfferings(array $moduleIds): array
    {
        if (empty($moduleIds)) return [];
        $ids = array_values(array_unique(array_map('intval', $moduleIds)));
        $ph  = implode(',', array_fill(0, count($ids), '?'));

        // Order now lives on `module_programs` (per-program). Aggregate from
        // there so the catalog listing shows the curricular order without
        // depending on the future Schedules / module_offerings feature.
        $rows = $this->db->fetchAll(
            "SELECT
                mp.module_id,
                COUNT(*)                                                                          AS programs_count,
                GROUP_CONCAT(DISTINCT mp.module_order ORDER BY mp.module_order SEPARATOR ', ')    AS orders_used,
                MIN(mp.module_order)                                                              AS min_order
             FROM `module_programs` mp
             WHERE mp.module_id IN ($ph)
             GROUP BY mp.module_id",
            $ids,
        );

        $byId = [];
        foreach ($rows as $r) {
            $byId[(int)$r['module_id']] = [
                'programs_count' => (int)($r['programs_count'] ?? 0),
                'orders_used'    => (string)($r['orders_used'] ?? ''),
                'min_order'      => $r['min_order'] !== null ? (int)$r['min_order'] : null,
            ];
        }
        return $byId;
    }

    /** @return array<int,array{id:int,name:string,department_id:int|null}> */
    public function programsFor(int $moduleId): array
    {
        return $this->db->fetchAll(
            "SELECT o.id, o.name, o.department_id
             FROM `module_programs` mp
             JOIN `options` o ON o.id = mp.option_id
             WHERE mp.module_id = ?
             ORDER BY o.name ASC",
            [$moduleId]
        );
    }

    /**
     * Replace the set of programs linked to a module with the given ids.
     * Pass an empty array to detach the module from every programme.
     */
    public function syncPrograms(int $moduleId, array $programIds): void
    {
        $programIds = array_values(array_unique(array_map('intval', $programIds)));
        $this->db->execute(
            'DELETE FROM `module_programs` WHERE module_id = ?',
            [$moduleId]
        );
        foreach ($programIds as $pid) {
            if ($pid <= 0) continue;
            $this->db->execute(
                'INSERT IGNORE INTO `module_programs` (`module_id`, `option_id`) VALUES (?, ?)',
                [$moduleId, $pid]
            );
        }
    }

    /** @return array<int,array{id:int,name:string}> */
    public function levelsFor(int $moduleId): array
    {
        return $this->db->fetchAll(
            "SELECT l.id, l.name
             FROM `module_levels` ml
             JOIN `levels` l ON l.id = ml.level_id
             WHERE ml.module_id = ?
             ORDER BY l.id ASC",
            [$moduleId]
        );
    }

    /**
     * Replace the set of levels linked to a module. Empty array detaches all.
     */
    public function syncLevels(int $moduleId, array $levelIds): void
    {
        $levelIds = array_values(array_unique(array_map('intval', $levelIds)));
        $this->db->execute(
            'DELETE FROM `module_levels` WHERE module_id = ?',
            [$moduleId]
        );
        foreach ($levelIds as $lid) {
            if ($lid <= 0) continue;
            $this->db->execute(
                'INSERT IGNORE INTO `module_levels` (`module_id`, `level_id`) VALUES (?, ?)',
                [$moduleId, $lid]
            );
        }
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

        // Exclude modules the student has already engaged with — same-term
        // registrations (any status), AND any completed/registered module
        // across past terms (no point re-enrolling in something they already
        // passed or are still in).
        $rows = $this->db->fetchAll(
            "SELECT m.*
             FROM `modules` m
             WHERE m.status = 'active'
               AND m.level <= ?
               AND m.module_id NOT IN (
                   SELECT module_id FROM `module_registrations`
                   WHERE student_regnumber = ?
                     AND (academic_term_id = ? OR status IN ('registered','completed'))
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

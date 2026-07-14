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
     *   department?:int,departments?:int[],program?:int,level?:int,status?:string,q?:string,
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

        // Support both single department and multiple departments
        if (!empty($filters['departments']) && is_array($filters['departments'])) {
            $departmentIds = array_filter($filters['departments'], fn($v) => !empty($v));
            if (!empty($departmentIds)) {
                $placeholders = implode(',', array_fill(0, count($departmentIds), '?'));
                $where[] = "m.department IN ({$placeholders})";
                $bindings = array_merge($bindings, $departmentIds);
            }
        } elseif (!empty($filters['department'])) {
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

        // Fetch per-credit rates for each module's department/faculty
        $perCreditPrices = $this->getPerCreditPrices($rows);

        // When the caller is browsing modules for a specific programme, flag
        // which of those modules actually have a teaching block for that
        // programme. We accept either a `module_offerings` row for the
        // option (the canonical curriculum signal used by the student
        // profile / exam screens) OR a `module_schedules` row (falls back
        // to room-level timetabling), so an admin who's only filled one of
        // the two screens still sees an accurate "Scheduled" badge.
        $hasProgramFilter = !empty($filters['program']);
        $scheduledIds = [];
        $modesByModule = []; // module_id => ['Day', 'Evening', ...]
        if ($hasProgramFilter && !empty($moduleIds)) {
            $idsPh = implode(',', array_fill(0, count($moduleIds), '?'));
            $programId = (int)$filters['program'];

            // Pull every offering for this (program, module set) so we can
            // both flag is_scheduled AND surface the distinct modes the
            // module is delivered in (Day / Evening / Weekend / Holiday).
            $offRows = $this->db->fetchAll(
                "SELECT module_id, mode
                 FROM `module_offerings`
                 WHERE option_id = ? AND module_id IN ($idsPh)",
                array_merge([$programId], $moduleIds),
            );
            foreach ($offRows as $r) {
                $mid = (int)$r['module_id'];
                $scheduledIds[$mid] = true;
                $mode = trim((string)($r['mode'] ?? ''));
                if ($mode === '') continue;
                $modesByModule[$mid] ??= [];
                if (!in_array($mode, $modesByModule[$mid], true)) {
                    $modesByModule[$mid][] = $mode;
                }
            }

            // module_schedules has no option_id, so we just check existence
            // by module — if an admin has put a session on the timetable
            // we count it as scheduled regardless of which programme owns it.
            $schRows = $this->db->fetchAll(
                "SELECT DISTINCT module_id
                 FROM `module_schedules`
                 WHERE module_id IN ($idsPh)",
                $moduleIds,
            );
            foreach ($schRows as $r) $scheduledIds[(int)$r['module_id']] = true;
        }

        $withRels = array_map(function (array $row) use ($offerings, $scheduledIds, $modesByModule, $hasProgramFilter, $perCreditPrices) {
            $row['prerequisites'] = $this->prereqsFor((int)$row['module_id']);
            $row['programs']      = $this->programsFor((int)$row['module_id']);
            $row['levels']        = $this->levelsFor((int)$row['module_id']);
            $agg = $offerings[(int)$row['module_id']] ?? null;
            $row['programs_count'] = $agg['programs_count'] ?? 0;
            $row['orders_used']    = $agg['orders_used']    ?? '';
            $row['min_order']      = $agg['min_order']      ?? null;
            // Always emitted as a real boolean when the caller filtered by
            // program (even if every module is unscheduled), so the frontend
            // can rely on it. Null only when no program filter is in play.
            $row['is_scheduled']    = $hasProgramFilter
                ? !empty($scheduledIds[(int)$row['module_id']])
                : null;
            $row['offering_modes']  = $hasProgramFilter
                ? array_values($modesByModule[(int)$row['module_id']] ?? [])
                : null;
            // Set per-credit calculated price if available
            $row['per_credit_price'] = $perCreditPrices[(int)$row['module_id']] ?? null;
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
     * Fetch modules for exemption letter builder filtered by department(s).
     * Optimized query that returns essential fields only.
     *
     * @param int|int[] $departmentIds Single department ID or array of department IDs
     * @return array<int, array{
     *   module_id: int,
     *   module_code: string,
     *   module_name: string,
     *   module_credits: int,
     *   department: int,
     *   level: int|null,
     *   status: string
     * }>
     */
    public function getModulesForExemptionLetter($departmentIds): array
    {
        // Normalize input to array
        if (!is_array($departmentIds)) {
            $departmentIds = [$departmentIds];
        }

        // Filter and validate department IDs
        $departmentIds = array_filter(
            array_map('intval', $departmentIds),
            fn($id) => $id > 0
        );

        if (empty($departmentIds)) {
            return [];
        }

        // Build IN clause for multiple departments
        $placeholders = implode(',', array_fill(0, count($departmentIds), '?'));

        $sql = "
            SELECT
                m.module_id,
                m.module_code,
                m.module_name,
                m.module_credits,
                m.department,
                m.level,
                m.status
            FROM `modules` m
            WHERE m.department IN ({$placeholders})
            AND m.status = 'active'
            ORDER BY m.module_code ASC
        ";

        return $this->db->fetchAll($sql, $departmentIds);
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

        // Aggregate program associations. module_order is optional (nullable)
        // so we only include it in the GROUP_CONCAT when present.
        $rows = $this->db->fetchAll(
            "SELECT
                mp.module_id,
                COUNT(*)                                                                          AS programs_count,
                GROUP_CONCAT(DISTINCT IFNULL(mp.module_order, '') SEPARATOR ', ')                 AS orders_used,
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
        // Also require an existing teaching schedule in the target term —
        // students can only enrol in modules that the registrar has actually
        // scheduled, mirroring the Module scheduling page.
        $rows = $this->db->fetchAll(
            "SELECT m.*
             FROM `modules` m
             WHERE m.status = 'active'
               AND m.level <= ?
               AND m.module_id NOT IN (
                   SELECT module_id FROM `module_registrations`
                   WHERE student_regnumber = ?
                     AND (academic_term_id = ? OR status IN ('registered','completed'))
               )
               AND EXISTS (
                   SELECT 1 FROM `module_schedules` ms
                   WHERE ms.module_id = m.module_id
                     AND ms.academic_term_id = ?
               )",
            [$level, $regnumber, $termId, $termId]
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

    /**
     * Fetch per-credit prices for modules based on their department and active per-credit rates.
     * Calculates: module_credits × rate_per_credit for each module's department.
     *
     * @return array<int, int|float|null> module_id => calculated_price
     */
    private function getPerCreditPrices(array $modules): array
    {
        if (empty($modules)) return [];

        // Group modules by department
        $modulesByDept = [];
        foreach ($modules as $m) {
            $dept = (int)($m['department'] ?? 0);
            if ($dept <= 0) continue;
            $modulesByDept[$dept][] = $m;
        }

        if (empty($modulesByDept)) return [];

        // Get the active academic year (or current year)
        $activeYear = $this->db->fetchOne(
            "SELECT id FROM academic_years WHERE is_current = 1 LIMIT 1"
        );
        $yearId = $activeYear ? (int)$activeYear['id'] : null;

        if (!$yearId) return [];

        // Fetch per-credit rates for each faculty (departments are grouped by faculty)
        $deptIds = array_keys($modulesByDept);
        $deptPlaceholders = implode(',', array_fill(0, count($deptIds), '?'));

        $facultyRates = $this->db->fetchAll(
            "SELECT DISTINCT d.dep_id, fpcr.amount_per_credit
             FROM departements d
             LEFT JOIN faculty f ON d.fac_id = f.fac_id
             LEFT JOIN fee_per_credit_rates fpcr ON f.fac_id = fpcr.faculty_id AND fpcr.academic_year_id = ? AND fpcr.is_active = 1
             WHERE d.dep_id IN ($deptPlaceholders)",
            array_merge([$yearId], $deptIds)
        );

        // Build price map: module_id => calculated_price
        $prices = [];
        foreach ($facultyRates as $fr) {
            $dept = (int)$fr['dep_id'];
            $rate = (float)($fr['amount_per_credit'] ?? 0);

            if ($rate <= 0 || !isset($modulesByDept[$dept])) continue;

            foreach ($modulesByDept[$dept] as $module) {
                $moduleId = (int)$module['module_id'];
                $credits = (int)($module['module_credits'] ?? 0);
                if ($credits > 0) {
                    $prices[$moduleId] = $credits * $rate;
                }
            }
        }

        return $prices;
    }
}

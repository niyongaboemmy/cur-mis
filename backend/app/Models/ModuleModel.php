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
        'school_id', 'description', 'status', 'learning_mode',
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
            // A module can sit at several levels (`module_levels`), so filtering
            // on the legacy single `m.level` column alone hid every module whose
            // chosen level was its second or third. Match either side: the join
            // table when it has rows, the legacy column for modules that predate
            // it.
            $where[]    = '(m.level = ? OR EXISTS (
                               SELECT 1 FROM `module_levels` ml
                               WHERE ml.module_id = m.module_id AND ml.level_id = ?
                           ))';
            $bindings[] = (int)$filters['level'];
            $bindings[] = (int)$filters['level'];
        }
        if (!empty($filters['status'])) {
            $where[]    = 'm.status = ?';
            $bindings[] = (string)$filters['status'];
        } elseif (empty($filters['include_archived']) && $this->hasColumn('modules', 'status')) {
            // Hidden rows stay out of the catalogue. Archiving is how the
            // registry retires the spare records left over from the old
            // one-module-per-level workaround: it takes them off this list
            // without touching a single mark — every `module_marks` row still
            // points at the archived module and still prints on the transcript
            // at that module's own level.
            //
            // Column-guarded: live and local schemas drift (see the migration
            // ledger's baselined rows), and the catalogue must not 500 on an
            // environment where this column has not landed yet.
            $where[] = "(m.status IS NULL OR m.status <> 'archived')";
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
        // Whitelist to real, sortable columns on `modules` — an unknown name
        // (e.g. a UI-only "programs" column) would blow up as "Unknown column".
        $sortable = ['module_code', 'module_name', 'module_credits', 'level', 'hours', 'price', 'status'];
        if (!in_array($sortBy, $sortable, true))        $sortBy  = '';
        if (!in_array($sortDir, ['ASC', 'DESC'], true)) $sortDir = 'ASC';
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

        // How many live marks hang off each row. Retiring a duplicate catalogue
        // record is safe either way — the marks keep printing at that module's
        // own level — but the registry should be able to see, before hiding a
        // row, whether anyone's results are recorded against it.
        // A count is a convenience on a screen people need to be able to open.
        // It must never be the reason the catalogue fails to load, so any
        // problem here degrades to "no counts" instead of a 500.
        $marksByModule = [];
        if ($moduleIds !== []) {
            try {
                $idsPh    = implode(',', array_fill(0, count($moduleIds), '?'));
                $liveOnly = $this->hasColumn('module_marks', 'superseded')
                    ? ' AND superseded = 0'
                    : '';
                foreach ($this->db->fetchAll(
                    "SELECT module_id, COUNT(*) AS cnt
                     FROM `module_marks`
                     WHERE module_id IN ($idsPh){$liveOnly}
                     GROUP BY module_id",
                    $moduleIds
                ) as $r) {
                    $marksByModule[(int)$r['module_id']] = (int)$r['cnt'];
                }
            } catch (\Throwable $e) {
                error_log('ModuleModel marks_count failed: ' . $e->getMessage());
                $marksByModule = [];
            }
        }

        $withRels = array_map(function (array $row) use ($offerings, $scheduledIds, $modesByModule, $hasProgramFilter, $perCreditPrices, $marksByModule) {
            $row['prerequisites'] = $this->prereqsFor((int)$row['module_id']);
            $row['programs']      = $this->programsFor((int)$row['module_id']);
            $row['levels']        = $this->levelsFor((int)$row['module_id']);
            $row['marks_count']   = $marksByModule[(int)$row['module_id']] ?? 0;
            // `modules.level` holds a `levels.id`; the catalogue name is what
            // every screen and export shows, so ship it beside the id.
            $row['level_name']    = \App\Helpers\LevelHelper::name($row['level'] ?? null) ?: null;
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
        $row['level_name']    = \App\Helpers\LevelHelper::name($row['level'] ?? null) ?: null;
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

        return \App\Helpers\LevelHelper::decorate($this->db->fetchAll($sql, $departmentIds));
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

    /** @var array<string,bool> "table.column" => exists. Per-process cache. */
    private static array $columnExists = [];

    /**
     * Is this column actually present in the database we are talking to?
     *
     * Local (MySQL 8, rebuilt from dumps) and live (MariaDB, with migrations
     * baselined rather than run) do not always carry the same columns — that
     * drift is a documented property of this project, not a hypothetical. A
     * catalogue screen must not 500 because a nice-to-have column is missing,
     * so anything optional is gated on this. Unknown or unreachable counts as
     * absent: the query then falls back to the shape that worked before.
     */
    private function hasColumn(string $table, string $column): bool
    {
        $key = $table . '.' . $column;
        if (array_key_exists($key, self::$columnExists)) {
            return self::$columnExists[$key];
        }
        try {
            $row = $this->db->fetchOne(
                'SELECT 1 AS ok FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
                 LIMIT 1',
                [$table, $column]
            );
            return self::$columnExists[$key] = (bool)$row;
        } catch (\Throwable) {
            return self::$columnExists[$key] = false;
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
        // Student context (department + level + learning mode)
        $student = $this->db->fetchOne(
            "SELECT department, current_level, learning_mode FROM `student` WHERE regnumber = ? LIMIT 1",
            [$regnumber]
        );
        if (!$student) {
            return [];
        }

        $level = !empty($student['current_level']) ? (int)$student['current_level'] : 999;
        $learningMode = (string)($student['learning_mode'] ?? 'day');

        // Exclude modules the student has already engaged with — same-term
        // registrations (any status), AND any completed/registered module
        // across past terms (no point re-enrolling in something they already
        // passed or are still in).
        // Also require an existing teaching schedule in the target term —
        // students can only enrol in modules that the registrar has actually
        // scheduled, mirroring the Module scheduling page.
        // Filter by learning mode so students only see modules scheduled for their mode.
        $rows = $this->db->fetchAll(
            "SELECT m.*
             FROM `modules` m
             WHERE m.status = 'active'
               AND m.level <= ?
               AND (m.learning_mode IS NULL OR m.learning_mode = ?)
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
            [$level, $learningMode, $regnumber, $termId, $termId]
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

        // Academic year in context (topnav override, else the current year)
        $yearId = \App\Helpers\AcademicContext::yearId();

        if (!$yearId) return [];

        // Fetch per-credit rates for each department
        // Priority: Department-specific rate > Faculty-wide rate
        $deptIds = array_keys($modulesByDept);
        $deptPlaceholders = implode(',', array_fill(0, count($deptIds), '?'));

        // Get all rates for these departments' faculties
        $rates = $this->db->fetchAll(
            "SELECT d.dep_id, fpcr.id AS rate_id, fpcr.amount_per_credit
             FROM departements d
             INNER JOIN faculty f ON d.fac_id = f.fac_id
             INNER JOIN fee_per_credit_rates fpcr ON f.fac_id = fpcr.faculty_id
                                                   AND fpcr.academic_year_id = ?
                                                   AND fpcr.is_active = 1
             WHERE d.dep_id IN ($deptPlaceholders)",
            array_merge([$yearId], $deptIds)
        );

        // For each rate, check if it has department links or applies to all
        $prices = [];
        foreach ($rates as $row) {
            $dept = (int)$row['dep_id'];
            $rateId = (int)$row['rate_id'];
            $rate = (float)($row['amount_per_credit'] ?? 0);

            if ($rate <= 0 || !isset($modulesByDept[$dept])) continue;

            // Check if this rate has department-specific links
            $hasDeptScope = $this->db->fetchOne(
                "SELECT COUNT(*) AS cnt FROM fee_per_credit_rate_departments
                 WHERE fee_per_credit_rate_id = ? AND department_id = ?",
                [$rateId, $dept]
            );

            $isDeptLinked = (int)($hasDeptScope['cnt'] ?? 0) > 0;
            $hasNoScope = !$this->db->fetchOne(
                "SELECT COUNT(*) AS cnt FROM fee_per_credit_rate_departments
                 WHERE fee_per_credit_rate_id = ?",
                [$rateId]
            ) || (int)($this->db->fetchOne(
                "SELECT COUNT(*) AS cnt FROM fee_per_credit_rate_departments
                 WHERE fee_per_credit_rate_id = ?",
                [$rateId]
            )['cnt'] ?? 0) === 0;

            // Apply if: no dept scope (all departments) OR dept is linked
            if ($hasNoScope || $isDeptLinked) {
                foreach ($modulesByDept[$dept] as $module) {
                    $moduleId = (int)$module['module_id'];
                    $credits = (int)($module['module_credits'] ?? 0);
                    if ($credits > 0) {
                        $prices[$moduleId] = $credits * $rate;
                    }
                }
            }
        }

        return $prices;
    }
}

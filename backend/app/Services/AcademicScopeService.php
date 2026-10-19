<?php

declare(strict_types=1);

namespace App\Services;

use Core\Database;

/**
 * Narrows what a Dean or Head of Department sees in the academic modules.
 *
 * A user is scoped when they are the head (or an active acting head) of an
 * organisation unit linked in `leave_org_unit_academic_links`. Faculty links
 * (Dean) cover every department in that faculty; department links (HOD) cover
 * only that department. Superadmins and everyone without a linked unit get
 * `null` — no restriction — so every other role keeps the current behaviour.
 */
final class AcademicScopeService
{
    /**
     * Role names (lower-case) that are always scoped. Add a role name here when
     * a new Dean or HOD role is created.
     */
    public const SCOPED_ROLES = ['dean', 'hod', 'head of department', 'dean of faculty'];

    /** @var array<int, array{level:string,faculty_ids:int[],department_ids:int[],unit_ids:int[]}|null> */
    private static array $cache = [];

    /**
     * @return array{level:string,faculty_ids:int[],department_ids:int[],unit_ids:int[]}|null
     *         null means unrestricted.
     */
    public static function forUser(array $authUser): ?array
    {
        if (AuthService::isSuperadmin($authUser)) {
            return null;
        }
        $userId = (int)($authUser['id'] ?? 0);
        if ($userId <= 0) {
            return null;
        }
        if (!array_key_exists($userId, self::$cache)) {
            // This runs on every request. If the scope tables are not there yet, fail
            // safe: Dean / HOD accounts get no access, everyone else keeps the normal view.
            try {
                $scope = self::resolve($userId);
            } catch (\Throwable) {
                $scope = null;
            }
            // Fail closed: a Dean / HOD account with no approved link sees nothing
            // until an admin approves its faculty or department.
            if ($scope === null && self::hasScopedRole($authUser)) {
                $scope = ['level' => 'none', 'faculty_ids' => [], 'department_ids' => [], 'unit_ids' => []];
            }
            self::$cache[$userId] = $scope;
        }
        return self::$cache[$userId];
    }

    /** True for accounts whose role must be scoped (matched case-insensitively). */
    public static function hasScopedRole(array $authUser): bool
    {
        $role = strtolower(trim((string)($authUser['role'] ?? $authUser['role_name'] ?? '')));
        return in_array($role, self::SCOPED_ROLES, true);
    }

    /**
     * Condition restricting a department-id column (e.g. `m.department`,
     * `s.department`) to the scope. Returns null when unrestricted.
     *
     * @return array{0:string,1:array<int,int|string>}|null
     */
    public static function departmentCondition(?array $scope, string $column): ?array
    {
        if ($scope === null) {
            return null;
        }
        $ids = $scope['department_ids'];
        if ($ids === []) {
            return ['1=0', []];
        }
        $ph = implode(',', array_fill(0, count($ids), '?'));
        // Stored as strings in student/module rows, so bind as strings for a
        // portable comparison against both varchar and int columns.
        return ["{$column} IN ({$ph})", array_map('strval', $ids)];
    }

    /**
     * Department ids the user may see, or null when unrestricted. Used by list queries.
     *
     * @return int[]|null
     */
    public static function scopeDepartmentIds(array $authUser): ?array
    {
        $scope = self::forUser($authUser);
        return $scope === null ? null : $scope["department_ids"];
    }

    /**
     * Module ids in the user's departments, or null when unrestricted.
     *
     * @return int[]|null
     */
    public static function moduleIdsFor(array $authUser): ?array
    {
        $deps = self::scopeDepartmentIds($authUser);
        if ($deps === null) {
            return null;
        }
        if ($deps === []) {
            return [];
        }
        $ph   = implode(',', array_fill(0, count($deps), '?'));
        $rows = Database::getInstance()->fetchAll(
            "SELECT module_id FROM modules WHERE department IN ({$ph})",
            array_values($deps)
        );
        return array_map(static fn ($r) => (int)$r['module_id'], $rows);
    }

    /**
     * SQL fragment " AND {$column} IN (...)" limiting a module-id column to the
     * user's scope. Ids are cast to int and written inline. Returns '' when
     * unrestricted and " AND 1 = 0" when the scope has no modules.
     */
    public static function moduleClause(array $authUser, string $column): string
    {
        $ids = self::moduleIdsFor($authUser);
        if ($ids === null) {
            return '';
        }
        if ($ids === []) {
            return ' AND 1 = 0';
        }
        return " AND {$column} IN (" . implode(',', array_map('intval', $ids)) . ')';
    }

    /**
     * True when a department id (int or numeric string) is inside the scope.
     */
    public static function allowsDepartment(?array $scope, mixed $departmentId): bool
    {
        if ($scope === null) {
            return true;
        }
        return in_array((int)$departmentId, $scope['department_ids'], true);
    }

    /**
     * User ids of staff placed in a unit inside the scope (the unit subtree).
     * Returns null when unrestricted.
     *
     * @return int[]|null
     */
    public static function staffUserIds(?array $scope): ?array
    {
        if ($scope === null) {
            return null;
        }
        if ($scope['unit_ids'] === []) {
            return [];
        }
        $db  = Database::getInstance();
        $ph  = implode(',', array_fill(0, count($scope['unit_ids']), '?'));
        $rows = $db->fetchAll(
            "SELECT DISTINCT user_id FROM leave_org_members WHERE unit_id IN ({$ph})",
            array_values($scope['unit_ids'])
        );
        return array_map(static fn ($r) => (int)$r['user_id'], $rows);
    }

    /** @return array{level:string,faculty_ids:int[],department_ids:int[],unit_ids:int[]}|null */
    private static function resolve(int $userId): ?array
    {
        $db = Database::getInstance();

        // Linked units this user heads (or acts for), plus every unit below them.
        $unitRows = $db->fetchAll(
            "WITH RECURSIVE tree AS (
                SELECT u.id
                  FROM leave_org_units u
                  JOIN leave_org_unit_academic_links l ON l.unit_id = u.id
                 WHERE u.is_active = 1
                   AND (u.head_user_id = ? OR (u.acting_user_id = ? AND u.acting_until >= CURDATE()))
                UNION
                SELECT c.id
                  FROM leave_org_units c
                  JOIN tree t ON c.parent_id = t.id
                 WHERE c.is_active = 1
             )
             SELECT id FROM tree",
            [$userId, $userId]
        );
        if (!$unitRows) {
            return null;
        }
        $unitIds = array_map(static fn ($r) => (int)$r['id'], $unitRows);

        // Only the linked units decide the academic scope.
        $ph    = implode(',', array_fill(0, count($unitIds), '?'));
        $links = $db->fetchAll(
            "SELECT fac_id, dep_id FROM leave_org_unit_academic_links
              WHERE unit_id IN ({$ph})",
            $unitIds
        );
        if (!$links) {
            return null;
        }

        $facultyIds    = [];
        $departmentIds = [];
        $level         = 'department';
        foreach ($links as $l) {
            if (!empty($l['fac_id'])) {
                $facultyIds[] = (int)$l['fac_id'];
                $level        = 'faculty';
            }
            if (!empty($l['dep_id'])) {
                $departmentIds[] = (int)$l['dep_id'];
            }
        }

        $facultyIds = array_values(array_unique($facultyIds));
        if ($facultyIds) {
            $fph  = implode(',', array_fill(0, count($facultyIds), '?'));
            $deps = $db->fetchAll(
                "SELECT dep_id FROM departements WHERE fac_id IN ({$fph})",
                $facultyIds
            );
            foreach ($deps as $d) {
                $departmentIds[] = (int)$d['dep_id'];
            }
        }

        return [
            'level'          => $level,
            'faculty_ids'    => $facultyIds,
            'department_ids' => array_values(array_unique($departmentIds)),
            'unit_ids'       => $unitIds,
        ];
    }
}

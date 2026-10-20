<?php

declare(strict_types=1);

namespace App\Services;

use Core\Database;

/**
 * Route-level gate for Dean / HOD accounts (deny by default).
 *
 * A scoped account may call only the areas listed in ALLOWED. Inside those
 * areas, a request that names a single record (student, staff member, module,
 * schedule, assignment, registration) is refused unless that record belongs to
 * the account's faculty or department. Everything else returns 403.
 *
 * Superadmin and unscoped users are not affected: refusal() returns null for them.
 */
final class AcademicScopeGate
{
    /** Path prefixes (after /api) a Dean / HOD may call. */
    private const ALLOWED = [
        '/api/auth', '/api/academic-scope', '/api/system/basics', '/api/students', '/api/employees',
        '/api/academics-management', '/api/modules', '/api/timetable', '/api/academic',
        '/api/admin/academic-years', '/api/notifications', '/api/messages', '/api/announcements',
        '/api/forums', '/api/push', '/api/navigation',
        '/api/marks', '/api/attendance', '/api/grades', '/api/academic-analytics', '/api/module-requests',
    ];

    /** Reference lists a scoped account may read, by exact path (no personal data). */
    private const READ_REFERENCE = ['/api/users/campuses-catalog'];

    /** Areas a scoped account may read (view marks, attendance and exams) but never change. */
    private const READ_ONLY = ['/api/marks', '/api/attendance', '/api/grades', '/api/academics-management/exams'];

    /** Academic catalogues a scoped account may read. */
    private const ENTITY_READ = [
        'faculties', 'departments', 'options', 'modules', 'levels', 'campuses', 'schools', 'degrees', 'intakes', 'facility',
        'exams',
    ];

    /** Academic structure a scoped account may change (inside its scope, checked by the controller). */
    private const ENTITY_WRITE = ['faculties', 'departments', 'options', 'modules'];

    /**
     * @param array<string,mixed> $user   the signed-in user (from AuthMiddleware)
     * @param array<string,mixed> $body   the request body
     * @param array<string,mixed> $query  the query string
     * @return array{status:int,message:string}|null  null = allowed
     */
    public static function refusal(array $user, string $method, string $path, array $body = [], array $query = []): ?array
    {
        $scope = AcademicScopeService::forUser($user);
        if ($scope === null) {
            return null;
        }

        $method = strtoupper($method);
        $p      = self::apiPath($path);

        $isReference = $method === 'GET' && in_array($p, self::READ_REFERENCE, true);
        if (!$isReference && !self::under($p, self::ALLOWED)) {
            return self::deny(403, 'This area is not available to your account.');
        }
        if ($isReference) {
            return null;
        }

        // Academic catalogues: read the reference lists, change only the academic structure.
        if (preg_match('#^/api/academics-management/([a-z_]+)#', $p, $mm)) {
            $entity = $mm[1];
            if (!in_array($entity, self::ENTITY_READ, true)) {
                return self::deny(403, 'This area is not available to your account.');
            }
            if ($method !== 'GET' && !in_array($entity, self::ENTITY_WRITE, true)) {
                return self::deny(403, 'You cannot change this list.');
            }
            // Academic secretaries manage programmes and modules; faculties and departments stay with the Dean / HOD.
            if ($method !== 'GET' && ($scope['kind'] ?? '') === 'secretary' && in_array($entity, ['faculties', 'departments'], true)) {
                return self::deny(403, 'Only the Dean or HOD can change faculties and departments.');
            }
        }

        // Marks, attendance, grades and exams: read-only, limited to the scope.
        if (self::under($p, self::READ_ONLY)) {
            if ($method !== 'GET') {
                // Marks: a Dean, HOD or secretary may record them for modules in their scope.
                if (str_starts_with($p, '/api/marks')) {
                    return self::markWriteRefused($scope, $method, $p, $body);
                }
                return self::deny(403, 'Dean and HOD accounts view attendance and exams. Lecturers record attendance.');
            }
            $mid = $query['module_id'] ?? null;
            if ($mid !== null && $mid !== '' && !self::moduleInScope($scope, (int)$mid)) {
                return self::deny(403, 'That module is outside your faculty or department.');
            }
            $refused = self::readRecordRefused($scope, $p);
            if ($refused !== null) {
                return $refused;
            }
        }

        // Students and staff: no creation or bulk import from a scoped account.
        if ($method === 'POST' && ($p === '/api/students' || str_starts_with($p, '/api/students/bulk'))) {
            return self::deny(403, 'Students are added by the registry, not by Deans or HODs.');
        }
        if ($method === 'POST' && $p === '/api/employees') {
            return self::deny(403, 'Staff accounts are created by an administrator.');
        }

        // Single records must belong to the scope.
        if (preg_match('#^/api/students/(\d+)(?:/|$)#', $p, $mm)) {
            $dep = self::one('SELECT department FROM student WHERE id = ?', [(int)$mm[1]], 'department');
            if ($dep === null || !AcademicScopeService::allowsDepartment($scope, $dep)) {
                return self::deny(404, 'Student not found');
            }
        }
        if (preg_match('#^/api/employees/(\d+)(?:/|$)#', $p, $mm)) {
            $owner = (int)(self::one('SELECT user_id FROM employees WHERE employee_id = ?', [(int)$mm[1]], 'user_id') ?? 0);
            if ($owner <= 0 || !in_array($owner, AcademicScopeService::staffUserIds($scope) ?? [], true)) {
                return self::deny(404, 'Employee not found');
            }
        }
        if (preg_match('#^/api/modules/(\d+)$#', $p, $mm)) {
            if (!self::moduleInScope($scope, (int)$mm[1])) {
                return self::deny(404, 'Module not found');
            }
        }
        if (preg_match('#^/api/modules/(schedules|assignments|registrations)/(\d+)$#', $p, $mm)) {
            $table = ['schedules' => ['module_schedules', 'ms'], 'assignments' => ['module_assignments', 'ma'], 'registrations' => ['module_registrations', 'mr']][$mm[1]];
            $moduleId = self::one("SELECT module_id FROM `{$table[0]}` WHERE id = ?", [(int)$mm[2]], 'module_id');
            if ($moduleId === null || !self::moduleInScope($scope, (int)$moduleId)) {
                return self::deny(404, 'Not found');
            }
        }

        // Creating a module, schedule, assignment or registration: the module must be in scope.
        if ($method === 'POST' && $p === '/api/modules') {
            if (!AcademicScopeService::allowsDepartment($scope, $body['department'] ?? null)) {
                return self::deny(403, 'You can only add modules to your own faculty or department.');
            }
        }
        if ($method === 'POST' && preg_match('#^/api/modules/(schedules|assignments|registrations)$#', $p)) {
            if (!isset($body['module_id']) || !self::moduleInScope($scope, (int)$body['module_id'])) {
                return self::deny(403, 'You can only manage records for modules in your own faculty or department.');
            }
        }

        return null;
    }

    /**
     * Marks writes: POST /api/marks (save), POST /api/marks/workflow, DELETE /api/marks/:id.
     * The module must be in the scope. The controller applies the same module
     * rule (teachable modules = the scope for these accounts).
     */
    private static function markWriteRefused(array $scope, string $method, string $p, array $body): ?array
    {
        if ($method === 'DELETE' && preg_match('#^/api/marks/(\d+)$#', $p, $mm)) {
            $mid = self::one('SELECT module_id FROM module_marks WHERE id = ?', [(int)$mm[1]], 'module_id');
            return ($mid !== null && self::moduleInScope($scope, (int)$mid))
                ? null
                : self::deny(404, 'Mark not found.');
        }
        if ($method === 'POST' && ($p === '/api/marks' || $p === '/api/marks/workflow')) {
            return self::moduleInScope($scope, (int)($body['module_id'] ?? 0))
                ? null
                : self::deny(403, 'That module is outside your faculty or department.');
        }
        return self::deny(403, 'You cannot change marks this way.');
    }

    /**
     * Read paths that name one record. Returns a refusal when that record is
     * outside the scope, or null when it is allowed (or the path names none).
     */
    private static function readRecordRefused(array $scope, string $p): ?array
    {
        $notFound = self::deny(404, 'Not found');

        // Student by internal id, then by registration number.
        if (preg_match('#/(?:students|gpa)/by-id/(\d+)(?:/|$)#', $p, $mm)) {
            $dep = self::one('SELECT department FROM student WHERE id = ?', [(int)$mm[1]], 'department');
            return ($dep !== null && AcademicScopeService::allowsDepartment($scope, $dep)) ? null : $notFound;
        }
        if (preg_match('#^/api/(?:marks|attendance)/students/([^/]+)(?:/|$)#', $p, $mm)) {
            $dep = self::one('SELECT department FROM student WHERE regnumber = ?', [urldecode($mm[1])], 'department');
            return ($dep !== null && AcademicScopeService::allowsDepartment($scope, $dep)) ? null : $notFound;
        }
        // Attendance session and module report.
        if (preg_match('#^/api/attendance/sessions/(\d+)(?:/|$)#', $p, $mm)) {
            $mid = self::one('SELECT module_id FROM attendance_sessions WHERE id = ?', [(int)$mm[1]], 'module_id');
            return ($mid !== null && self::moduleInScope($scope, (int)$mid)) ? null : $notFound;
        }
        if (preg_match('#^/api/attendance/modules/(\d+)(?:/|$)#', $p, $mm)) {
            return self::moduleInScope($scope, (int)$mm[1]) ? null : $notFound;
        }
        // Exam schedule by id (and its attendance list).
        if (preg_match('#^/api/academics-management/exams/(\d+)(?:/|$)#', $p, $mm)) {
            $mid = self::one('SELECT module_id FROM exam_schedules WHERE id = ?', [(int)$mm[1]], 'module_id');
            return ($mid !== null && self::moduleInScope($scope, (int)$mid)) ? null : $notFound;
        }

        return null;
    }

    /** Path from /api onward, so a deployment prefix (e.g. /umis) does not matter. */
    private static function apiPath(string $path): string
    {
        $pos = strpos($path, '/api/');
        $p   = $pos === false ? $path : substr($path, $pos);
        return rtrim($p, '/');
    }

    /** @param string[] $prefixes */
    private static function under(string $p, array $prefixes): bool
    {
        foreach ($prefixes as $prefix) {
            if ($p === $prefix || str_starts_with($p, $prefix . '/')) {
                return true;
            }
        }
        return false;
    }

    private static function moduleInScope(array $scope, int $moduleId): bool
    {
        $dep = self::one('SELECT department FROM modules WHERE module_id = ?', [$moduleId], 'department');
        return $dep !== null && AcademicScopeService::allowsDepartment($scope, $dep);
    }

    /** @param array<int,mixed> $bindings */
    private static function one(string $sql, array $bindings, string $column): mixed
    {
        $row = Database::getInstance()->fetchOne($sql, $bindings);
        return $row ? ($row[$column] ?? null) : null;
    }

    /** @return array{status:int,message:string} */
    private static function deny(int $status, string $message): array
    {
        return ['status' => $status, 'message' => $message];
    }
}

<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Constants\Permissions;
use App\Helpers\AcademicContext;
use App\Helpers\InstructorDirectory;
use App\Helpers\LecturerScope;
use App\Services\AcademicScopeService;
use App\Services\AuthService;
use Core\Database;
use Core\Request;
use Core\Response;

/**
 * Lecturer placement (faculty, department, option) and the "my students" view.
 *
 * - Admin (superadmin or Manage Users) can place any lecturer anywhere.
 * - Dean / HOD can place lecturers only inside their own faculty or department.
 * - A lecturer sees the students registered in the modules assigned to them
 *   (module_assignments), for the academic year they select.
 */
class LecturerPlacementController extends BaseController
{
    /** GET — lecturers the caller may manage (admin: all; Dean / HOD: placed in their scope). */
    public function lecturers(Request $request, Response $response): never
    {
        $authUser = (array) ($request->param('_auth_user') ?? []);
        $isAdmin  = self::isAdmin($authUser);
        $scope    = AcademicScopeService::forUser($authUser);
        if (!$isAdmin && $scope === null) {
            $this->error($response, 'Forbidden.', 403);
        }

        $rows = Database::getInstance()->fetchAll(
            "SELECT u.id AS user_id, u.full_name, u.username,
                    lp.fac_id, lp.dep_id, lp.option_id,
                    f.fac_name, d.dep_name, o.name AS option_name
               FROM users u
               LEFT JOIN lecturer_placements lp ON lp.user_id = u.id
               LEFT JOIN faculty f ON f.fac_id = lp.fac_id
               LEFT JOIN departements d ON d.dep_id = lp.dep_id
               LEFT JOIN options o ON o.id = lp.option_id
              WHERE u.id IN (SELECT user_id FROM module_assignments WHERE user_id IS NOT NULL)
                 OR lp.user_id IS NOT NULL
              ORDER BY u.full_name"
        );

        if ($scope !== null) {
            // Dean / HOD: only lecturers placed inside their scope.
            $rows = array_values(array_filter($rows, fn ($r) => self::inScope($scope, $r['fac_id'], $r['dep_id'])));
        }

        $this->success($response, $rows);
    }

    /**
     * POST — place a lecturer. Body: { fac_id?, dep_id?, option_id? }.
     * All empty removes the placement. An option implies its department; a
     * department implies its faculty.
     */
    public function place(Request $request, Response $response): never
    {
        $authUser = (array) ($request->param('_auth_user') ?? []);
        $isAdmin  = self::isAdmin($authUser);
        $scope    = AcademicScopeService::forUser($authUser);
        if (!$isAdmin && $scope === null) {
            $this->error($response, 'Forbidden.', 403);
        }

        $userId = (int) $request->param('id');
        $db     = Database::getInstance();
        if (!$db->fetchOne('SELECT id FROM users WHERE id = ?', [$userId])) {
            $this->error($response, 'User not found.', 404);
        }

        $facId = $request->input('fac_id') ? (int) $request->input('fac_id') : null;
        $depId = $request->input('dep_id') ? (int) $request->input('dep_id') : null;
        $optId = $request->input('option_id') ? (int) $request->input('option_id') : null;

        if ($optId !== null) {
            $opt = $db->fetchOne('SELECT department_id FROM options WHERE id = ?', [$optId]);
            if (!$opt) {
                $this->error($response, 'Option not found.', 422);
            }
            if ($depId === null) {
                $depId = (int) $opt['department_id'];
            } elseif ($depId !== (int) $opt['department_id']) {
                $this->error($response, 'That option does not belong to the chosen department.', 422);
            }
        }

        if ($depId !== null) {
            $dep = $db->fetchOne('SELECT fac_id FROM departements WHERE dep_id = ?', [$depId]);
            if (!$dep) {
                $this->error($response, 'Department not found.', 422);
            }
            if ($facId === null) {
                $facId = $dep['fac_id'] !== null ? (int) $dep['fac_id'] : null;
            } elseif ($dep['fac_id'] !== null && $facId !== (int) $dep['fac_id']) {
                $this->error($response, 'That department does not belong to the chosen faculty.', 422);
            }
        } elseif ($facId !== null && !$db->fetchOne('SELECT fac_id FROM faculty WHERE fac_id = ?', [$facId])) {
            $this->error($response, 'Faculty not found.', 422);
        }

        // Dean / HOD may only place inside their own scope. Removing a placement
        // is allowed when the placement being removed is inside their scope.
        if (!$isAdmin) {
            $removing = $facId === null && $depId === null && $optId === null;
            $current  = $removing ? $db->fetchOne('SELECT fac_id, dep_id FROM lecturer_placements WHERE user_id = ?', [$userId]) : null;
            $allowed  = $removing
                ? ($current !== false && self::inScope($scope, $current['fac_id'], $current['dep_id']))
                : self::inScope($scope, $facId, $depId);
            if (!$allowed) {
                $this->error($response, 'You can only place lecturers in your own faculty or department.', 403);
            }
        }

        $actor = (int) ($authUser['id'] ?? 0);
        if ($facId === null && $depId === null && $optId === null) {
            $db->execute('DELETE FROM lecturer_placements WHERE user_id = ?', [$userId]);
        } else {
            $db->execute(
                'INSERT INTO lecturer_placements (user_id, fac_id, dep_id, option_id, updated_by)
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE fac_id = VALUES(fac_id), dep_id = VALUES(dep_id),
                                         option_id = VALUES(option_id), updated_by = VALUES(updated_by)',
                [$userId, $facId, $depId, $optId, $actor ?: null]
            );
        }

        $db->execute(
            'INSERT INTO leave_audit_log (entity, entity_id, user_id, action, details, ip_address)
             VALUES (?, ?, ?, ?, ?, ?)',
            [
                'lecturer_placement',
                (string) $userId,
                $actor ?: null,
                'placement_set',
                json_encode(['fac_id' => $facId, 'dep_id' => $depId, 'option_id' => $optId], JSON_UNESCAPED_UNICODE),
                $request->ip(),
            ]
        );

        $this->success($response, ['user_id' => $userId, 'fac_id' => $facId, 'dep_id' => $depId, 'option_id' => $optId], 'Placement saved.');
    }

    /**
     * GET — students registered in the modules this lecturer teaches, for one academic year.
     * Query: academic_year_id (defaults to the current year).
     */
    public function myStudents(Request $request, Response $response): never
    {
        $authUser = (array) ($request->param('_auth_user') ?? []);
        $userId   = (int) ($authUser['id'] ?? 0);
        $db       = Database::getInstance();

        $years = $db->fetchAll('SELECT id, label, is_current FROM academic_years ORDER BY start_date DESC');
        $yearId = (int) ($request->query('academic_year_id') ?? 0);
        if ($yearId <= 0) {
            // Same year as the top bar and Record marks.
            $yearId = (int) (AcademicContext::yearId() ?? 0);
        }
        if ($yearId <= 0) {
            foreach ($years as $y) {
                if ((int) $y['is_current'] === 1) {
                    $yearId = (int) $y['id'];
                    break;
                }
            }
        }

        // Modules this user teaches in the selected year.
        [$pred, $args] = LecturerScope::assignmentPredicate($db, $userId, 'a');
        $moduleRows = $db->fetchAll(
            "SELECT DISTINCT a.module_id FROM module_assignments a WHERE {$pred} AND a.academic_year_id = ?",
            array_merge($args, [$yearId])
        );
        $moduleIds = array_map(static fn ($r) => (int) $r['module_id'], $moduleRows);

        if ($moduleIds === []) {
            $this->success($response, ['years' => $years, 'academic_year_id' => $yearId, 'modules' => [], 'students' => []]);
        }

        $ph      = implode(',', array_fill(0, count($moduleIds), '?'));
        $students = $db->fetchAll(
            "SELECT mr.student_regnumber AS regnumber, mr.status, mr.grade,
                    m.module_id, m.module_code, m.module_name,
                    t.label AS term_label,
                    s.fname, s.lname
               FROM module_registrations mr
               JOIN academic_terms t ON t.id = mr.academic_term_id AND t.academic_year_id = ?
               JOIN modules m ON m.module_id = mr.module_id
               LEFT JOIN student s ON s.regnumber = mr.student_regnumber
              WHERE mr.module_id IN ({$ph}) AND mr.status = 'registered'
              ORDER BY m.module_code, s.lname, s.fname",
            array_merge([$yearId], $moduleIds)
        );

        $modules = $db->fetchAll(
            "SELECT module_id, module_code, module_name FROM modules WHERE module_id IN ({$ph}) ORDER BY module_code",
            $moduleIds
        );

        $this->success($response, [
            'years'            => $years,
            'academic_year_id' => $yearId,
            'modules'          => $modules,
            'students'         => $students,
        ]);
    }

    /**
     * GET — modules a lecturer teaches this term, and the modules the caller may assign
     * (admin: all active modules; Dean / HOD / secretary: modules in their scope).
     */
    public function modules(Request $request, Response $response): never
    {
        $authUser = (array) ($request->param('_auth_user') ?? []);
        $isAdmin  = self::isAdmin($authUser);
        $scope    = AcademicScopeService::forUser($authUser);
        if (!$isAdmin && $scope === null) {
            $this->error($response, 'Forbidden.', 403);
        }

        $userId = (int) $request->param('id');
        $db     = Database::getInstance();
        if (!$db->fetchOne('SELECT id FROM users WHERE id = ?', [$userId])) {
            $this->error($response, 'User not found.', 404);
        }
        [$yearId, $termId] = $this->currentYearTerm();

        $assigned = $termId === null ? [] : $db->fetchAll(
            "SELECT ma.module_id, m.module_code, m.module_name, m.department
               FROM module_assignments ma
               JOIN modules m ON m.module_id = ma.module_id
              WHERE ma.user_id = ? AND ma.academic_term_id = ?
              ORDER BY m.module_code",
            [$userId, $termId]
        );

        $options = array_values(array_filter(
            $db->fetchAll("SELECT module_id, module_code, module_name, department FROM modules WHERE status = 'active' ORDER BY module_code"),
            fn ($m) => $isAdmin || AcademicScopeService::allowsDepartment($scope, $m['department'])
        ));

        $this->success($response, [
            'academic_year_id' => $yearId,
            'academic_term_id' => $termId,
            'assigned'         => $assigned,
            'options'          => $options,
        ]);
    }

    /**
     * POST — set the modules a lecturer teaches this term. Body: { module_ids: int[] }.
     * Adds the ones ticked and removes the ones unticked. A Dean / HOD / secretary
     * changes only modules in their own scope.
     */
    public function setModules(Request $request, Response $response): never
    {
        $authUser = (array) ($request->param('_auth_user') ?? []);
        $isAdmin  = self::isAdmin($authUser);
        $scope    = AcademicScopeService::forUser($authUser);
        if (!$isAdmin && $scope === null) {
            $this->error($response, 'Forbidden.', 403);
        }

        $userId = (int) $request->param('id');
        $db     = Database::getInstance();
        if (!$db->fetchOne('SELECT id FROM users WHERE id = ?', [$userId])) {
            $this->error($response, 'User not found.', 404);
        }
        [$yearId, $termId] = $this->currentYearTerm();
        if ($yearId === null || $termId === null) {
            $this->error($response, 'No current academic year or term is set. Set one in Years & terms first.', 422);
        }

        $wanted = array_values(array_unique(array_filter(array_map('intval', (array) $request->input('module_ids', [])))));
        $actor  = (int) ($authUser['id'] ?? 0);

        // Every wanted module must be active and inside the caller's scope.
        foreach ($wanted as $mid) {
            $m = $db->fetchOne("SELECT department FROM modules WHERE module_id = ? AND status = 'active'", [$mid]);
            if (!$m) {
                $this->error($response, 'One or more modules were not found.', 422);
            }
            if (!$isAdmin && !AcademicScopeService::allowsDepartment($scope, $m['department'])) {
                $this->error($response, 'You can only assign modules in your own faculty or department.', 403);
            }
        }

        // Current assignments this term that the caller may change.
        $current = $db->fetchAll(
            "SELECT ma.id, ma.module_id, m.department
               FROM module_assignments ma JOIN modules m ON m.module_id = ma.module_id
              WHERE ma.user_id = ? AND ma.academic_term_id = ?",
            [$userId, $termId]
        );
        $currentIds = [];
        foreach ($current as $row) {
            $mid = (int) $row['module_id'];
            if (!$isAdmin && !AcademicScopeService::allowsDepartment($scope, $row['department'])) {
                continue; // outside the caller's scope: leave it alone
            }
            $currentIds[] = $mid;
            if (!in_array($mid, $wanted, true)) {
                $db->execute('DELETE FROM module_assignments WHERE id = ?', [(int) $row['id']]);
            }
        }
        $added = [];
        foreach ($wanted as $mid) {
            if (in_array($mid, $currentIds, true)) {
                continue;
            }
            $db->execute(
                "INSERT INTO module_assignments (module_id, staff_id, user_id, academic_year_id, academic_term_id, role, hours_per_week, notes, created_by)
                 VALUES (?, ?, ?, ?, ?, 'primary', 0, 'Assigned by admin or head', ?)",
                [$mid, InstructorDirectory::USER_OFFSET + $userId, $userId, $yearId, $termId, $actor ?: null]
            );
            $added[] = $mid;
        }

        $db->execute(
            'INSERT INTO leave_audit_log (entity, entity_id, user_id, action, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
            ['lecturer_modules', (string) $userId, $actor ?: null, 'modules_set',
             json_encode(['module_ids' => $wanted, 'added' => $added], JSON_UNESCAPED_UNICODE), $request->ip()]
        );

        $this->success($response, ['user_id' => $userId, 'module_ids' => $wanted], 'Modules saved.');
    }

    /** Current academic year and term ids (or nulls). */
    private function currentYearTerm(): array
    {
        $db     = Database::getInstance();
        $termId = AcademicContext::termId();
        if ($termId === null) {
            $row    = $db->fetchOne('SELECT id FROM academic_terms WHERE is_current = 1 LIMIT 1');
            $termId = $row ? (int) $row['id'] : null;
        }
        $yearId = null;
        if ($termId !== null) {
            $row    = $db->fetchOne('SELECT academic_year_id FROM academic_terms WHERE id = ?', [$termId]);
            $yearId = $row ? (int) $row['academic_year_id'] : null;
        }
        return [$yearId, $termId];
    }

    private static function isAdmin(array $authUser): bool
    {
        if (AuthService::isSuperadmin($authUser)) {
            return true;
        }
        return in_array(Permissions::MANAGE_USERS, (array) ($authUser['permissions'] ?? []), true);
    }

    /** True when the faculty or department falls inside the Dean / HOD scope. */
    private static function inScope(?array $scope, mixed $facId, mixed $depId): bool
    {
        if ($scope === null) {
            return false;
        }
        if ($depId !== null && in_array((int) $depId, $scope['department_ids'], true)) {
            return true;
        }
        return $depId === null && $facId !== null && in_array((int) $facId, $scope['faculty_ids'], true);
    }
}

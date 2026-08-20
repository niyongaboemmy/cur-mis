<?php

declare(strict_types=1);

namespace App\Helpers;

use Core\Database;

/**
 * THE single answer to "which modules does this logged-in user teach?".
 *
 * Before this helper the question was answered four different ways, each with a
 * different notion of lecturer identity, and they disagreed:
 *
 *   ModulesManagementController::myTeachingModules  staff_id = USER_OFFSET + users.id
 *   AttendanceController::myTeachableModules        staff.user_id  (NULL on every staff row)
 *   AttendanceController::teachableModuleIds        staff.id OR USER_OFFSET + users.id
 *   ModuleMarksController::teachableModuleIds       staff.id, employees.employee_id, USER_OFFSET + users.id
 *
 * The result was that a lecturer could be authorised to *write* marks for a
 * module that never appeared in their own module picker, and that the attendance
 * page returned "No staff profile linked to this user" for every real lecturer.
 *
 * Resolution order here:
 *   1. `module_assignments.user_id` — the canonical link, backfilled by
 *      migration 2026_08_09_118. A plain FK to `users.id`, no offset arithmetic.
 *   2. `module_assignments.staff_id` — every legacy id space, kept so rows
 *      written before 118 (or by an admin UI that still writes staff_id only)
 *      continue to resolve.
 *
 * Both are OR'd together, so a module counts as "mine" if EITHER link matches.
 */
final class LecturerScope
{
    /**
     * Every `module_assignments.staff_id` value that could refer to this user,
     * across all four historical id spaces.
     *
     * @return int[]
     */
    public static function staffIdCandidates(Database $db, int $userId): array
    {
        if ($userId <= 0) {
            return [];
        }

        // The namespaced user-account instructor id is always a candidate.
        $ids = [InstructorDirectory::USER_OFFSET + $userId => true];

        // `staff` rows linked to this account.
        try {
            foreach ($db->fetchAll("SELECT id FROM `staff` WHERE user_id = ?", [$userId]) as $r) {
                $ids[(int)$r['id']] = true;
            }
        } catch (\Throwable) { /* table/column absent — ignore */ }

        // Legacy `employees` rows linked to this account.
        try {
            foreach ($db->fetchAll("SELECT employee_id FROM `employees` WHERE user_id = ?", [$userId]) as $r) {
                $ids[(int)$r['employee_id']] = true;
            }
        } catch (\Throwable) { /* employees.user_id absent — ignore */ }

        // `hr_employees` has no user_id column, so it is matched by email.
        try {
            $rows = $db->fetchAll(
                "SELECT e.id FROM `hr_employees` e
                 JOIN `users` u ON LOWER(TRIM(u.email)) = LOWER(TRIM(e.email))
                 WHERE u.id = ? AND e.email IS NOT NULL AND TRIM(e.email) <> ''",
                [$userId]
            );
            foreach ($rows as $r) {
                $ids[(int)$r['id']] = true;
            }
        } catch (\Throwable) { /* table absent — ignore */ }

        return array_keys($ids);
    }

    /**
     * Builds the SQL fragment + bindings that restrict `module_assignments` (
     * aliased as $alias) to this user. Returns [sql, bindings].
     *
     * @return array{0:string,1:array<int,int>}
     */
    public static function assignmentPredicate(Database $db, int $userId, string $alias = 'a'): array
    {
        $candidates = self::staffIdCandidates($db, $userId);
        if ($candidates === []) {
            // No identity at all — match nothing rather than everything.
            return ['1 = 0', []];
        }
        $ph = implode(',', array_fill(0, count($candidates), '?'));
        return [
            "({$alias}.`user_id` = ? OR {$alias}.`staff_id` IN ($ph))",
            array_merge([$userId], $candidates),
        ];
    }

    /**
     * Module ids this user teaches, optionally narrowed to one term.
     *
     * @return int[]
     */
    public static function moduleIds(Database $db, int $userId, ?int $termId = null): array
    {
        [$pred, $args] = self::assignmentPredicate($db, $userId);
        $sql = "SELECT DISTINCT a.`module_id` FROM `module_assignments` a WHERE {$pred}";
        if ($termId !== null && $termId > 0) {
            $sql .= " AND a.`academic_term_id` = ?";
            $args[] = $termId;
        }
        $ids = array_map(static fn ($r) => (int)$r['module_id'], $db->fetchAll($sql, $args));

        // Also count the timetable. Academics -> Scheduling assigns an instructor
        // by writing `module_offerings.instructor_id` and never creates a
        // `module_assignments` row, so a lecturer scheduled to teach a module was
        // invisible to the whole portal until someone separately created an
        // assignment. Same namespaced id space, so the same candidates apply.
        foreach (self::offeringModuleIds($db, $userId) as $mid) {
            $ids[] = $mid;
        }

        return array_values(array_unique($ids));
    }

    /**
     * Module ids this user is the scheduled instructor for, from the timetable
     * (`module_offerings.instructor_id`). Offerings carry no academic_term_id,
     * so they are not term-filterable here.
     *
     * @return int[]
     */
    public static function offeringModuleIds(Database $db, int $userId): array
    {
        $candidates = self::staffIdCandidates($db, $userId);
        if ($candidates === []) {
            return [];
        }
        try {
            $ph   = implode(',', array_fill(0, count($candidates), '?'));
            $rows = $db->fetchAll(
                "SELECT DISTINCT `module_id` FROM `module_offerings`
                  WHERE `instructor_id` IN ($ph)",
                $candidates
            );
            return array_map(static fn ($r) => (int)$r['module_id'], $rows);
        } catch (\Throwable) {
            return [];
        }
    }

    /**
     * Full assignment rows joined to module + term detail, newest term first.
     *
     * @return array<int,array<string,mixed>>
     */
    public static function assignments(Database $db, int $userId, ?int $termId = null): array
    {
        [$pred, $args] = self::assignmentPredicate($db, $userId);
        $sql = "SELECT
                    a.id                AS assignment_id,
                    a.module_id,
                    a.role,
                    a.hours_per_week,
                    a.academic_term_id  AS term_id,
                    a.academic_year_id  AS year_id,
                    m.module_code,
                    m.module_name,
                    m.module_credits,
                    m.department        AS department_id,
                    m.level,
                    t.label             AS term_label
                FROM `module_assignments` a
                JOIN `modules` m        ON m.module_id = a.module_id
                LEFT JOIN `academic_terms` t ON t.id = a.academic_term_id
                WHERE {$pred}";
        if ($termId !== null && $termId > 0) {
            $sql .= " AND a.`academic_term_id` = ?";
            $args[] = $termId;
        }
        $sql .= " ORDER BY a.`academic_term_id` DESC, m.`module_code` ASC";

        $rows = $db->fetchAll($sql, $args);
        $have = [];
        foreach ($rows as $r) {
            $have[(int)$r['module_id']] = true;
        }

        // Modules this user is the scheduled instructor for but which have no
        // module_assignments row (Academics -> Scheduling only writes the
        // timetable). Synthesised so the portal lists them the moment they are
        // scheduled; assignment_id 0 marks the row as timetable-derived.
        $extra = array_values(array_filter(
            self::offeringModuleIds($db, $userId),
            static fn ($mid) => !isset($have[$mid])
        ));

        if ($extra !== []) {
            // Offerings carry no term, so attribute them to the current term —
            // that is the term the rest of the portal reads for enrolment,
            // attendance and marks.
            $cur = $db->fetchOne(
                "SELECT id, academic_year_id, label FROM `academic_terms`
                  WHERE is_current = 1 ORDER BY id ASC LIMIT 1"
            ) ?: null;
            $curId = $cur ? (int)$cur['id'] : 0;

            // Respect an explicit term filter: a timetable-derived course only
            // belongs to the current term.
            if ($termId === null || $termId <= 0 || $termId === $curId) {
                $ph  = implode(',', array_fill(0, count($extra), '?'));
                foreach ($db->fetchAll(
                    "SELECT m.module_id, m.module_code, m.module_name, m.module_credits,
                            m.department AS department_id, m.level
                     FROM `modules` m WHERE m.module_id IN ($ph)
                     ORDER BY m.module_code ASC",
                    $extra
                ) as $m) {
                    $rows[] = [
                        'assignment_id'  => 0,
                        'module_id'      => (int)$m['module_id'],
                        'role'           => 'primary',
                        'hours_per_week' => null,
                        'term_id'        => $curId,
                        'year_id'        => $cur['academic_year_id'] ?? null,
                        'module_code'    => $m['module_code'],
                        'module_name'    => $m['module_name'],
                        'module_credits' => $m['module_credits'],
                        'department_id'  => $m['department_id'],
                        'level'          => $m['level'],
                        'term_label'     => $cur['label'] ?? null,
                    ];
                }
            }
        }

        return $rows;
    }

    /** True when this user is assigned to the given module (any term). */
    public static function teaches(Database $db, int $userId, int $moduleId, ?int $termId = null): bool
    {
        return in_array($moduleId, self::moduleIds($db, $userId, $termId), true);
    }
}

-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 118: Make `module_assignments.user_id` the canonical lecturer link.
-- Date: 2026-08-09
--
-- PROBLEM
-- `module_assignments.staff_id` is a "namespaced instructor id" per
-- backend/app/Helpers/InstructorDirectory.php: values < 1,000,000 mean
-- `hr_employees.id`, values >= 1,000,000 mean `USER_OFFSET (1000000) + users.id`.
-- In practice the column is read four mutually incompatible ways across the
-- codebase (hr_employees.id, staff.id, employees.employee_id, and
-- 1000000+users.id), so no single query can reliably answer "which modules does
-- this logged-in lecturer teach":
--   • ModulesManagementController::myTeachingModules  → staff_id = 1000000+users.id only
--   • AttendanceController::myTeachableModules        → staff.user_id (NULL on every staff row)
--   • AttendanceController::teachableModuleIds        → staff.id OR 1000000+users.id
--   • ModuleMarksController::teachableModuleIds       → authStaffIds() (a third resolution)
--
-- `module_assignments.user_id` (added by 2026_06_02_079) is a proper INT UNSIGNED
-- reference to `users.id` and is already indexed (idx_ma_user), but it is dead:
-- no PHP reads or writes it and ModuleAssignmentModel::$fillable omits it.
--
-- FIX
-- Backfill `user_id` from whichever identity `staff_id` encodes, so lecturer
-- scoping becomes a single unambiguous predicate (`WHERE a.user_id = ?`).
-- `staff_id` is left untouched — every existing reader keeps working, and this
-- migration is therefore additive and safe to re-run.
--
-- Two backfill paths:
--   §1  staff_id >= 1000000  → users.id = staff_id - 1000000   (user-account lecturers)
--   §2  staff_id <  1000000  → hr_employees.id, joined to users by email
--                              (hr_employees has no user_id column, only `email`)
--
-- Both are guarded by `user_id IS NULL` so a row that already carries a correct
-- link is never overwritten, and both require the target user to actually exist.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── §1  User-account lecturers: staff_id = USER_OFFSET + users.id ─────────────
UPDATE `module_assignments` a
JOIN `users` u ON u.`id` = a.`staff_id` - 1000000
SET a.`user_id` = u.`id`
WHERE a.`user_id` IS NULL
  AND a.`staff_id` >= 1000000;


-- ── §2  HR-employee lecturers: staff_id = hr_employees.id, matched by email ───
-- Only applied when the email resolves to exactly one user, so an ambiguous or
-- shared address never mis-attributes a teaching assignment.
UPDATE `module_assignments` a
JOIN `hr_employees` e ON e.`id` = a.`staff_id`
JOIN `users` u ON LOWER(TRIM(u.`email`)) = LOWER(TRIM(e.`email`))
SET a.`user_id` = u.`id`
WHERE a.`user_id` IS NULL
  AND a.`staff_id` < 1000000
  AND e.`email` IS NOT NULL
  AND TRIM(e.`email`) <> ''
  AND (
    SELECT COUNT(*) FROM `users` u2
    WHERE LOWER(TRIM(u2.`email`)) = LOWER(TRIM(e.`email`))
  ) = 1;


-- ── §3  Index guard ───────────────────────────────────────────────────────────
-- idx_ma_user already exists on databases created by migration 079; this is a
-- no-op there and repairs any environment where the column was added without it.
SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'module_assignments'
               AND INDEX_NAME = 'idx_ma_user');
SET @stmt := IF(@idx = 0,
  'ALTER TABLE `module_assignments` ADD INDEX `idx_ma_user` (`user_id`)',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

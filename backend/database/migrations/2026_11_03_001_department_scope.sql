-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 2026-11-03 001: lock a role to the user's assigned department(s).
--
-- 1. roles.enforce_department_scope — the "Show only data from assigned
--    department(s)" switch in Roles → Permissions. When it is on, every user of
--    the role sees only the students, programmes, modules, marks, attendance,
--    exams, timetable, analytics and staff of their department(s)
--    (AcademicScopeService / AcademicScopeGate).
--    Dean, HOD and Academic Secretary were already locked by role name; the
--    switch is turned on for them so the screen shows the real state. This
--    happens only when the column is first added, so a re-run never undoes an
--    administrator's choice.
--
-- 2. user_department_assignments — the departments an administrator assigns
--    to a user in Users management. They add to any department a Dean / HOD
--    heads or an academic secretary is assigned to.
--
-- Idempotent — safe to re-run.
-- ──────────────────────────────────────────────────────────────────────────────

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'roles' AND COLUMN_NAME = 'enforce_department_scope');

SET @stmt := IF(@col = 0,
  'ALTER TABLE `roles` ADD COLUMN `enforce_department_scope` TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @stmt := IF(@col = 0,
  'UPDATE `roles` SET `enforce_department_scope` = 1
    WHERE LOWER(TRIM(`name`)) IN (''dean'', ''hod'', ''head of department'', ''dean of faculty'', ''academic secretary'')',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

CREATE TABLE IF NOT EXISTS `user_department_assignments` (
  `id`          int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`     int(10) UNSIGNED NOT NULL,
  `dep_id`      int(11)          NOT NULL COMMENT 'departements.dep_id',
  `assigned_by` int(10) UNSIGNED DEFAULT NULL,
  `assigned_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_uda_user_dep` (`user_id`, `dep_id`),
  KEY `idx_uda_dep` (`dep_id`),
  CONSTRAINT `fk_uda_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

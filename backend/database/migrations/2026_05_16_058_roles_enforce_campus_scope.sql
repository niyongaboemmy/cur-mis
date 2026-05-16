-- ============================================================
-- Migration 058 — Per-role "enforce campus scope" flag.
-- When ON for a role, every campus-aware admin endpoint restricts
-- the user's view to their assigned campus(es). Lets the registry
-- decide per-role (Registrar, Faculty Admin, etc.) instead of the
-- old hardcoded "admin/superadmin bypass" rule.
-- ============================================================

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'roles' AND COLUMN_NAME = 'enforce_campus_scope');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `roles` ADD COLUMN `enforce_campus_scope` TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

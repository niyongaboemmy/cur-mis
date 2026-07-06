-- ══════════════════════════════════════════════════════════════════════════════
-- PRODUCTION MIGRATION — 2026-07-06
-- 2026_07_06_091_fix_settings_table_autoincrement.sql
--
-- ERROR FIXED:
--   1364  Field 'id' doesn't have a default value
--         SQL: INSERT INTO `settings` (`key_name`, `value`, `description`)
--              VALUES (?, ?, ?)
--
-- ROOT CAUSE:
--   The canonical schema (2026_04_27_027_comprehensive_schema*.sql) defines
--   `settings`.`id` as INT UNSIGNED AUTO_INCREMENT PRIMARY KEY. On this
--   production database the column exists but is missing AUTO_INCREMENT
--   (and possibly the PRIMARY KEY), so any INSERT that omits `id` — which
--   every SettingModel::set() call does — fails with 1364. This is the same
--   class of drift already patched for `leave_requests` / `leave_types` in
--   the PROD cumulated migration.
--
-- DESIGN: Additive + idempotent. Safe to re-run.
-- ══════════════════════════════════════════════════════════════════════════════

SET FOREIGN_KEY_CHECKS = 0;

-- Create the table if it's missing entirely (fresh databases).
CREATE TABLE IF NOT EXISTS `settings` (
  `id`          INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `key_name`    VARCHAR(100)     NOT NULL,
  `value`       TEXT,
  `description` VARCHAR(255)     DEFAULT NULL,
  `updated_at`  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `key_name` (`key_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Ensure a PRIMARY KEY exists (guard for tables that predate the schema file).
SET @has_pk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'settings'
                  AND INDEX_NAME = 'PRIMARY');
SET @stmt := IF(@has_pk = 0,
  'ALTER TABLE `settings` ADD PRIMARY KEY (`id`)',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Ensure `id` is AUTO_INCREMENT — the actual bug being fixed.
SET @is_ai := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'settings'
                 AND COLUMN_NAME = 'id' AND EXTRA LIKE '%auto_increment%');
SET @stmt := IF(@is_ai = 0,
  'ALTER TABLE `settings` MODIFY `id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Ensure the unique key on key_name exists (SettingModel::set() relies on
-- INSERT ... ON DUPLICATE KEY UPDATE semantics keyed by key_name).
SET @has_uq := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'settings'
                  AND INDEX_NAME = 'key_name');
SET @stmt := IF(@has_uq = 0,
  'ALTER TABLE `settings` ADD UNIQUE KEY `key_name` (`key_name`)',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET FOREIGN_KEY_CHECKS = 1;

-- ══════════════════════════════════════════════════════════════════════════════
-- END OF MIGRATION 2026_07_06_091
-- ══════════════════════════════════════════════════════════════════════════════

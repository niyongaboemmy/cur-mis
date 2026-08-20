-- ══════════════════════════════════════════════════════════════════════════════
-- PRODUCTION MIGRATION — 2026-07-06
-- 2026_07_06_090_fix_overdue_alerts_collation_and_rbac_guard.sql
--
-- CONTEXT:
--   Migration 2026_07_02_087 fixed the 1146 (role_permissions), 1048
--   (bank_slip_file_id), 1054 (options.title) and most of the 1267 collation
--   errors. Production logs from 2026-07-03 still show:
--
--     1267  Illegal mix of collations (utf8mb4_general_ci,IMPLICIT) and
--           (utf8mb4_unicode_ci,IMPLICIT)
--
--   ROOT CAUSE FOUND: migration 087 §9 guarded its ALTER with
--   `TABLE_NAME = 'overdue_alerts'`, but the table created by migration
--   2026_05_29_067_fee_fines_and_alerts.sql is actually named
--   `fee_overdue_alerts`. The guard was always a no-op (0 rows matched), so
--   that table's `student_id` column was left on the table-default
--   `utf8mb4_unicode_ci` while every other finance table was moved to
--   `utf8mb4_general_ci` — reintroducing the exact mismatch 087 tried to fix.
--
-- SECTIONS:
--   §1  Fix the real `fee_overdue_alerts` table (the actual bug)
--   §2  Generic safety net — normalise EVERY `student_id` VARCHAR/CHAR
--       column in the database to utf8mb4_general_ci, whatever table it's
--       on. This replaces future hardcoded per-table lists (which is how
--       087 missed the renamed table) with a scan of INFORMATION_SCHEMA.
--   §3  Defensive re-assertion of the RBAC tables from 087, in case that
--       migration was never actually executed against this database.
--
-- DESIGN: Additive + idempotent. Safe to re-run.
-- ══════════════════════════════════════════════════════════════════════════════

SET FOREIGN_KEY_CHECKS = 0;

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §1  fee_overdue_alerts.student_id — the actual mismatched column            ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fee_overdue_alerts'
               AND COLUMN_NAME = 'student_id');
SET @stmt := IF(@col > 0,
  "ALTER TABLE `fee_overdue_alerts` MODIFY `student_id` VARCHAR(30) NOT NULL COLLATE utf8mb4_general_ci",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fee_fines'
               AND COLUMN_NAME = 'student_id');
SET @stmt := IF(@col > 0,
  "ALTER TABLE `fee_fines` MODIFY `student_id` VARCHAR(30) NOT NULL COLLATE utf8mb4_general_ci",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §2  Safety net — normalise every known `student_id` column                  ║
-- ║                                                                              ║
-- ║  Originally written as a stored-procedure cursor walking INFORMATION_SCHEMA ║
-- ║  dynamically, but this migration runner splits multi-statement files on    ║
-- ║  bare `;`, which corrupts CREATE PROCEDURE bodies (and doesn't understand  ║
-- ║  the client-only `DELIMITER` directive at all) — so a cursor can't survive ║
-- ║  here. Enumerate every table known to carry `student_id` instead, each     ║
-- ║  guarded by an INFORMATION_SCHEMA existence check + PREPARE/EXECUTE so a   ║
-- ║  table missing on a given environment is skipped, not fatal.               ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

SET @tbl := 'fee_payments';
SET @col_type := (SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tbl AND COLUMN_NAME = 'student_id' AND DATA_TYPE IN ('varchar','char') LIMIT 1);
SET @stmt := IF(@col_type IS NOT NULL, CONCAT('ALTER TABLE `', @tbl, '` MODIFY `student_id` ', @col_type, ' NOT NULL COLLATE utf8mb4_general_ci'), 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @tbl := 'fee_invoices';
SET @col_type := (SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tbl AND COLUMN_NAME = 'student_id' AND DATA_TYPE IN ('varchar','char') LIMIT 1);
SET @stmt := IF(@col_type IS NOT NULL, CONCAT('ALTER TABLE `', @tbl, '` MODIFY `student_id` ', @col_type, ' NOT NULL COLLATE utf8mb4_general_ci'), 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @tbl := 'fee_bursaries';
SET @col_type := (SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tbl AND COLUMN_NAME = 'student_id' AND DATA_TYPE IN ('varchar','char') LIMIT 1);
SET @stmt := IF(@col_type IS NOT NULL, CONCAT('ALTER TABLE `', @tbl, '` MODIFY `student_id` ', @col_type, ' NOT NULL COLLATE utf8mb4_general_ci'), 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @tbl := 'student_clearances';
SET @col_type := (SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tbl AND COLUMN_NAME = 'student_id' AND DATA_TYPE IN ('varchar','char') LIMIT 1);
SET @stmt := IF(@col_type IS NOT NULL, CONCAT('ALTER TABLE `', @tbl, '` MODIFY `student_id` ', @col_type, ' NOT NULL COLLATE utf8mb4_general_ci'), 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @tbl := 'student_fee_overrides';
SET @col_type := (SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tbl AND COLUMN_NAME = 'student_id' AND DATA_TYPE IN ('varchar','char') LIMIT 1);
SET @stmt := IF(@col_type IS NOT NULL, CONCAT('ALTER TABLE `', @tbl, '` MODIFY `student_id` ', @col_type, ' NOT NULL COLLATE utf8mb4_general_ci'), 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @tbl := 'fee_refunds';
SET @col_type := (SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tbl AND COLUMN_NAME = 'student_id' AND DATA_TYPE IN ('varchar','char') LIMIT 1);
SET @stmt := IF(@col_type IS NOT NULL, CONCAT('ALTER TABLE `', @tbl, '` MODIFY `student_id` ', @col_type, ' NOT NULL COLLATE utf8mb4_general_ci'), 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @tbl := 'fee_fines';
SET @col_type := (SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tbl AND COLUMN_NAME = 'student_id' AND DATA_TYPE IN ('varchar','char') LIMIT 1);
SET @stmt := IF(@col_type IS NOT NULL, CONCAT('ALTER TABLE `', @tbl, '` MODIFY `student_id` ', @col_type, ' NOT NULL COLLATE utf8mb4_general_ci'), 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @tbl := 'fee_overdue_alerts';
SET @col_type := (SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = @tbl AND COLUMN_NAME = 'student_id' AND DATA_TYPE IN ('varchar','char') LIMIT 1);
SET @stmt := IF(@col_type IS NOT NULL, CONCAT('ALTER TABLE `', @tbl, '` MODIFY `student_id` ', @col_type, ' NOT NULL COLLATE utf8mb4_general_ci'), 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §3  Defensive re-assertion of RBAC tables (from migration 087)              ║
-- ║                                                                              ║
-- ║  1146 "role_permissions doesn't exist" kept recurring through 2026-07-02    ║
-- ║  even after 087 was authored, suggesting it may not have been executed on  ║
-- ║  this database yet. CREATE TABLE IF NOT EXISTS is a harmless no-op if 087  ║
-- ║  already ran — run 087 in full if these tables (and their seed data) are   ║
-- ║  still missing.                                                             ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS `permission_categories` (
  `id`          INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(100)     NOT NULL,
  `description` TEXT,
  `created_at`  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `permissions` (
  `id`          INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `category_id` INT(10) UNSIGNED NOT NULL,
  `name`        VARCHAR(100)     NOT NULL,
  `slug`        VARCHAR(100)     NOT NULL,
  `description` TEXT,
  `created_at`  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `roles` (
  `id`          INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(50)      NOT NULL,
  `description` TEXT,
  `created_at`  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `role_permissions` (
  `role_id`       INT(10) UNSIGNED NOT NULL,
  `permission_id` INT(10) UNSIGNED NOT NULL,
  `created_at`    TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`role_id`, `permission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- ══════════════════════════════════════════════════════════════════════════════
-- END OF MIGRATION 2026_07_06_090
--
-- IMPORTANT: if `role_permissions` was actually empty/missing on this database
-- (not just a stale error from before 087 was deployed), run the FULL
-- 2026_07_02_087_fix_rbac_and_misc_prod_errors.sql migration too — it seeds
-- permission_categories, permissions, roles and role_permissions data that
-- this file intentionally does not duplicate.
-- ══════════════════════════════════════════════════════════════════════════════

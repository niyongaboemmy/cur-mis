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
-- ║ §2  Safety net — normalise every `student_id` column, database-wide         ║
-- ║                                                                              ║
-- ║  Hardcoded per-table ALTER lists have now missed a table twice (once in     ║
-- ║  084/PROD_cumulated, once in 087). Instead, walk INFORMATION_SCHEMA and     ║
-- ║  fix every VARCHAR/CHAR `student_id` column that isn't already              ║
-- ║  utf8mb4_general_ci, regardless of table name.                             ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

DROP PROCEDURE IF EXISTS `_normalise_student_id_collations`;

DELIMITER $$
CREATE PROCEDURE `_normalise_student_id_collations`()
BEGIN
  DECLARE done INT DEFAULT 0;
  DECLARE tbl_name VARCHAR(64);
  DECLARE col_type VARCHAR(64);
  DECLARE cur CURSOR FOR
    SELECT TABLE_NAME, COLUMN_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND COLUMN_NAME = 'student_id'
      AND DATA_TYPE IN ('varchar', 'char')
      AND (COLLATION_NAME IS NULL OR COLLATION_NAME <> 'utf8mb4_general_ci');
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

  OPEN cur;
  read_loop: LOOP
    FETCH cur INTO tbl_name, col_type;
    IF done THEN
      LEAVE read_loop;
    END IF;

    SET @ddl := CONCAT(
      'ALTER TABLE `', tbl_name, '` MODIFY `student_id` ', col_type,
      ' NOT NULL COLLATE utf8mb4_general_ci'
    );
    PREPARE s FROM @ddl; EXECUTE s; DEALLOCATE PREPARE s;
  END LOOP;
  CLOSE cur;
END$$
DELIMITER ;

CALL `_normalise_student_id_collations`();
DROP PROCEDURE `_normalise_student_id_collations`;


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

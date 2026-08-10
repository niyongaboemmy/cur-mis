-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Migration 091: Add missing columns to fee_structures table
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Issue: fee_structures.department_id, level_id, label columns were missing from the live table
-- (likely lost in an earlier cpanel-repaired schema pass), causing 1054 SQL errors when creating
-- or updating fee structures. These columns are required by FeeStructureModel and FeeController.
--
-- Solution: Add the three missing columns as nullable to safely coexist with legacy data.
-- The 4 existing legacy rows (ids 2,3,5,6) will get department_id=NULL (safe: matches how
-- findBestMatch treats NULL department_id as "applies to all departments"). New rows created
-- through FeeController::createStructure() will always populate these columns (validated).
--
-- WARNING: The 4 legacy rows' mapping from program_id to department_id is ambiguous and left to
-- manual review by the user after this migration runs.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

SET FOREIGN_KEY_CHECKS = 0;

-- Guarded via INFORMATION_SCHEMA rather than `ADD COLUMN IF NOT EXISTS`, which
-- is MariaDB-only syntax and is a 1064 syntax error on MySQL 8.

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='fee_structures' AND COLUMN_NAME='department_id');
SET @stmt := IF(@col=0,
  'ALTER TABLE `fee_structures` ADD COLUMN `department_id` INT UNSIGNED NULL DEFAULT NULL AFTER `academic_year_id`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='fee_structures' AND COLUMN_NAME='level_id');
SET @stmt := IF(@col=0,
  'ALTER TABLE `fee_structures` ADD COLUMN `level_id` INT UNSIGNED NULL DEFAULT NULL AFTER `department_id`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='fee_structures' AND COLUMN_NAME='label');
SET @stmt := IF(@col=0,
  'ALTER TABLE `fee_structures` ADD COLUMN `label` VARCHAR(120) NULL DEFAULT NULL AFTER `fee_type`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET FOREIGN_KEY_CHECKS = 1;

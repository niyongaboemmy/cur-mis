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

ALTER TABLE `fee_structures` ADD COLUMN IF NOT EXISTS `department_id` INT UNSIGNED NULL DEFAULT NULL AFTER `academic_year_id`;
ALTER TABLE `fee_structures` ADD COLUMN IF NOT EXISTS `level_id`      INT UNSIGNED NULL DEFAULT NULL AFTER `department_id`;
ALTER TABLE `fee_structures` ADD COLUMN IF NOT EXISTS `label`         VARCHAR(120)   NULL DEFAULT NULL AFTER `fee_type`;

SET FOREIGN_KEY_CHECKS = 1;

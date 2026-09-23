-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: Add Staff Qualifications and Insurance Fields to Employees Table
-- Date: 2026-09-07
--
-- Adds the following columns to the `employees` table to capture staff
-- qualifications and insurance information:
--   - end_date: Employment end date (for contract/termination tracking)
--   - rssb_number: Social security/pension registration number
--   - degree: Academic degree or qualification (BSc, MSc, PhD, etc.)
--   - area_specialization: Field of study/specialization
--   - foreign_degree_equivalence: Recognition status for foreign degrees
--
-- These fields are optional (nullable) and used by HR staff to manage
-- employee information through the Staff List module.
-- ──────────────────────────────────────────────────────────────────────────────

-- Add missing columns to employees table if they don't exist.
-- `ADD COLUMN IF NOT EXISTS` is MariaDB-only and is a 1064 syntax error on the
-- MySQL 8 that local MAMP runs, so each column goes through the portable
-- INFORMATION_SCHEMA guard this repo uses elsewhere (see
-- 2026_06_16_083_consolidated_session_schema.sql).

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'end_date');
SET @s := IF(@c = 0, "ALTER TABLE `employees` ADD COLUMN `end_date` DATE DEFAULT NULL COMMENT 'Employment end date' AFTER `employee_reg_date`", 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'rssb_number');
SET @s := IF(@c = 0, "ALTER TABLE `employees` ADD COLUMN `rssb_number` VARCHAR(50) DEFAULT NULL COMMENT 'Social security/pension number' AFTER `employee_account`", 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'degree');
SET @s := IF(@c = 0, "ALTER TABLE `employees` ADD COLUMN `degree` VARCHAR(100) DEFAULT NULL COMMENT 'Academic degree (BSc, MSc, PhD, etc.)' AFTER `rssb_number`", 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'area_specialization');
SET @s := IF(@c = 0, "ALTER TABLE `employees` ADD COLUMN `area_specialization` VARCHAR(150) DEFAULT NULL COMMENT 'Area of specialization/field of study' AFTER `degree`", 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'foreign_degree_equivalence');
SET @s := IF(@c = 0, "ALTER TABLE `employees` ADD COLUMN `foreign_degree_equivalence` VARCHAR(255) DEFAULT NULL COMMENT 'Recognition/equivalence status for foreign degrees' AFTER `area_specialization`", 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Verify the columns were added
SELECT 'Migration complete: Added staff qualifications fields to employees table' AS status;

-- Show the final structure
DESCRIBE `employees`;

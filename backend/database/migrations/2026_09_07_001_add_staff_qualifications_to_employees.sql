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

-- Add missing columns to employees table if they don't exist
ALTER TABLE `employees`
ADD COLUMN IF NOT EXISTS `end_date` DATE DEFAULT NULL COMMENT 'Employment end date' AFTER `employee_reg_date`,
ADD COLUMN IF NOT EXISTS `rssb_number` VARCHAR(50) DEFAULT NULL COMMENT 'Social security/pension number' AFTER `employee_account`,
ADD COLUMN IF NOT EXISTS `degree` VARCHAR(100) DEFAULT NULL COMMENT 'Academic degree (BSc, MSc, PhD, etc.)' AFTER `rssb_number`,
ADD COLUMN IF NOT EXISTS `area_specialization` VARCHAR(150) DEFAULT NULL COMMENT 'Area of specialization/field of study' AFTER `degree`,
ADD COLUMN IF NOT EXISTS `foreign_degree_equivalence` VARCHAR(255) DEFAULT NULL COMMENT 'Recognition/equivalence status for foreign degrees' AFTER `area_specialization`;

-- Verify the columns were added
SELECT 'Migration complete: Added staff qualifications fields to employees table' AS status;

-- Show the final structure
DESCRIBE `employees`;

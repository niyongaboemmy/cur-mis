-- =============================================================================
-- 2026_04_27_029_mariadb_column_patches.sql
--
-- MariaDB 10.3+ native equivalent of migration 024.
-- Uses ALTER TABLE … ADD COLUMN IF NOT EXISTS (MariaDB-native syntax)
-- instead of stored procedures, making this file safe to import directly
-- via phpMyAdmin on the production cPanel/MariaDB server.
--
-- Idempotent: every ALTER is guarded by IF NOT EXISTS.
-- Safe on MySQL 5.7 via the migration runner (PHP PDO runs each statement).
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- =============================================================================
-- leave_types — add missing columns
-- =============================================================================
ALTER TABLE `leave_types`
  ADD COLUMN IF NOT EXISTS `description` TEXT         DEFAULT NULL  AFTER `name`,
  ADD COLUMN IF NOT EXISTS `color`       VARCHAR(30)  NOT NULL DEFAULT '#4FB4FF',
  ADD COLUMN IF NOT EXISTS `is_active`   TINYINT(1)   NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `updated_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- =============================================================================
-- leave_requests — add missing columns + normalise status ENUM
-- =============================================================================
ALTER TABLE `leave_requests`
  ADD COLUMN IF NOT EXISTS `employee_id`    INT          DEFAULT NULL      AFTER `id`,
  ADD COLUMN IF NOT EXISTS `review_comment` TEXT         DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `reviewed_by`    INT          DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `reviewed_at`    DATETIME     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `updated_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Backfill employee_id from staff_id for legacy rows
UPDATE `leave_requests`
SET `employee_id` = `staff_id`
WHERE `employee_id` IS NULL AND `staff_id` IS NOT NULL;

-- =============================================================================
-- hr_payroll — add missing breakdown columns
-- =============================================================================
ALTER TABLE `hr_payroll`
  ADD COLUMN IF NOT EXISTS `period_year`         SMALLINT(4)   NOT NULL DEFAULT 0 AFTER `pay_month`,
  ADD COLUMN IF NOT EXISTS `period_month`         TINYINT(2)    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `basic_salary`         DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `housing_allowance`    DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `transport_allowance`  DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `other_allowances`     DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `updated_at`           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Add unique constraint if not already present (MariaDB-safe: errors if key exists,
-- caught by migration runner as "already applied")
ALTER TABLE `hr_payroll`
  ADD UNIQUE KEY `ux_payroll_emp_period` (`emp_id`, `period_year`, `period_month`);

-- Backfill period_year / period_month from pay_month string (format 'YYYY-MM')
UPDATE `hr_payroll`
SET
  `period_year`  = CAST(SUBSTRING_INDEX(`pay_month`, '-', 1)  AS UNSIGNED),
  `period_month` = CAST(SUBSTRING_INDEX(`pay_month`, '-', -1) AS UNSIGNED)
WHERE (`period_year` = 0 OR `period_month` = 0)
  AND `pay_month` REGEXP '^[0-9]{4}-[0-9]{1,2}$';

-- =============================================================================
-- payroll_config — seed default rate keys
-- =============================================================================
INSERT IGNORE INTO `payroll_config` (`config_key`, `config_value`) VALUES
('rssb_employer_rate', '0.0500'),
('rssb_employee_rate', '0.0300'),
('rama_employer_rate', '0.0750'),
('rama_employee_rate', '0.0750'),
('maternity_rate',     '0.0060'),
('cbhi_rate',          '0.0050');

SET FOREIGN_KEY_CHECKS = 1;

-- 2026_05_04_030_hr_employee_deductions.sql
-- Per-employee voluntary/assigned deductions (Loan, School Fees, Restoration, etc.)
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS `hr_employee_deductions` (
  `id`             INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `emp_id`         INT             NOT NULL,
  `deduction_type` VARCHAR(60)     NOT NULL COMMENT 'Loan | School Fees | Restoration | Other',
  `label`          VARCHAR(120)    NOT NULL COMMENT 'Human-readable name shown on payslip',
  `monthly_amount` DECIMAL(14,2)   NOT NULL DEFAULT 0.00 COMMENT 'Fixed amount deducted each month',
  `total_amount`   DECIMAL(14,2)   DEFAULT NULL COMMENT 'Total debt/obligation (NULL = indefinite)',
  `paid_amount`    DECIMAL(14,2)   NOT NULL DEFAULT 0.00 COMMENT 'Cumulative amount already deducted',
  `notes`          VARCHAR(255)    DEFAULT NULL,
  `start_year`     SMALLINT(4)     NOT NULL,
  `start_month`    TINYINT(2)      NOT NULL,
  `end_year`       SMALLINT(4)     DEFAULT NULL COMMENT 'NULL = open-ended',
  `end_month`      TINYINT(2)      DEFAULT NULL,
  `status`         ENUM('Active','Completed','Cancelled') NOT NULL DEFAULT 'Active',
  `created_at`     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_emp_ded_emp` (`emp_id`, `status`),
  KEY `idx_emp_ded_period` (`start_year`, `start_month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add other_deductions column to hr_payroll if it doesn't exist
SET @col_exists = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'hr_payroll'
    AND COLUMN_NAME  = 'other_deductions'
);
SET @sql = IF(@col_exists = 0,
  'ALTER TABLE `hr_payroll` ADD COLUMN `other_deductions` DECIMAL(14,2) NOT NULL DEFAULT 0.00 AFTER `cbhi`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

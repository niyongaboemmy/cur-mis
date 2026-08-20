-- 2026_04_26_026_create_clearance_table.sql
-- Creates the student_clearances table for financial clearance tracking.
-- A student is "cleared" when their balance is within the permitted threshold
-- (default: 0 RWF) for a given academic year.

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `student_clearances` (
  `id`               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `student_id`       VARCHAR(20)   NOT NULL,   -- student.regnumber
  `academic_year_id` INT UNSIGNED  NOT NULL,
  `semester`         TINYINT UNSIGNED NULL DEFAULT NULL,  -- NULL = full year
  `status`           ENUM('cleared','not_cleared','conditional') NOT NULL DEFAULT 'not_cleared',
  `balance_at_clearance` DECIMAL(12,2) NULL DEFAULT NULL, -- snapshot of balance
  `notes`            TEXT          NULL DEFAULT NULL,     -- override reason
  `cleared_by`       INT UNSIGNED  NULL DEFAULT NULL,     -- staff user who granted
  `cleared_at`       DATETIME      NULL DEFAULT NULL,
  `auto_cleared`     TINYINT(1)    NOT NULL DEFAULT 0,    -- 1 if system auto-cleared
  `created_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_clearance_student_year_sem` (`student_id`, `academic_year_id`, `semester`),
  INDEX `idx_clr_year_status` (`academic_year_id`, `status`),
  CONSTRAINT `fk_clr_academic_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add clearance permission
SET @cat_finance = (SELECT id FROM permission_categories WHERE name = 'Finance & Accounts' LIMIT 1);
INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
  (@cat_finance, 'Manage Clearance', 'MANAGE_CLEARANCE', 'Grant or revoke financial clearance for students.');
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
  SELECT 1, id FROM `permissions` WHERE `slug` IN ('MANAGE_CLEARANCE', 'MANAGE_FINANCE');

SET FOREIGN_KEY_CHECKS = 1;

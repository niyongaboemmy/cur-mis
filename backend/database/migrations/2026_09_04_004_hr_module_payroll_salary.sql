-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: HR Module Redesign - Payroll & Salary Structure
-- Date: 2026-09-04
--
-- Creates comprehensive payroll and salary management tables to support:
-- - Salary structure configuration (basic, allowances, deductions)
-- - Employee salary assignments
-- - Payroll run management
-- - Deduction tracking (PAYE, RSSB, Maternity, etc.)
-- - Payment declarations
--
-- Idempotent — safe to re-run.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. Create salary component types table ───────────────────────────────────
CREATE TABLE IF NOT EXISTS `salary_component_types` (
  `id`                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`                  VARCHAR(100) NOT NULL UNIQUE,
  `code`                  VARCHAR(20) NOT NULL UNIQUE COMMENT "e.g., BASIC, HOUSING, TRANSPORT",
  `component_type`        ENUM("Earnings", "Deduction", "Statutory") NOT NULL DEFAULT "Earnings",
  `is_taxable`            TINYINT(1) DEFAULT 1,
  `is_mandatory`          TINYINT(1) DEFAULT 0,
  `formula`               VARCHAR(500) NULL COMMENT "Formula for calculation, e.g., BASIC * 0.15",
  `sort_order`            INT DEFAULT 0,
  `is_active`             TINYINT(1) DEFAULT 1,
  `created_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  KEY `idx_sct_active` (`is_active`),
  KEY `idx_sct_type` (`component_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Salary component types (Earnings, Deductions, Statutory)';

-- ── 2. Insert standard salary components ────────────────────────────────────
INSERT IGNORE INTO `salary_component_types` (`name`, `code`, `component_type`, `is_taxable`, `sort_order`) VALUES
  ('Basic Salary', 'BASIC', 'Earnings', 1, 10),
  ('Housing Allowance', 'HOUSING', 'Earnings', 1, 20),
  ('Transport Allowance', 'TRANSPORT', 'Earnings', 1, 30),
  ('Communication Allowance', 'COMM', 'Earnings', 1, 40),
  ('Other Allowance', 'OTHER_ALLOW', 'Earnings', 1, 50),
  ('Arrears & Adjustments', 'ARREARS', 'Earnings', 1, 60),
  ('PAYE (Income Tax)', 'PAYE', 'Deduction', 0, 70),
  ('RSSB 2%', 'RSSB_2', 'Statutory', 0, 80),
  ('Pension 6%', 'PENSION_6', 'Statutory', 0, 90),
  ('Maternity Leave 0.3%', 'MATERNITY', 'Statutory', 0, 100),
  ('CBHI 0.5% (Health Insurance)', 'CBHI', 'Statutory', 0, 110),
  ('Medical Insurance (Radiant)', 'MI_RADIANT', 'Deduction', 0, 120),
  ('Other Deductions', 'OTHER_DED', 'Deduction', 0, 130);

-- ── 3. Create salary structure table (per level/position) ────────────────────
CREATE TABLE IF NOT EXISTS `salary_structures` (
  `id`                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`                  VARCHAR(150) NOT NULL,
  `description`           TEXT NULL,
  `applicable_level`      VARCHAR(100) NULL COMMENT "e.g., Senior, Middle, Junior",
  `applicable_role_id`    INT UNSIGNED NULL,
  `applicable_department_id` INT UNSIGNED NULL,
  `effective_date`        DATE NOT NULL,
  `end_date`              DATE NULL COMMENT "NULL means currently active",
  `basic_salary_min`      DECIMAL(12,2) NULL,
  `basic_salary_max`      DECIMAL(12,2) NULL,
  `created_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  KEY `idx_ss_effective` (`effective_date`, `end_date`),
  KEY `idx_ss_level` (`applicable_level`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Salary structure definitions';

-- ── 4. Create salary structure components (mapping of component % to structure) ──
CREATE TABLE IF NOT EXISTS `salary_structure_components` (
  `id`                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `salary_structure_id`   INT UNSIGNED NOT NULL,
  `component_type_id`     INT UNSIGNED NOT NULL,
  `percentage`            DECIMAL(5,2) NULL COMMENT "Percentage of basic salary",
  `fixed_amount`          DECIMAL(12,2) NULL COMMENT "Fixed amount instead of percentage",
  `is_percentage`         TINYINT(1) DEFAULT 1,
  `sort_order`            INT DEFAULT 0,
  `created_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ss_component` (`salary_structure_id`, `component_type_id`),
  CONSTRAINT `fk_ssc_structure` FOREIGN KEY (`salary_structure_id`) REFERENCES `salary_structures`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ssc_component` FOREIGN KEY (`component_type_id`) REFERENCES `salary_component_types`(`id`) ON DELETE RESTRICT,
  KEY `idx_ssc_structure` (`salary_structure_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Components within each salary structure';

-- ── 5. Create employee salary assignments ───────────────────────────────────
CREATE TABLE IF NOT EXISTS `employee_salary_assignments` (
  `id`                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`               INT UNSIGNED NOT NULL,
  `salary_structure_id`   INT UNSIGNED NOT NULL,
  `basic_salary`          DECIMAL(12,2) NOT NULL,
  `effective_date`        DATE NOT NULL,
  `end_date`              DATE NULL COMMENT "NULL means currently active",
  `approved_by`           INT UNSIGNED NULL,
  `approved_at`           TIMESTAMP NULL,
  `created_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  CONSTRAINT `fk_esa_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_esa_structure` FOREIGN KEY (`salary_structure_id`) REFERENCES `salary_structures`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_esa_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  KEY `idx_esa_user` (`user_id`),
  KEY `idx_esa_effective` (`effective_date`, `end_date`),
  KEY `idx_esa_active` (`user_id`, `end_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Assignment of salary structure to employees';

-- ── 6. Create payroll runs (monthly payroll processing) ──────────────────────
CREATE TABLE IF NOT EXISTS `payroll_runs` (
  `id`                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `payroll_period`        DATE NOT NULL COMMENT "First day of the pay period",
  `payroll_month`         VARCHAR(7) NOT NULL COMMENT "YYYY-MM format",
  `start_date`            DATE NOT NULL,
  `end_date`              DATE NOT NULL,
  `status`                ENUM("Draft", "Processing", "Approved", "Paid", "Cancelled") DEFAULT "Draft",
  `total_employees`       INT UNSIGNED DEFAULT 0,
  `total_gross_salary`    DECIMAL(15,2) DEFAULT 0,
  `total_deductions`      DECIMAL(15,2) DEFAULT 0,
  `total_net_pay`         DECIMAL(15,2) DEFAULT 0,
  `created_by`            INT UNSIGNED NULL,
  `approved_by`           INT UNSIGNED NULL,
  `approved_at`           TIMESTAMP NULL,
  `paid_at`               TIMESTAMP NULL,
  `created_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pr_period` (`payroll_period`),
  CONSTRAINT `fk_pr_created_by` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pr_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  KEY `idx_pr_status` (`status`),
  KEY `idx_pr_month` (`payroll_month`),
  KEY `idx_pr_period` (`payroll_period`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Monthly payroll run records';

-- ── 7. Create employee payroll details (per payroll run) ──────────────────────
CREATE TABLE IF NOT EXISTS `payroll_details` (
  `id`                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `payroll_run_id`        INT UNSIGNED NOT NULL,
  `user_id`               INT UNSIGNED NOT NULL,
  `basic_salary`          DECIMAL(12,2) NOT NULL,
  `gross_salary`          DECIMAL(12,2) NOT NULL,
  `total_deductions`      DECIMAL(12,2) NOT NULL DEFAULT 0,
  `net_salary`            DECIMAL(12,2) NOT NULL,
  `payment_date`          DATE NULL,
  `payment_reference`     VARCHAR(100) NULL COMMENT "Bank reference or payment ID",
  `payment_method`        ENUM("Bank Transfer", "Cash", "Mobile Money") NULL,
  `payment_status`        ENUM("Pending", "Paid", "Failed") DEFAULT "Pending",
  `notes`                 TEXT NULL,
  `created_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pd_run_user` (`payroll_run_id`, `user_id`),
  CONSTRAINT `fk_pd_run` FOREIGN KEY (`payroll_run_id`) REFERENCES `payroll_runs`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pd_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT,
  KEY `idx_pd_status` (`payment_status`),
  KEY `idx_pd_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Individual employee payroll details for each run';

-- ── 8. Create payroll line items (earnings + deductions) ────────────────────
CREATE TABLE IF NOT EXISTS `payroll_line_items` (
  `id`                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `payroll_detail_id`     INT UNSIGNED NOT NULL,
  `component_type_id`     INT UNSIGNED NOT NULL,
  `component_name`        VARCHAR(100) NOT NULL,
  `component_code`        VARCHAR(20) NOT NULL,
  `amount`                DECIMAL(12,2) NOT NULL,
  `is_earning`            TINYINT(1) DEFAULT 1,
  `is_deduction`          TINYINT(1) DEFAULT 0,
  `created_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  CONSTRAINT `fk_pli_detail` FOREIGN KEY (`payroll_detail_id`) REFERENCES `payroll_details`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pli_component` FOREIGN KEY (`component_type_id`) REFERENCES `salary_component_types`(`id`) ON DELETE RESTRICT,
  KEY `idx_pli_detail` (`payroll_detail_id`),
  KEY `idx_pli_component` (`component_type_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Individual line items within a payroll (earnings/deductions)';

-- ── 9. Create payment declarations table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS `payment_declarations` (
  `id`                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `payroll_run_id`        INT UNSIGNED NOT NULL,
  `bank_id`               INT UNSIGNED NULL,
  `currency`              VARCHAR(3) DEFAULT "RWF",
  `total_amount`          DECIMAL(15,2) NOT NULL,
  `employee_count`        INT UNSIGNED NOT NULL,
  `file_path`             VARCHAR(500) NULL COMMENT "Path to exported payment file",
  `generated_at`          TIMESTAMP NULL,
  `submitted_to_bank_at`  TIMESTAMP NULL,
  `status`                ENUM("Draft", "Generated", "Submitted", "Processed") DEFAULT "Draft",
  `notes`                 TEXT NULL,
  `created_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  CONSTRAINT `fk_pd_payroll` FOREIGN KEY (`payroll_run_id`) REFERENCES `payroll_runs`(`id`) ON DELETE CASCADE,
  KEY `idx_pd_status` (`status`),
  KEY `idx_pd_payroll` (`payroll_run_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Payment declarations sent to banks';

-- ── 10. Create view for payroll summary (Excel export) ──────────────────────
DROP VIEW IF EXISTS `v_payroll_summary`;
CREATE VIEW `v_payroll_summary` AS
SELECT
  pd.`id` AS row_id,
  u.`id` AS employee_id,
  u.`username` AS staff_id,
  u.`full_name` AS name,
  pd.`basic_salary`,
  (SELECT SUM(`amount`) FROM `payroll_line_items` WHERE `payroll_detail_id` = pd.`id` AND `is_earning` = 1) AS gross_salary,
  (SELECT SUM(`amount`) FROM `payroll_line_items` WHERE `payroll_detail_id` = pd.`id` AND component_code = 'PAYE') AS paye,
  (SELECT SUM(`amount`) FROM `payroll_line_items` WHERE `payroll_detail_id` = pd.`id` AND component_code IN ('RSSB_2', 'PENSION_6', 'MATERNITY')) AS statutory_deductions,
  (SELECT SUM(`amount`) FROM `payroll_line_items` WHERE `payroll_detail_id` = pd.`id` AND `is_deduction` = 1) AS total_deductions,
  pd.`net_salary`,
  pd.`payment_status`,
  efi.`bank_name` AS bank,
  efi.`bank_account_number` AS account_number
FROM `payroll_details` pd
JOIN `users` u ON u.`id` = pd.`user_id`
LEFT JOIN `employee_financial_info` efi ON efi.`user_id` = u.`id`
ORDER BY u.`full_name`;

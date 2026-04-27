-- 2026_04_27_021_create_payroll_tables.sql
-- Creates hr_payroll, payroll_config, and hr_custom_deductions tables.

-- 1. HR Payroll Table
CREATE TABLE IF NOT EXISTS `hr_payroll` (
    `id`                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `emp_id`              INT(11) NOT NULL,
    `pay_month`           VARCHAR(50) DEFAULT NULL,
    `period_year`         SMALLINT(4) NOT NULL,
    `period_month`        TINYINT(2) NOT NULL COMMENT '1 = January … 12 = December',
    `basic_salary`        DECIMAL(15,2) NOT NULL DEFAULT 0,
    `housing_allowance`   DECIMAL(15,2) NOT NULL DEFAULT 0,
    `transport_allowance` DECIMAL(15,2) NOT NULL DEFAULT 0,
    `other_allowances`    DECIMAL(15,2) NOT NULL DEFAULT 0,
    `gross`               DECIMAL(15,2) NOT NULL DEFAULT 0,
    `pension`             DECIMAL(15,2) NOT NULL DEFAULT 0,
    `rama`                DECIMAL(15,2) NOT NULL DEFAULT 0,
    `maternity`           DECIMAL(15,2) NOT NULL DEFAULT 0,
    `cbhi`                DECIMAL(15,2) NOT NULL DEFAULT 0,
    `tax`                 DECIMAL(15,2) NOT NULL DEFAULT 0,
    `net`                 DECIMAL(15,2) NOT NULL DEFAULT 0,
    `status`              ENUM('Pending', 'Paid', 'Approved') NOT NULL DEFAULT 'Pending',
    `created_at`          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at`          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `ux_payroll_emp_period` (`emp_id`, `period_year`, `period_month`),
    KEY `idx_payroll_period` (`period_year`, `period_month`),
    CONSTRAINT `fk_payroll_employee` FOREIGN KEY (`emp_id`) REFERENCES `employees` (`employee_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Payroll Config Table (Ensure it has description)
CREATE TABLE IF NOT EXISTS `payroll_config` (
    `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `config_key`   VARCHAR(100) NOT NULL,
    `config_value` DECIMAL(15,4) NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `ux_config_key` (`config_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Custom Deductions Table
CREATE TABLE IF NOT EXISTS `hr_custom_deductions` (
    `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `label`         VARCHAR(100) NOT NULL,
    `description`   VARCHAR(255) DEFAULT NULL,
    `employee_rate` DECIMAL(6,3) NOT NULL DEFAULT 0,
    `employer_rate` DECIMAL(6,3) NOT NULL DEFAULT 0,
    `is_active`     TINYINT(1) NOT NULL DEFAULT 1,
    `sort_order`    INT NOT NULL DEFAULT 0,
    `created_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Seed default payroll config (ignore errors if exists)
INSERT IGNORE INTO `payroll_config` (`config_key`, `config_value`) VALUES
('rssb_employer_rate', 0.05),
('rssb_employee_rate', 0.03),
('rama_employer_rate', 0.075),
('rama_employee_rate', 0.075),
('maternity_rate',     0.006),
('cbhi_rate',          0.005);

-- 5. Ensure employees table has necessary columns for HR module
-- (Using multiple ALTERs to be safer in case some exist)
ALTER TABLE `employees` ADD COLUMN IF NOT EXISTS `salary` DECIMAL(15,2) NOT NULL DEFAULT 0;
ALTER TABLE `employees` ADD COLUMN IF NOT EXISTS `employee_reg_date` DATE DEFAULT NULL;
ALTER TABLE `employees` ADD COLUMN IF NOT EXISTS `account_status` ENUM('Active', 'Inactive') DEFAULT 'Active';

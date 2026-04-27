-- 2026_04_25_020_create_hr_payroll.sql
-- Monthly payroll / payslip entries per employee.
-- One row per (employee × month). Safe to re-run.

CREATE TABLE IF NOT EXISTS `hr_payroll` (
  `id`                  INT(11)        NOT NULL AUTO_INCREMENT,
  `emp_id`              INT(11)        NOT NULL,
  `period_year`         SMALLINT(4)    NOT NULL,
  `period_month`        TINYINT(2)     NOT NULL  COMMENT '1 = January … 12 = December',
  `basic_salary`        DECIMAL(14,2)  NOT NULL DEFAULT 0.00,
  `housing_allowance`   DECIMAL(14,2)  NOT NULL DEFAULT 0.00,
  `transport_allowance` DECIMAL(14,2)  NOT NULL DEFAULT 0.00,
  `other_allowances`    DECIMAL(14,2)  NOT NULL DEFAULT 0.00,
  `gross_salary`        DECIMAL(14,2)  NOT NULL DEFAULT 0.00,
  `paye`                DECIMAL(14,2)  NOT NULL DEFAULT 0.00,
  `rssb`                DECIMAL(14,2)  NOT NULL DEFAULT 0.00,
  `cbhi`                DECIMAL(14,2)  NOT NULL DEFAULT 0.00,
  `net_salary`          DECIMAL(14,2)  NOT NULL DEFAULT 0.00,
  `notes`               TEXT               DEFAULT NULL,
  `created_at`          TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payroll_emp_period` (`emp_id`, `period_year`, `period_month`),
  KEY `idx_payroll_period` (`period_year`, `period_month`),
  CONSTRAINT `fk_hr_payroll_emp`
    FOREIGN KEY (`emp_id`) REFERENCES `hr_employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

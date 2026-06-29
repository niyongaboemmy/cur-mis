-- 2026_06_16_085_create_finance_clearances_table.sql
-- Creates finance_clearances table for financial clearance tracking.
-- The existing student_clearances table serves a different multi-office
-- workflow; this table is dedicated to fee/balance-based financial clearance.

CREATE TABLE IF NOT EXISTS `finance_clearances` (
  `id`                   INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  `student_id`           VARCHAR(20)    NOT NULL,
  `academic_year_id`     INT UNSIGNED   NOT NULL,
  `semester`             TINYINT UNSIGNED NULL DEFAULT NULL,
  `status`               ENUM('cleared','not_cleared','conditional') NOT NULL DEFAULT 'not_cleared',
  `balance_at_clearance` DECIMAL(12,2)  NULL DEFAULT NULL,
  `notes`                TEXT           NULL DEFAULT NULL,
  `cleared_by`           INT UNSIGNED   NULL DEFAULT NULL,
  `cleared_at`           DATETIME       NULL DEFAULT NULL,
  `auto_cleared`         TINYINT(1)     NOT NULL DEFAULT 0,
  `created_at`           DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fin_clr_student_year_sem` (`student_id`, `academic_year_id`, `semester`),
  INDEX `idx_fin_clr_year_status` (`academic_year_id`, `status`),
  CONSTRAINT `fk_fin_clr_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`),
  CONSTRAINT `fk_fin_clr_user` FOREIGN KEY (`cleared_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

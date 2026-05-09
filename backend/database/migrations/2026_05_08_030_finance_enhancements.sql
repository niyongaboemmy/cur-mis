-- =============================================================================
-- Migration 030: Finance Module Enhancements (PDO-compatible, no DELIMITER)
-- Date: 2026-05-08
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- 1. student_fee_overrides
CREATE TABLE IF NOT EXISTS `student_fee_overrides` (
  `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`       VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `academic_year_id` INT UNSIGNED NOT NULL,
  `fee_type`         ENUM('TUITION','REGISTRATION','ADMISSION','HOSTEL','ACADEMIC_DOCUMENT','FINE','REPEAT_MODULE') NOT NULL,
  `amount`           DECIMAL(12,2) NOT NULL,
  `reason`           VARCHAR(255) NOT NULL DEFAULT '',
  `created_by`       INT UNSIGNED NOT NULL,
  `created_at`       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_override_student_year_type` (`student_id`, `academic_year_id`, `fee_type`),
  INDEX `idx_sfo_student_year` (`student_id`, `academic_year_id`),
  CONSTRAINT `fk_sfo_academic_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. sponsors
DROP TABLE IF EXISTS `sponsors`;
CREATE TABLE IF NOT EXISTS `sponsors` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`       VARCHAR(150) NOT NULL,
  `email`      VARCHAR(150) NULL DEFAULT NULL,
  `phone`      VARCHAR(30) NULL DEFAULT NULL,
  `is_active`  TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Add columns to fee_bursaries and modules
-- Runner skips 'Duplicate column name' errors automatically
ALTER TABLE `fee_bursaries` ADD COLUMN `sponsor_id` INT UNSIGNED NULL DEFAULT NULL AFTER `notes`;
ALTER TABLE `modules` ADD COLUMN `fee_structure_id` INT UNSIGNED NULL DEFAULT NULL;

-- Drop old FK constraints (runner skips 'check that column/key exists' errors)
ALTER TABLE `fee_bursaries` DROP FOREIGN KEY `fk_fb_sponsor`;
ALTER TABLE `modules` DROP FOREIGN KEY `fk_mod_fee_structure`;

-- Add new FK constraints (runner skips 'Duplicate key' errors)
ALTER TABLE `fee_bursaries` ADD CONSTRAINT `fk_fb_spns_v30` FOREIGN KEY (`sponsor_id`) REFERENCES `sponsors` (`id`) ON DELETE SET NULL;
ALTER TABLE `modules` ADD CONSTRAINT `fk_mod_fs_v30` FOREIGN KEY (`fee_structure_id`) REFERENCES `fee_structures` (`id`) ON DELETE SET NULL;

-- 4. fee_refunds
DROP TABLE IF EXISTS `fee_refunds`;
CREATE TABLE `fee_refunds` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`   VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `payment_id`   INT UNSIGNED NULL DEFAULT NULL,
  `amount`       DECIMAL(12,2) NOT NULL,
  `category`     ENUM('REFUND','CAUTION','OVERPAYMENT') NOT NULL DEFAULT 'REFUND',
  `reason`       TEXT NOT NULL,
  `status`       ENUM('pending','processed','rejected') NOT NULL DEFAULT 'pending',
  `processed_by` INT UNSIGNED NULL DEFAULT NULL,
  `notes`        TEXT NULL DEFAULT NULL,
  `created_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_fr_student` (`student_id`),
  INDEX `idx_fr_payment` (`payment_id`),
  INDEX `idx_fr_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. fee_structure_departments
DROP TABLE IF EXISTS `fee_structure_departments`;
CREATE TABLE `fee_structure_departments` (
  `id`               INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `fee_structure_id` INT(10) UNSIGNED NOT NULL,
  `department_id`    INT(10) UNSIGNED NOT NULL,
  `created_at`       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fsd_pair` (`fee_structure_id`, `department_id`),
  INDEX `idx_fsd_dept` (`department_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 6. fee_structure_departments FK (runner skips 'Duplicate key' errors)
ALTER TABLE `fee_structure_departments` ADD CONSTRAINT `fk_fs_dept_struct_new` FOREIGN KEY (`fee_structure_id`) REFERENCES `fee_structures` (`id`) ON DELETE CASCADE;

-- 7. Backfill fee_structure_departments from fee_structures.department_id
INSERT IGNORE INTO `fee_structure_departments` (`fee_structure_id`, `department_id`)
SELECT `id`, `department_id` FROM `fee_structures` WHERE `department_id` IS NOT NULL;

-- 8. fee_invoices ENUM update
SET @old_sql_mode = @@sql_mode;
SET sql_mode = '';

ALTER TABLE `fee_invoices`
  MODIFY COLUMN `fee_type` ENUM(
    'TUITION','REGISTRATION','ADMISSION','HOSTEL',
    'ACADEMIC_DOCUMENT','FINE','REPEAT_MODULE',
    'ARREARS','BURSARY_CREDIT','MODULE_FEE'
  ) NOT NULL;

SET sql_mode = @old_sql_mode;
SET FOREIGN_KEY_CHECKS = 1;

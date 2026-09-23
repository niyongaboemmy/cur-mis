-- ==================================================================================
-- Migration: HR Module Redesign - Enhanced Employee Master Data
-- Date: 2026-09-04
--
-- Enhances the users table with comprehensive HR fields
-- Idempotent - safe to re-run
-- ==================================================================================

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- Add gender column
SET @has_gender = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'gender'
);
SET @sql = IF(@has_gender = 0,
  'ALTER TABLE `users` ADD COLUMN `gender` ENUM("Male", "Female", "Other", "Prefer not to say") NULL AFTER `full_name`',
  'SELECT "column exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add degree column
SET @has_degree = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'degree'
);
SET @sql = IF(@has_degree = 0,
  'ALTER TABLE `users` ADD COLUMN `degree` VARCHAR(255) NULL AFTER `gender`',
  'SELECT "column exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add area_of_specialization column
SET @has_spec = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'area_of_specialization'
);
SET @sql = IF(@has_spec = 0,
  'ALTER TABLE `users` ADD COLUMN `area_of_specialization` VARCHAR(255) NULL AFTER `degree`',
  'SELECT "column exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add foreign_degree_equivalence column
SET @has_equiv = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'foreign_degree_equivalence'
);
SET @sql = IF(@has_equiv = 0,
  'ALTER TABLE `users` ADD COLUMN `foreign_degree_equivalence` VARCHAR(500) NULL AFTER `area_of_specialization`',
  'SELECT "column exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add rssb_number column
SET @has_rssb = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'rssb_number'
);
SET @sql = IF(@has_rssb = 0,
  'ALTER TABLE `users` ADD COLUMN `rssb_number` VARCHAR(50) NULL UNIQUE AFTER `foreign_degree_equivalence`',
  'SELECT "column exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add bank_account_number column
SET @has_bank_acct = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'bank_account_number'
);
SET @sql = IF(@has_bank_acct = 0,
  'ALTER TABLE `users` ADD COLUMN `bank_account_number` VARCHAR(50) NULL AFTER `rssb_number`',
  'SELECT "column exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add bank_name column
SET @has_bank = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'bank_name'
);
SET @sql = IF(@has_bank = 0,
  'ALTER TABLE `users` ADD COLUMN `bank_name` VARCHAR(100) NULL AFTER `bank_account_number`',
  'SELECT "column exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add phone_number column
SET @has_phone_num = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'phone_number'
);
SET @sql = IF(@has_phone_num = 0,
  'ALTER TABLE `users` ADD COLUMN `phone_number` VARCHAR(20) NULL AFTER `phone`',
  'SELECT "column exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add employment_date column
SET @has_emp_date = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'employment_date'
);
SET @sql = IF(@has_emp_date = 0,
  'ALTER TABLE `users` ADD COLUMN `employment_date` DATE NULL AFTER `updated_at`',
  'SELECT "column exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add supervisor_id column
SET @has_supervisor = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'supervisor_id'
);
SET @sql = IF(@has_supervisor = 0,
  'ALTER TABLE `users` ADD COLUMN `supervisor_id` INT(10) UNSIGNED NULL AFTER `employment_date`',
  'SELECT "column exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add supervisor foreign key constraint
SET @has_fk = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND CONSTRAINT_NAME = 'fk_users_supervisor'
);
SET @sql = IF(@has_fk = 0,
  'ALTER TABLE `users` ADD CONSTRAINT `fk_users_supervisor` FOREIGN KEY (`supervisor_id`) REFERENCES `users`(`id`) ON DELETE SET NULL',
  'SELECT "constraint exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Create employee_profiles table
CREATE TABLE IF NOT EXISTS `employee_profiles` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL UNIQUE,
  `date_of_birth` DATE NULL,
  `nationality` VARCHAR(100) NULL,
  `marital_status` ENUM("Single", "Married", "Divorced", "Widowed") NULL,
  `emergency_contact_name` VARCHAR(150) NULL,
  `emergency_contact_phone` VARCHAR(20) NULL,
  `emergency_contact_relation` VARCHAR(50) NULL,
  `tax_identification_number` VARCHAR(50) NULL UNIQUE,
  `medical_conditions` TEXT NULL,
  `employee_photo_id` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_ep_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  KEY `idx_ep_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create employee_qualifications table
CREATE TABLE IF NOT EXISTS `employee_qualifications` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `qualification_type` VARCHAR(100) NOT NULL,
  `field_of_study` VARCHAR(255) NOT NULL,
  `institution_name` VARCHAR(255) NOT NULL,
  `country_of_study` VARCHAR(100) NULL,
  `year_obtained` INT NOT NULL,
  `is_primary` TINYINT(1) DEFAULT 0,
  `equivalence_status` ENUM("Not Applicable", "Pending", "Approved", "Rejected") DEFAULT "Not Applicable",
  `equivalence_approved_by` INT UNSIGNED NULL,
  `equivalence_approved_at` TIMESTAMP NULL,
  `certificate_file_id` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_eq_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_eq_approved_by` FOREIGN KEY (`equivalence_approved_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  KEY `idx_eq_user` (`user_id`),
  KEY `idx_eq_primary` (`user_id`, `is_primary`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create employee_financial_info table
CREATE TABLE IF NOT EXISTS `employee_financial_info` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL UNIQUE,
  `rssb_number` VARCHAR(50) NULL UNIQUE,
  `tax_number` VARCHAR(50) NULL UNIQUE,
  `bank_name` VARCHAR(100) NULL,
  `bank_account_number` VARCHAR(50) NULL UNIQUE,
  `bank_account_holder` VARCHAR(150) NULL,
  `iban_or_swift` VARCHAR(50) NULL,
  `salary_payment_method` ENUM("Bank Transfer", "Cash", "Mobile Money") DEFAULT "Bank Transfer",
  `cbhi_number` VARCHAR(50) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_efi_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  KEY `idx_efi_user` (`user_id`),
  KEY `idx_efi_rssb` (`rssb_number`),
  KEY `idx_efi_bank` (`bank_account_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create employee_identifiers table
CREATE TABLE IF NOT EXISTS `employee_identifiers` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `identifier_type` VARCHAR(50) NOT NULL,
  `identifier_value` VARCHAR(100) NOT NULL UNIQUE,
  `country_of_issue` VARCHAR(100) NULL,
  `issued_date` DATE NULL,
  `expiry_date` DATE NULL,
  `is_verified` TINYINT(1) DEFAULT 0,
  `document_file_id` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_ei_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  KEY `idx_ei_user` (`user_id`),
  KEY `idx_ei_type_value` (`identifier_type`, `identifier_value`),
  KEY `idx_ei_expiry` (`expiry_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create indexes on users table
SET @has_emp_idx = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_users_employment_date'
);
SET @sql = IF(@has_emp_idx = 0,
  'ALTER TABLE `users` ADD INDEX `idx_users_employment_date` (`employment_date`)',
  'SELECT "index exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_sup_idx = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_users_supervisor'
);
SET @sql = IF(@has_sup_idx = 0,
  'ALTER TABLE `users` ADD INDEX `idx_users_supervisor` (`supervisor_id`)',
  'SELECT "index exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Create view for employee master list
DROP VIEW IF EXISTS `v_employee_master_list`;
CREATE VIEW `v_employee_master_list` AS
SELECT
  u.`id` AS employee_id,
  u.`username` AS staff_id,
  u.`full_name` AS name,
  u.`gender`,
  u.`degree`,
  u.`area_of_specialization`,
  u.`email`,
  u.`phone_number`,
  u.`rssb_number`,
  efi.`bank_account_number`,
  u.`foreign_degree_equivalence`,
  u.`employment_date`,
  ep.`date_of_birth`,
  ep.`nationality`,
  ep.`emergency_contact_name`,
  u.`supervisor_id`
FROM `users` u
LEFT JOIN `employee_profiles` ep ON ep.`user_id` = u.`id`
LEFT JOIN `employee_financial_info` efi ON efi.`user_id` = u.`id`
WHERE u.`is_active` = 1
ORDER BY u.`full_name`;

SET FOREIGN_KEY_CHECKS = 1;

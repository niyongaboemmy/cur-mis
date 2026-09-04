-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: HR Module Redesign - Enhanced Employee Master Data
-- Date: 2026-09-04
--
-- Enhances the employees/users table with comprehensive HR fields to support:
-- - Complete employee master data (name, gender, education, specialization)
-- - Contact and identification information
-- - Financial details (RSSB, bank account)
-- - Department/Faculty assignment
-- - Employment tracking
--
-- Idempotent — safe to re-run.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. Enhance users table with HR-specific fields ────────────────────────────

-- Add gender if not exists
SET @has_gender = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'gender'
);
SET @sql = IF(@has_gender = 0,
  'ALTER TABLE `users` ADD COLUMN `gender` ENUM("Male", "Female", "Other", "Prefer not to say") NULL AFTER `full_name`',
  'SELECT "users.gender already exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add educational qualification
SET @has_degree = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'degree'
);
SET @sql = IF(@has_degree = 0,
  'ALTER TABLE `users` ADD COLUMN `degree` VARCHAR(255) NULL COMMENT "Educational degree (e.g., Bachelor, Master, PhD)" AFTER `gender`',
  'SELECT "users.degree already exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add area of specialization
SET @has_specialization = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'area_of_specialization'
);
SET @sql = IF(@has_specialization = 0,
  'ALTER TABLE `users` ADD COLUMN `area_of_specialization` VARCHAR(255) NULL AFTER `degree`',
  'SELECT "users.area_of_specialization already exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add study equivalence for foreign degrees
SET @has_equivalence = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'foreign_degree_equivalence'
);
SET @sql = IF(@has_equivalence = 0,
  'ALTER TABLE `users` ADD COLUMN `foreign_degree_equivalence` VARCHAR(500) NULL COMMENT "Equivalence for degrees studied abroad" AFTER `area_of_specialization`',
  'SELECT "users.foreign_degree_equivalence already exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add RSSB number (social security)
SET @has_rssb = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'rssb_number'
);
SET @sql = IF(@has_rssb = 0,
  'ALTER TABLE `users` ADD COLUMN `rssb_number` VARCHAR(50) NULL UNIQUE COMMENT "Rwanda Social Security Board identification number" AFTER `foreign_degree_equivalence`',
  'SELECT "users.rssb_number already exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add bank account number
SET @has_account = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'bank_account_number'
);
SET @sql = IF(@has_account = 0,
  'ALTER TABLE `users` ADD COLUMN `bank_account_number` VARCHAR(50) NULL AFTER `rssb_number`',
  'SELECT "users.bank_account_number already exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add bank name
SET @has_bank = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'bank_name'
);
SET @sql = IF(@has_bank = 0,
  'ALTER TABLE `users` ADD COLUMN `bank_name` VARCHAR(100) NULL AFTER `bank_account_number`',
  'SELECT "users.bank_name already exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add phone number (if not exists)
SET @has_phone = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'phone_number'
);
SET @sql = IF(@has_phone = 0,
  'ALTER TABLE `users` ADD COLUMN `phone_number` VARCHAR(20) NULL AFTER `email`',
  'SELECT "users.phone_number already exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add employment date
SET @has_emp_date = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'employment_date'
);
SET @sql = IF(@has_emp_date = 0,
  'ALTER TABLE `users` ADD COLUMN `employment_date` DATE NULL COMMENT "Date when employee started at CUR" AFTER `created_at`',
  'SELECT "users.employment_date already exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 2. Create employee profiles table for additional details ──────────────────
CREATE TABLE IF NOT EXISTS `employee_profiles` (
  `id`                         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`                    INT UNSIGNED NOT NULL UNIQUE,
  `gender`                     ENUM("Male", "Female", "Other", "Prefer not to say") NULL,
  `date_of_birth`              DATE NULL,
  `nationality`                VARCHAR(100) NULL,
  `marital_status`             ENUM("Single", "Married", "Divorced", "Widowed") NULL,
  `emergency_contact_name`     VARCHAR(150) NULL,
  `emergency_contact_phone`    VARCHAR(20) NULL,
  `emergency_contact_relation` VARCHAR(50) NULL,
  `tax_identification_number`  VARCHAR(50) NULL UNIQUE,
  `medical_conditions`         TEXT NULL COMMENT "Relevant medical conditions for HR tracking",
  `employee_photo_id`          VARCHAR(255) NULL,
  `created_at`                 TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`                 TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  CONSTRAINT `fk_ep_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  KEY `idx_ep_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Detailed employee profile information';

-- ── 3. Create employee qualifications table ─────────────────────────────────
CREATE TABLE IF NOT EXISTS `employee_qualifications` (
  `id`                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`               INT UNSIGNED NOT NULL,
  `qualification_type`    VARCHAR(100) NOT NULL COMMENT "e.g., Bachelor, Master, PhD, Diploma",
  `field_of_study`        VARCHAR(255) NOT NULL,
  `institution_name`      VARCHAR(255) NOT NULL,
  `country_of_study`      VARCHAR(100) NULL,
  `year_obtained`         INT NOT NULL,
  `is_primary`            TINYINT(1) DEFAULT 0 COMMENT "Primary qualification for current role",
  `equivalence_status`    ENUM("Not Applicable", "Pending", "Approved", "Rejected") DEFAULT "Not Applicable",
  `equivalence_approved_by` INT UNSIGNED NULL,
  `equivalence_approved_at` TIMESTAMP NULL,
  `certificate_file_id`   VARCHAR(255) NULL,
  `created_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  CONSTRAINT `fk_eq_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_eq_approved_by` FOREIGN KEY (`equivalence_approved_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  KEY `idx_eq_user` (`user_id`),
  KEY `idx_eq_primary` (`user_id`, `is_primary`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Employee educational qualifications and credentials';

-- ── 4. Create employee financial information table ───────────────────────────
CREATE TABLE IF NOT EXISTS `employee_financial_info` (
  `id`                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`               INT UNSIGNED NOT NULL UNIQUE,
  `rssb_number`           VARCHAR(50) NULL UNIQUE COMMENT "Rwanda Social Security Board number",
  `tax_number`            VARCHAR(50) NULL UNIQUE COMMENT "Tax identification number",
  `bank_name`             VARCHAR(100) NULL,
  `bank_account_number`   VARCHAR(50) NULL UNIQUE,
  `bank_account_holder`   VARCHAR(150) NULL,
  `iban_or_swift`         VARCHAR(50) NULL,
  `salary_payment_method` ENUM("Bank Transfer", "Cash", "Mobile Money") DEFAULT "Bank Transfer",
  `cbhi_number`           VARCHAR(50) NULL COMMENT "Community Health Insurance number",
  `created_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  CONSTRAINT `fk_efi_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  KEY `idx_efi_user` (`user_id`),
  KEY `idx_efi_rssb` (`rssb_number`),
  KEY `idx_efi_bank` (`bank_account_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Employee financial and payment information';

-- ── 5. Create employee identifiers table (for RSSB, tax, etc.) ──────────────
CREATE TABLE IF NOT EXISTS `employee_identifiers` (
  `id`                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`               INT UNSIGNED NOT NULL,
  `identifier_type`       VARCHAR(50) NOT NULL COMMENT "e.g., RSSB, NID, PASSPORT, TAX_NUMBER",
  `identifier_value`      VARCHAR(100) NOT NULL UNIQUE,
  `country_of_issue`      VARCHAR(100) NULL,
  `issued_date`           DATE NULL,
  `expiry_date`           DATE NULL,
  `is_verified`           TINYINT(1) DEFAULT 0,
  `document_file_id`      VARCHAR(255) NULL,
  `created_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  CONSTRAINT `fk_ei_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  KEY `idx_ei_user` (`user_id`),
  KEY `idx_ei_type_value` (`identifier_type`, `identifier_value`),
  KEY `idx_ei_expiry` (`expiry_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Employee identification documents tracking';

-- ── 6. Create indexes for common HR queries ──────────────────────────────────
SET @has_dept_idx = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_users_department'
);
SET @sql = IF(@has_dept_idx = 0,
  'ALTER TABLE `users` ADD INDEX `idx_users_department` (`department_id`)',
  'SELECT "idx_users_department already exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_faculty_idx = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_users_faculty'
);
SET @sql = IF(@has_faculty_idx = 0,
  'ALTER TABLE `users` ADD INDEX `idx_users_faculty` (`faculty_id`)',
  'SELECT "idx_users_faculty already exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_rssb_idx = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_users_rssb'
);
SET @sql = IF(@has_rssb_idx = 0,
  'ALTER TABLE `users` ADD INDEX `idx_users_rssb` (`rssb_number`)',
  'SELECT "idx_users_rssb already exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_emp_date_idx = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_users_employment_date'
);
SET @sql = IF(@has_emp_date_idx = 0,
  'ALTER TABLE `users` ADD INDEX `idx_users_employment_date` (`employment_date`)',
  'SELECT "idx_users_employment_date already exists"'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 7. Create view for employee master list (Excel export) ──────────────────
DROP VIEW IF EXISTS `v_employee_master_list`;
CREATE VIEW `v_employee_master_list` AS
SELECT
  u.`id` AS employee_id,
  u.`username` AS staff_id,
  u.`full_name` AS name,
  u.`gender`,
  COALESCE(d.`name`, f.`name`, 'N/A') AS department_or_faculty,
  u.`degree`,
  u.`area_of_specialization`,
  u.`email`,
  u.`phone_number`,
  u.`rssb_number`,
  efi.`bank_account_number`,
  u.`foreign_degree_equivalence`,
  u.`employment_date`,
  u.`supervisor_id`
FROM `users` u
LEFT JOIN `departments` d ON d.`id` = u.`department_id`
LEFT JOIN `faculties` f ON f.`id` = u.`faculty_id`
LEFT JOIN `employee_financial_info` efi ON efi.`user_id` = u.`id`
WHERE u.`is_active` = 1 OR u.`deleted_at` IS NULL
ORDER BY u.`full_name`;

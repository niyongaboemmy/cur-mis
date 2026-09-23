-- =========================================================================
-- HR MODULE - COMPLETE CPANEL MIGRATION
-- All 9 HR migrations consolidated into single executable file
-- For use on cPanel/live production database
-- Version: 2026-09-05
-- =========================================================================

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;
SET SESSION sql_mode = 'STRICT_TRANS_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

-- =========================================================================
-- PHASE 1: LEAVE TYPES & APPROVAL WORKFLOW
-- =========================================================================

-- Add columns to leave_types if not exists
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_types' AND COLUMN_NAME = 'description');
SET @s := IF(@c = 0, "ALTER TABLE `leave_types` ADD COLUMN `description` mediumtext DEFAULT NULL", 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_types' AND COLUMN_NAME = 'color');
SET @s := IF(@c = 0, "ALTER TABLE `leave_types` ADD COLUMN `color` varchar(30) DEFAULT '#4FB4FF'", 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_types' AND COLUMN_NAME = 'is_active');
SET @s := IF(@c = 0, "ALTER TABLE `leave_types` ADD COLUMN `is_active` tinyint(1) DEFAULT 1", 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_types' AND COLUMN_NAME = 'created_at');
SET @s := IF(@c = 0, "ALTER TABLE `leave_types` ADD COLUMN `created_at` timestamp DEFAULT CURRENT_TIMESTAMP", 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_types' AND COLUMN_NAME = 'updated_at');
SET @s := IF(@c = 0, "ALTER TABLE `leave_types` ADD COLUMN `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP", 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Create leave_approval_history table for 3-level workflow tracking
CREATE TABLE IF NOT EXISTS `leave_approval_history` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `leave_request_id` int(10) UNSIGNED NOT NULL,
  `stage_order` tinyint(3) UNSIGNED NOT NULL,
  `stage_name` varchar(100) NOT NULL,
  `stage_label` varchar(150) DEFAULT NULL,
  `actor_id` int(10) UNSIGNED DEFAULT NULL,
  `actor_name` varchar(150) DEFAULT NULL,
  `actor_role` varchar(100) DEFAULT NULL,
  `decision` enum('submitted','approved','rejected','changes_requested','resubmitted','cancelled') NOT NULL,
  `comment` text DEFAULT NULL,
  `decided_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_lah_request` (`leave_request_id`),
  CONSTRAINT `fk_lah_request` FOREIGN KEY (`leave_request_id`) REFERENCES `leave_requests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Add supervisor_id column if not exists
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'supervisor_id');
SET @s := IF(@c = 0, "ALTER TABLE `users` ADD COLUMN `supervisor_id` int(10) UNSIGNED DEFAULT NULL", 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =========================================================================
-- PHASE 2: EMPLOYEE PROFILES & QUALIFICATIONS
-- =========================================================================

CREATE TABLE IF NOT EXISTS `employee_profiles` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` int(10) UNSIGNED NOT NULL,
  `gender` enum('Male','Female','Other','Prefer not to say') DEFAULT NULL,
  `date_of_birth` date DEFAULT NULL,
  `nationality` varchar(100) DEFAULT NULL,
  `marital_status` enum('Single','Married','Divorced','Widowed') DEFAULT NULL,
  `emergency_contact_name` varchar(150) DEFAULT NULL,
  `emergency_contact_phone` varchar(20) DEFAULT NULL,
  `emergency_contact_relation` varchar(50) DEFAULT NULL,
  `tax_identification_number` varchar(50) DEFAULT NULL,
  `medical_conditions` text DEFAULT NULL,
  `employee_photo_id` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`),
  UNIQUE KEY `tax_identification_number` (`tax_identification_number`),
  CONSTRAINT `fk_ep_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `employee_financial_info` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` int(10) UNSIGNED NOT NULL,
  `rssb_number` varchar(50) DEFAULT NULL,
  `tax_number` varchar(50) DEFAULT NULL,
  `bank_name` varchar(100) DEFAULT NULL,
  `bank_account_number` varchar(50) DEFAULT NULL,
  `bank_account_holder` varchar(150) DEFAULT NULL,
  `iban_or_swift` varchar(50) DEFAULT NULL,
  `salary_payment_method` enum('Bank Transfer','Cash','Mobile Money') DEFAULT 'Bank Transfer',
  `cbhi_number` varchar(50) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`),
  UNIQUE KEY `rssb_number` (`rssb_number`),
  UNIQUE KEY `tax_number` (`tax_number`),
  UNIQUE KEY `bank_account_number` (`bank_account_number`),
  CONSTRAINT `fk_efi_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `employee_qualifications` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` int(10) UNSIGNED NOT NULL,
  `qualification_type` varchar(100) NOT NULL,
  `field_of_study` varchar(255) NOT NULL,
  `institution_name` varchar(255) NOT NULL,
  `country_of_study` varchar(100) DEFAULT NULL,
  `year_obtained` int(11) NOT NULL,
  `is_primary` tinyint(1) DEFAULT 0,
  `equivalence_status` enum('Not Applicable','Pending','Approved','Rejected') DEFAULT 'Not Applicable',
  `equivalence_approved_by` int(10) UNSIGNED DEFAULT NULL,
  `equivalence_approved_at` timestamp NULL DEFAULT NULL,
  `certificate_file_id` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_eq_user` (`user_id`),
  KEY `idx_eq_primary` (`user_id`, `is_primary`),
  CONSTRAINT `fk_eq_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- =========================================================================
-- PHASE 3: PAYROLL & SALARY STRUCTURES
-- =========================================================================

CREATE TABLE IF NOT EXISTS `salary_component_types` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `code` varchar(20) NOT NULL,
  `description` text DEFAULT NULL,
  `component_type` enum('Earnings','Deduction','Statutory') NOT NULL DEFAULT 'Earnings',
  `is_taxable` tinyint(1) DEFAULT 1,
  `is_mandatory` tinyint(1) DEFAULT 0,
  `formula` varchar(500) DEFAULT NULL,
  `sort_order` int(11) DEFAULT 0,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_sct_active` (`is_active`),
  KEY `idx_sct_type` (`component_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `salary_structures` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  `description` text DEFAULT NULL,
  `applicable_level` varchar(100) DEFAULT NULL,
  `applicable_role_id` int(10) UNSIGNED DEFAULT NULL,
  `applicable_department_id` int(10) UNSIGNED DEFAULT NULL,
  `effective_date` date NOT NULL,
  `end_date` date DEFAULT NULL,
  `basic_salary_min` decimal(12,2) DEFAULT NULL,
  `basic_salary_max` decimal(12,2) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ss_effective` (`effective_date`, `end_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `salary_structure_components` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `salary_structure_id` int(10) UNSIGNED NOT NULL,
  `component_type_id` int(10) UNSIGNED NOT NULL,
  `percentage` decimal(5,2) DEFAULT NULL,
  `fixed_amount` decimal(12,2) DEFAULT NULL,
  `is_percentage` tinyint(1) DEFAULT 1,
  `sort_order` int(11) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ss_component` (`salary_structure_id`, `component_type_id`),
  CONSTRAINT `fk_ssc_structure` FOREIGN KEY (`salary_structure_id`) REFERENCES `salary_structures` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ssc_component` FOREIGN KEY (`component_type_id`) REFERENCES `salary_component_types` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `employee_salary_assignments` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` int(10) UNSIGNED NOT NULL,
  `salary_structure_id` int(10) UNSIGNED NOT NULL,
  `basic_salary` decimal(12,2) NOT NULL,
  `effective_date` date NOT NULL,
  `end_date` date DEFAULT NULL,
  `approved_by` int(10) UNSIGNED DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_esa_user` (`user_id`),
  KEY `idx_esa_effective` (`effective_date`, `end_date`),
  KEY `idx_esa_active` (`user_id`, `end_date`),
  CONSTRAINT `fk_esa_structure` FOREIGN KEY (`salary_structure_id`) REFERENCES `salary_structures` (`id`),
  CONSTRAINT `fk_esa_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `payroll_runs` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `payroll_period` date NOT NULL,
  `payroll_month` varchar(7) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `status` enum('Draft','Processing','Approved','Paid','Cancelled') DEFAULT 'Draft',
  `total_employees` int(10) UNSIGNED DEFAULT 0,
  `total_gross_salary` decimal(15,2) DEFAULT 0.00,
  `total_deductions` decimal(15,2) DEFAULT 0.00,
  `total_net_pay` decimal(15,2) DEFAULT 0.00,
  `created_by` int(10) UNSIGNED DEFAULT NULL,
  `approved_by` int(10) UNSIGNED DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `paid_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pr_period` (`payroll_period`),
  KEY `idx_pr_status` (`status`),
  KEY `idx_pr_month` (`payroll_month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `payroll_details` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `payroll_run_id` int(10) UNSIGNED NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `basic_salary` decimal(12,2) NOT NULL,
  `gross_salary` decimal(12,2) NOT NULL,
  `total_deductions` decimal(12,2) NOT NULL DEFAULT 0.00,
  `net_salary` decimal(12,2) NOT NULL,
  `payment_date` date DEFAULT NULL,
  `payment_reference` varchar(100) DEFAULT NULL,
  `payment_method` enum('Bank Transfer','Cash','Mobile Money') DEFAULT NULL,
  `payment_status` enum('Pending','Paid','Failed') DEFAULT 'Pending',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pd_run_user` (`payroll_run_id`, `user_id`),
  KEY `idx_pd_status` (`payment_status`),
  CONSTRAINT `fk_pd_run` FOREIGN KEY (`payroll_run_id`) REFERENCES `payroll_runs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pd_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `payroll_line_items` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `payroll_detail_id` int(10) UNSIGNED NOT NULL,
  `component_type_id` int(10) UNSIGNED NOT NULL,
  `component_name` varchar(100) NOT NULL,
  `component_code` varchar(20) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `is_earning` tinyint(1) DEFAULT 1,
  `is_deduction` tinyint(1) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pli_detail` (`payroll_detail_id`),
  CONSTRAINT `fk_pli_detail` FOREIGN KEY (`payroll_detail_id`) REFERENCES `payroll_details` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pli_component` FOREIGN KEY (`component_type_id`) REFERENCES `salary_component_types` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- =========================================================================
-- PHASE 4: LEAVE MANAGEMENT
-- =========================================================================

CREATE TABLE IF NOT EXISTS `leave_balances` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id` int(10) UNSIGNED NOT NULL,
  `leave_type_id` int(10) UNSIGNED NOT NULL,
  `year` year(4) NOT NULL,
  `total_days` decimal(5,1) NOT NULL DEFAULT 0.0,
  `used_days` decimal(5,1) NOT NULL DEFAULT 0.0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_lb_emp_type_year` (`employee_id`, `leave_type_id`, `year`),
  CONSTRAINT `fk_lb_employee` FOREIGN KEY (`employee_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lb_type` FOREIGN KEY (`leave_type_id`) REFERENCES `leave_types` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Add columns to leave_requests if not exists
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_requests' AND COLUMN_NAME = 'contact_during_absence');
SET @s := IF(@c = 0, "ALTER TABLE `leave_requests` ADD COLUMN `contact_during_absence` varchar(100) DEFAULT NULL", 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_requests' AND COLUMN_NAME = 'remarks');
SET @s := IF(@c = 0, "ALTER TABLE `leave_requests` ADD COLUMN `remarks` text DEFAULT NULL", 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_requests' AND COLUMN_NAME = 'pdf_file_id');
SET @s := IF(@c = 0, "ALTER TABLE `leave_requests` ADD COLUMN `pdf_file_id` varchar(255) DEFAULT NULL", 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_requests' AND COLUMN_NAME = 'qr_code');
SET @s := IF(@c = 0, "ALTER TABLE `leave_requests` ADD COLUMN `qr_code` varchar(500) DEFAULT NULL", 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_requests' AND COLUMN_NAME = 'user_id');
SET @s := IF(@c = 0, "ALTER TABLE `leave_requests` ADD COLUMN `user_id` int(10) UNSIGNED DEFAULT NULL", 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_requests' AND COLUMN_NAME = 'current_stage_order');
SET @s := IF(@c = 0, "ALTER TABLE `leave_requests` ADD COLUMN `current_stage_order` tinyint(3) UNSIGNED DEFAULT 1", 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leave_requests' AND COLUMN_NAME = 'updated_at');
SET @s := IF(@c = 0, "ALTER TABLE `leave_requests` ADD COLUMN `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP", 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =========================================================================
-- PHASE 5: CONTRACT MANAGEMENT
-- =========================================================================

CREATE TABLE IF NOT EXISTS `contract_types` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `code` varchar(20) NOT NULL,
  `description` text DEFAULT NULL,
  `default_duration_days` int(11) DEFAULT NULL,
  `is_renewable` tinyint(1) DEFAULT 1,
  `renewal_notice_days` int(11) DEFAULT 30,
  `sort_order` int(11) DEFAULT 0,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_ct_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `employee_contracts` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` int(10) UNSIGNED NOT NULL,
  `contract_type_id` int(10) UNSIGNED NOT NULL,
  `contract_number` varchar(50) DEFAULT NULL,
  `start_date` date NOT NULL,
  `end_date` date DEFAULT NULL,
  `position_title` varchar(150) NOT NULL,
  `employment_level` varchar(50) DEFAULT NULL,
  `reporting_to_id` int(10) UNSIGNED DEFAULT NULL,
  `salary_grade` varchar(20) DEFAULT NULL,
  `approved_by` int(10) UNSIGNED DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `contract_file_id` varchar(255) DEFAULT NULL,
  `status` enum('Draft','Pending Approval','Approved','Active','Expired','Terminated') DEFAULT 'Draft',
  `renewal_due_date` date DEFAULT NULL,
  `renewed_at` timestamp NULL DEFAULT NULL,
  `termination_reason` varchar(255) DEFAULT NULL,
  `termination_date` date DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `contract_number` (`contract_number`),
  KEY `idx_ec_user` (`user_id`),
  KEY `idx_ec_status` (`status`),
  KEY `idx_ec_end_date` (`end_date`),
  CONSTRAINT `fk_ec_type` FOREIGN KEY (`contract_type_id`) REFERENCES `contract_types` (`id`),
  CONSTRAINT `fk_ec_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ec_reporting_to` FOREIGN KEY (`reporting_to_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- =========================================================================
-- PHASE 6: CERTIFICATE MANAGEMENT
-- =========================================================================

CREATE TABLE IF NOT EXISTS `certificate_types` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `code` varchar(20) NOT NULL,
  `description` text DEFAULT NULL,
  `template_file_id` varchar(255) DEFAULT NULL,
  `requires_approval` tinyint(1) DEFAULT 1,
  `is_active` tinyint(1) DEFAULT 1,
  `sort_order` int(11) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_ct_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `certificate_requests` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` int(10) UNSIGNED NOT NULL,
  `certificate_type_id` int(10) UNSIGNED NOT NULL,
  `requested_for_date` date NOT NULL,
  `requested_for_purpose` varchar(255) DEFAULT NULL,
  `number_of_copies` int(11) DEFAULT 1,
  `status` enum('Requested','Approved','Rejected','Generated','Printed','Collected','Cancelled') DEFAULT 'Requested',
  `approved_by` int(10) UNSIGNED DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `generated_file_id` varchar(255) DEFAULT NULL,
  `generated_at` timestamp NULL DEFAULT NULL,
  `collected_at` timestamp NULL DEFAULT NULL,
  `rejection_reason` text DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cr_user` (`user_id`),
  KEY `idx_cr_status` (`status`),
  CONSTRAINT `fk_cr_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cr_type` FOREIGN KEY (`certificate_type_id`) REFERENCES `certificate_types` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- =========================================================================
-- PHASE 7: COLUMN ENHANCEMENTS (no data insertion)
-- =========================================================================

-- Ensure salary_component_types has all required columns (add missing if needed)
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'salary_component_types' AND COLUMN_NAME = 'formula');
SET @s := IF(@c = 0, "ALTER TABLE `salary_component_types` ADD COLUMN `formula` varchar(500) DEFAULT NULL", 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'salary_component_types' AND COLUMN_NAME = 'sort_order');
SET @s := IF(@c = 0, "ALTER TABLE `salary_component_types` ADD COLUMN `sort_order` int(11) DEFAULT 0", 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'salary_component_types' AND COLUMN_NAME = 'component_type');
SET @s := IF(@c = 0, "ALTER TABLE `salary_component_types` ADD COLUMN `component_type` enum('Earnings','Deduction','Statutory') DEFAULT 'Earnings'", 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Ensure contract_types table has all required columns
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contract_types' AND COLUMN_NAME = 'code');
SET @s := IF(@c = 0, "ALTER TABLE `contract_types` ADD COLUMN `code` varchar(20) DEFAULT NULL UNIQUE", 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contract_types' AND COLUMN_NAME = 'default_duration_days');
SET @s := IF(@c = 0, "ALTER TABLE `contract_types` ADD COLUMN `default_duration_days` int(11) DEFAULT NULL", 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contract_types' AND COLUMN_NAME = 'renewal_notice_days');
SET @s := IF(@c = 0, "ALTER TABLE `contract_types` ADD COLUMN `renewal_notice_days` int(11) DEFAULT 30", 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contract_types' AND COLUMN_NAME = 'sort_order');
SET @s := IF(@c = 0, "ALTER TABLE `contract_types` ADD COLUMN `sort_order` int(11) DEFAULT 0", 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Ensure certificate_types table has all required columns
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'certificate_types' AND COLUMN_NAME = 'code');
SET @s := IF(@c = 0, "ALTER TABLE `certificate_types` ADD COLUMN `code` varchar(20) DEFAULT NULL UNIQUE", 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'certificate_types' AND COLUMN_NAME = 'requires_approval');
SET @s := IF(@c = 0, "ALTER TABLE `certificate_types` ADD COLUMN `requires_approval` tinyint(1) DEFAULT 1", 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'certificate_types' AND COLUMN_NAME = 'sort_order');
SET @s := IF(@c = 0, "ALTER TABLE `certificate_types` ADD COLUMN `sort_order` int(11) DEFAULT 0", 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =========================================================================
-- VERIFICATION QUERIES (run these to verify successful migration)
-- =========================================================================

SELECT 'Tables Created' as status;
SELECT 'leave_approval_history' as table_name, COUNT(*) as count FROM leave_approval_history;
SELECT 'employee_profiles' as table_name, COUNT(*) as count FROM employee_profiles;
SELECT 'employee_financial_info' as table_name, COUNT(*) as count FROM employee_financial_info;
SELECT 'employee_qualifications' as table_name, COUNT(*) as count FROM employee_qualifications;
SELECT 'salary_component_types' as table_name, COUNT(*) as count FROM salary_component_types;
SELECT 'salary_structures' as table_name, COUNT(*) as count FROM salary_structures;
SELECT 'salary_structure_components' as table_name, COUNT(*) as count FROM salary_structure_components;
SELECT 'employee_salary_assignments' as table_name, COUNT(*) as count FROM employee_salary_assignments;
SELECT 'payroll_runs' as table_name, COUNT(*) as count FROM payroll_runs;
SELECT 'payroll_details' as table_name, COUNT(*) as count FROM payroll_details;
SELECT 'payroll_line_items' as table_name, COUNT(*) as count FROM payroll_line_items;
SELECT 'leave_balances' as table_name, COUNT(*) as count FROM leave_balances;
SELECT 'contract_types' as table_name, COUNT(*) as count FROM contract_types;
SELECT 'employee_contracts' as table_name, COUNT(*) as count FROM employee_contracts;
SELECT 'certificate_types' as table_name, COUNT(*) as count FROM certificate_types;
SELECT 'certificate_requests' as table_name, COUNT(*) as count FROM certificate_requests;

SET FOREIGN_KEY_CHECKS = 1;

-- =========================================================================
-- MIGRATION COMPLETE
-- All HR module tables and columns have been successfully created/enhanced
-- Data from existing tables (salary_component_types, contract_types, certificate_types, etc.) will be used
-- =========================================================================

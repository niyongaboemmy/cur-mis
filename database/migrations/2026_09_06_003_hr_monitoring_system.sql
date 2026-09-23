-- =============================================================================
-- HR MONITORING SYSTEM
-- Date: 2026-09-06
-- Purpose: Add comprehensive HR monitoring and reporting capabilities
-- =============================================================================

-- =============================================================================
-- 1. STAFF PERFORMANCE MONITORING
-- =============================================================================

CREATE TABLE IF NOT EXISTS `performance_appraisals` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `employee_id` BIGINT UNSIGNED NOT NULL,
  `appraisal_period` VARCHAR(50),
  `appraisal_date` DATE,
  `rating` DECIMAL(3,2),
  `comments` LONGTEXT,
  `appraiser_id` BIGINT UNSIGNED,
  `status` VARCHAR(50) DEFAULT 'draft',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_employee_id` (`employee_id`),
  INDEX `idx_appraisal_date` (`appraisal_date`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `performance_targets` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `employee_id` BIGINT UNSIGNED NOT NULL,
  `academic_year_id` BIGINT UNSIGNED,
  `target_description` TEXT,
  `target_metric` VARCHAR(255),
  `target_value` DECIMAL(10,2),
  `actual_value` DECIMAL(10,2),
  `achievement_date` DATE,
  `status` VARCHAR(50) DEFAULT 'pending',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_employee_id` (`employee_id`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 2. RECRUITMENT AND STAFFING MONITORING
-- =============================================================================

CREATE TABLE IF NOT EXISTS `recruitment_posts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `position_title` VARCHAR(255) NOT NULL,
  `department_id` BIGINT UNSIGNED,
  `position_level` VARCHAR(100),
  `vacancy_count` INT DEFAULT 1,
  `posting_date` DATE,
  `closing_date` DATE,
  `status` VARCHAR(50) DEFAULT 'open',
  `description` LONGTEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_department_id` (`department_id`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `recruitment_candidates` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `recruitment_post_id` BIGINT UNSIGNED NOT NULL,
  `candidate_name` VARCHAR(255),
  `candidate_email` VARCHAR(255),
  `candidate_phone` VARCHAR(20),
  `application_date` DATE,
  `stage` VARCHAR(100),
  `status` VARCHAR(50) DEFAULT 'applied',
  `interview_date` DATETIME,
  `notes` LONGTEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_post_id` (`recruitment_post_id`),
  INDEX `idx_status` (`status`),
  FOREIGN KEY (`recruitment_post_id`) REFERENCES `recruitment_posts`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `probation_records` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `employee_id` BIGINT UNSIGNED NOT NULL,
  `probation_start_date` DATE,
  `probation_end_date` DATE,
  `probation_status` VARCHAR(50),
  `supervisor_comments` LONGTEXT,
  `recommendation` VARCHAR(100),
  `completion_date` DATE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_employee_id` (`employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 3. COMPENSATION AND BENEFITS MONITORING
-- =============================================================================

CREATE TABLE IF NOT EXISTS `payroll_audits` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `payroll_period_id` BIGINT UNSIGNED,
  `audit_date` DATE,
  `auditor_id` BIGINT UNSIGNED,
  `total_employees_paid` INT,
  `total_amount_paid` DECIMAL(15,2),
  `discrepancies_found` INT DEFAULT 0,
  `issues_notes` LONGTEXT,
  `status` VARCHAR(50) DEFAULT 'pending',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_audit_date` (`audit_date`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `benefits_tracking` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `employee_id` BIGINT UNSIGNED NOT NULL,
  `benefit_type` VARCHAR(100),
  `benefit_amount` DECIMAL(12,2),
  `start_date` DATE,
  `end_date` DATE,
  `status` VARCHAR(50) DEFAULT 'active',
  `verification_date` DATE,
  `verified_by` BIGINT UNSIGNED,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_employee_id` (`employee_id`),
  INDEX `idx_benefit_type` (`benefit_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 4. COMPLIANCE AND POLICY MONITORING
-- =============================================================================

CREATE TABLE IF NOT EXISTS `policy_compliance_audits` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `policy_name` VARCHAR(255),
  `audit_date` DATE,
  `auditor_id` BIGINT UNSIGNED,
  `compliance_percentage` DECIMAL(5,2),
  `findings` LONGTEXT,
  `recommendations` LONGTEXT,
  `status` VARCHAR(50) DEFAULT 'pending',
  `follow_up_date` DATE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_audit_date` (`audit_date`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `labor_law_compliance` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `compliance_area` VARCHAR(255),
  `law_reference` VARCHAR(255),
  `compliance_status` VARCHAR(50),
  `last_review_date` DATE,
  `next_review_date` DATE,
  `notes` LONGTEXT,
  `reviewer_id` BIGINT UNSIGNED,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_compliance_status` (`compliance_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 5. EMPLOYEE RELATIONS MONITORING
-- =============================================================================

CREATE TABLE IF NOT EXISTS `grievances` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `employee_id` BIGINT UNSIGNED NOT NULL,
  `grievance_date` DATE,
  `grievance_type` VARCHAR(100),
  `grievance_description` LONGTEXT,
  `status` VARCHAR(50) DEFAULT 'filed',
  `assigned_to` BIGINT UNSIGNED,
  `resolution_date` DATE,
  `resolution_notes` LONGTEXT,
  `satisfaction_rating` INT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_employee_id` (`employee_id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_grievance_date` (`grievance_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `conflict_resolutions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `conflict_date` DATE,
  `parties_involved` VARCHAR(500),
  `conflict_description` LONGTEXT,
  `resolution_method` VARCHAR(100),
  `mediator_id` BIGINT UNSIGNED,
  `resolution_outcome` LONGTEXT,
  `status` VARCHAR(50) DEFAULT 'pending',
  `follow_up_date` DATE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_conflict_date` (`conflict_date`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `staff_satisfaction_surveys` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `survey_date` DATE,
  `survey_topic` VARCHAR(255),
  `total_respondents` INT,
  `satisfaction_score` DECIMAL(3,2),
  `key_findings` LONGTEXT,
  `recommendations` LONGTEXT,
  `status` VARCHAR(50) DEFAULT 'completed',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_survey_date` (`survey_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `counseling_records` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `employee_id` BIGINT UNSIGNED NOT NULL,
  `counselor_id` BIGINT UNSIGNED,
  `counseling_date` DATE,
  `session_topic` VARCHAR(255),
  `session_notes` LONGTEXT,
  `follow_up_required` BOOLEAN DEFAULT FALSE,
  `follow_up_date` DATE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_employee_id` (`employee_id`),
  INDEX `idx_counseling_date` (`counseling_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 6. DATA AND RECORD MONITORING
-- =============================================================================

CREATE TABLE IF NOT EXISTS `hr_data_audits` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `audit_date` DATE,
  `auditor_id` BIGINT UNSIGNED,
  `data_category` VARCHAR(100),
  `total_records` INT,
  `records_verified` INT,
  `discrepancies_found` INT DEFAULT 0,
  `accuracy_percentage` DECIMAL(5,2),
  `findings` LONGTEXT,
  `corrective_actions` LONGTEXT,
  `status` VARCHAR(50) DEFAULT 'pending',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_audit_date` (`audit_date`),
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 7. TURNOVER AND RETENTION MONITORING
-- =============================================================================

CREATE TABLE IF NOT EXISTS `exit_interviews` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `employee_id` BIGINT UNSIGNED NOT NULL,
  `exit_date` DATE,
  `reason_for_leaving` VARCHAR(255),
  `interviewer_id` BIGINT UNSIGNED,
  `job_satisfaction` INT,
  `management_satisfaction` INT,
  `work_environment_satisfaction` INT,
  `comments` LONGTEXT,
  `would_rehire` BOOLEAN,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_employee_id` (`employee_id`),
  INDEX `idx_exit_date` (`exit_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `turnover_analytics` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `report_date` DATE,
  `academic_year_id` BIGINT UNSIGNED,
  `total_employees_start` INT,
  `employees_hired` INT,
  `employees_left` INT,
  `turnover_rate` DECIMAL(5,2),
  `avg_tenure_months` DECIMAL(5,1),
  `top_exit_reasons` LONGTEXT,
  `retention_strategies` LONGTEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_report_date` (`report_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `retention_strategies` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `strategy_name` VARCHAR(255),
  `strategy_description` LONGTEXT,
  `target_group` VARCHAR(100),
  `start_date` DATE,
  `end_date` DATE,
  `budget_allocated` DECIMAL(12,2),
  `expected_retention_improvement` DECIMAL(5,2),
  `status` VARCHAR(50) DEFAULT 'active',
  `effectiveness_score` DECIMAL(3,2),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 8. VERIFICATION AND SUMMARY
-- =============================================================================

SELECT 'HR Monitoring System Tables Created Successfully' AS status;

SELECT TABLE_NAME, TABLE_COLLATION, TABLE_ROWS
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_NAME IN (
  'performance_appraisals', 'performance_targets',
  'recruitment_posts', 'recruitment_candidates', 'probation_records',
  'payroll_audits', 'benefits_tracking',
  'policy_compliance_audits', 'labor_law_compliance',
  'grievances', 'conflict_resolutions', 'staff_satisfaction_surveys', 'counseling_records',
  'hr_data_audits',
  'exit_interviews', 'turnover_analytics', 'retention_strategies'
)
ORDER BY TABLE_NAME;

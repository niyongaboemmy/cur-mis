-- =============================================================================
-- API ROUTING AND DATABASE INTEGRITY FIX
-- Date: 2026-09-05
-- Purpose: Ensure all required tables exist and are properly configured
-- =============================================================================

-- =============================================================================
-- 1. VERIFY ROLES TABLE EXISTS (FIRST - no dependencies)
-- =============================================================================

CREATE TABLE IF NOT EXISTS `roles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL UNIQUE,
  `description` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 2. VERIFY PERMISSIONS TABLE EXISTS (no dependencies)
-- =============================================================================

CREATE TABLE IF NOT EXISTS `permissions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL UNIQUE,
  `description` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 3. VERIFY USERS TABLE EXISTS (depends on roles)
-- =============================================================================

CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `first_name` VARCHAR(100),
  `last_name` VARCHAR(100),
  `phone` VARCHAR(30),
  `role_id` BIGINT UNSIGNED,
  `is_active` BOOLEAN DEFAULT TRUE,
  `is_teaching` BOOLEAN DEFAULT FALSE,
  `email_verified_at` TIMESTAMP NULL,
  `last_login` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_email` (`email`),
  INDEX `idx_role_id` (`role_id`),
  INDEX `idx_is_active` (`is_active`),
  INDEX `idx_is_teaching` (`is_teaching`),
  FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 4. VERIFY ROLE_PERMISSIONS JUNCTION TABLE EXISTS (depends on roles & permissions)
-- =============================================================================

CREATE TABLE IF NOT EXISTS `role_permissions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `role_id` BIGINT UNSIGNED NOT NULL,
  `permission_id` BIGINT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `unique_role_permission` (`role_id`, `permission_id`),
  FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE,
  INDEX `idx_role_id` (`role_id`),
  INDEX `idx_permission_id` (`permission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 5. VERIFY APPLICANT_PROFILES TABLE EXISTS (no FK dependencies)
-- =============================================================================

CREATE TABLE IF NOT EXISTS `applicant_profiles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `user_id` BIGINT UNSIGNED,
  `application_id` BIGINT UNSIGNED,
  `email` VARCHAR(255) NOT NULL,
  `middle_name` VARCHAR(100),
  `id_type` VARCHAR(50),
  `id_number` VARCHAR(50),
  `province` VARCHAR(100),
  `district` VARCHAR(100),
  `sector` VARCHAR(100),
  `emergency_contact_name` VARCHAR(150),
  `emergency_contact_phone` VARCHAR(30),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_email` (`email`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_application_id` (`application_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 6. VERIFY STUDENT_APPLICATIONS TABLE EXISTS (depends on applicant_profiles)
-- =============================================================================

CREATE TABLE IF NOT EXISTS `student_applications` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `applicant_profile_id` BIGINT UNSIGNED,
  `application_number` VARCHAR(50) UNIQUE,
  `first_name` VARCHAR(100),
  `last_name` VARCHAR(100),
  `email` VARCHAR(255),
  `phone` VARCHAR(30),
  `address` TEXT,
  `nationality` VARCHAR(100),
  `status` VARCHAR(50) DEFAULT 'draft',
  `program_id` BIGINT UNSIGNED,
  `intake_id` BIGINT UNSIGNED,
  `campus_id` BIGINT UNSIGNED,
  `programme_type` VARCHAR(50),
  `programme_type_id` BIGINT UNSIGNED,
  `application_date` TIMESTAMP NULL,
  `submitted_date` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `unique_app_number` (`application_number`),
  INDEX `idx_email` (`email`),
  INDEX `idx_status` (`status`),
  INDEX `idx_applicant_profile_id` (`applicant_profile_id`),
  INDEX `idx_program_id` (`program_id`),
  INDEX `idx_intake_id` (`intake_id`),
  INDEX `idx_campus_id` (`campus_id`),
  FOREIGN KEY (`applicant_profile_id`) REFERENCES `applicant_profiles`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 7. VERIFY APPLICATION_DOCUMENTS TABLE EXISTS (depends on student_applications & applicant_profiles)
-- =============================================================================

CREATE TABLE IF NOT EXISTS `application_documents` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `application_id` BIGINT UNSIGNED,
  `applicant_profile_id` BIGINT UNSIGNED,
  `document_type_id` BIGINT UNSIGNED,
  `file_path` VARCHAR(500),
  `file_size` BIGINT,
  `status` VARCHAR(50) DEFAULT 'pending',
  `rejection_reason` TEXT,
  `rejection_feedback` TEXT,
  `uploaded_at` TIMESTAMP NULL,
  `verified_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_application_id` (`application_id`),
  INDEX `idx_applicant_profile_id` (`applicant_profile_id`),
  INDEX `idx_document_type_id` (`document_type_id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_uploaded_at` (`uploaded_at`),
  FOREIGN KEY (`application_id`) REFERENCES `student_applications`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`applicant_profile_id`) REFERENCES `applicant_profiles`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================================
-- 8. ENSURE ALL TABLES USE CORRECT COLLATION
-- =============================================================================

ALTER TABLE IF EXISTS `users` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `roles` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `permissions` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `role_permissions` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `applicant_profiles` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `student_applications` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `application_documents` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- =============================================================================
-- 9. ENSURE DEFAULT ROLES EXIST
-- =============================================================================

INSERT IGNORE INTO `roles` (`id`, `name`, `description`) VALUES
(1, 'super_admin', 'Super Administrator'),
(2, 'admin', 'Administrator'),
(3, 'student', 'Student'),
(4, 'applicant', 'Applicant'),
(5, 'teacher', 'Teacher/Lecturer'),
(6, 'hr_manager', 'HR Manager'),
(7, 'registrar', 'Registrar'),
(8, 'finance_manager', 'Finance Manager');

-- =============================================================================
-- 10. VERIFICATION - Database structure is ready
-- =============================================================================

SELECT 'API Database Structure Complete' as status;

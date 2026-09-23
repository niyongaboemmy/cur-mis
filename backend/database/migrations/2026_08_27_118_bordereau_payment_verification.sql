-- =============================================================================
-- Migration 118: Bordereau Payment Verification System
-- Date: 2026-08-27
--
-- Purpose: Add support for students to submit Bordereau (bank transfer)
-- receipt numbers for manual verification by Finance/Registrar.
--
-- Tables:
-- 1. bordereau_submissions - Track student submissions
-- 2. bordereau_verification_requests - Notifications sent to Finance/Registrar
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- =============================================================================
-- Table: bordereau_submissions
-- Stores Bordereau payment submissions from students
-- =============================================================================
CREATE TABLE IF NOT EXISTS `bordereau_submissions` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `application_id` INT UNSIGNED NOT NULL,
  `student_id` VARCHAR(20) NOT NULL COMMENT 'student.regnumber',
  `receipt_number` VARCHAR(50) NOT NULL,
  `amount` DECIMAL(12,2) NOT NULL,
  `bank_name` VARCHAR(100) NULL,
  `account_holder_name` VARCHAR(150) NULL,
  `payment_date` DATE NULL,
  `notes` TEXT NULL,
  `status` ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending' COMMENT 'pending=awaiting review, approved=verified by Finance, rejected=denied by Finance',
  `reviewed_by` INT UNSIGNED NULL COMMENT 'staff.id who approved/rejected',
  `rejection_reason` TEXT NULL,
  `reviewed_at` DATETIME NULL,
  `submission_attempt` INT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Track resubmission attempts (max 3)',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_receipt_number` (`receipt_number`),
  INDEX `idx_bs_application` (`application_id`),
  INDEX `idx_bs_student` (`student_id`),
  INDEX `idx_bs_status` (`status`),
  INDEX `idx_bs_created` (`created_at`),
  CONSTRAINT `fk_bs_application` FOREIGN KEY (`application_id`)
    REFERENCES `student_applications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Bordereau payment submissions awaiting Finance/Registrar verification';

-- =============================================================================
-- Table: bordereau_verification_requests
-- Notifications sent to Finance and Registrar about pending submissions
-- =============================================================================
CREATE TABLE IF NOT EXISTS `bordereau_verification_requests` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `bordereau_submission_id` INT UNSIGNED NOT NULL,
  `recipient_role` ENUM('finance','registrar') NOT NULL COMMENT 'Who should review this',
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `read_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  INDEX `idx_bvr_submission` (`bordereau_submission_id`),
  INDEX `idx_bvr_role` (`recipient_role`),
  INDEX `idx_bvr_unread` (`is_read`, `created_at`),
  CONSTRAINT `fk_bvr_submission` FOREIGN KEY (`bordereau_submission_id`)
    REFERENCES `bordereau_submissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Notification queue for Bordereau verification requests to Finance/Registrar';

-- =============================================================================
-- Add columns to student_applications to track Bordereau payment status
-- =============================================================================

-- bordereau_payment_status: Current status of Bordereau payment attempt
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'student_applications'
  AND COLUMN_NAME = 'bordereau_payment_status');
SET @stmt := IF(@col = 0,
  "ALTER TABLE `student_applications` ADD COLUMN `bordereau_payment_status` ENUM('not_submitted','pending_review','approved','rejected') NULL DEFAULT NULL COMMENT 'Status of Bordereau payment verification' AFTER `payment_status`",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- bordereau_submission_id: Reference to the approved Bordereau submission
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'student_applications'
  AND COLUMN_NAME = 'bordereau_submission_id');
SET @stmt := IF(@col = 0,
  "ALTER TABLE `student_applications` ADD COLUMN `bordereau_submission_id` INT UNSIGNED NULL DEFAULT NULL COMMENT 'Reference to approved bordereau_submissions.id' AFTER `bordereau_payment_status`",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Add foreign key for bordereau_submission_id if it doesn't exist
SET @fk_exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'student_applications'
  AND CONSTRAINT_NAME = 'fk_sa_bordereau_submission');
SET @stmt := IF(@fk_exists = 0,
  "ALTER TABLE `student_applications` ADD CONSTRAINT `fk_sa_bordereau_submission` FOREIGN KEY (`bordereau_submission_id`) REFERENCES `bordereau_submissions` (`id`) ON DELETE SET NULL",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================================
-- Index for fast verification dashboard queries
-- =============================================================================
ALTER TABLE `bordereau_submissions` ADD INDEX `idx_bs_status_created` (`status`, `created_at` DESC);
ALTER TABLE `student_applications` ADD INDEX `idx_sa_bordereau_status` (`bordereau_payment_status`);

-- =============================================================================
-- Summary
-- =============================================================================
-- Tables created:
-- - bordereau_submissions: Student Bordereau receipt submissions (max 3 attempts)
-- - bordereau_verification_requests: Notification queue for Finance/Registrar
--
-- Columns added to student_applications:
-- - bordereau_payment_status: Track verification status (pending/approved/rejected)
-- - bordereau_submission_id: Link to approved submission record
--
-- This schema enables:
-- 1. Students to submit Bordereau receipt numbers
-- 2. Finance/Registrar to receive notifications
-- 3. Finance/Registrar to review and approve/reject with reasons
-- 4. Students to resubmit (up to 3 attempts)
-- 5. Automatic status changes when approved
-- =============================================================================

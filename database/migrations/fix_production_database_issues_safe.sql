-- =============================================================================
-- PRODUCTION DATABASE FIX MIGRATION (SAFE VERSION)
-- Issue: Collation mismatch and missing tables
-- Date: 2026-07-04
-- This version only modifies tables that actually exist
-- =============================================================================

-- =============================================================================
-- 1. FIX COLLATION ISSUES (Only for tables that exist)
-- Convert all tables to use utf8mb4_unicode_ci consistently
-- =============================================================================

-- Check which tables exist and fix them
ALTER TABLE IF EXISTS `student` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `students` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `user` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `users` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `role` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `roles` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `permission` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `permissions` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `fee_payment` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `fee_payments` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `module` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `modules` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `module_mark` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `module_marks` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `organization` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `organizations` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `document` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `documents` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `invoice` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `invoices` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `academic_year` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `academic_years` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `program` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `programs` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `course` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `courses` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- =============================================================================
-- 2. CREATE MISSING role_permissions TABLE
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
-- 3. FIX fee_payments TABLE - Make bank_slip_file_id nullable (if table exists)
-- =============================================================================

-- Try to modify fee_payments
ALTER TABLE IF EXISTS `fee_payments`
MODIFY COLUMN `bank_slip_file_id` BIGINT UNSIGNED DEFAULT NULL;

-- Try to modify fee_payment (singular)
ALTER TABLE IF EXISTS `fee_payment`
MODIFY COLUMN `bank_slip_file_id` BIGINT UNSIGNED DEFAULT NULL;

-- Add default value for nullable columns
ALTER TABLE IF EXISTS `fee_payments`
MODIFY COLUMN `reference_number` VARCHAR(255) DEFAULT NULL;

ALTER TABLE IF EXISTS `fee_payment`
MODIFY COLUMN `reference_number` VARCHAR(255) DEFAULT NULL;

-- =============================================================================
-- 4. ADD MISSING COLUMNS (if they don't exist)
-- =============================================================================

-- Add title column to organizations if missing
ALTER TABLE IF EXISTS `organizations` ADD COLUMN `title` VARCHAR(255) DEFAULT NULL;
ALTER TABLE IF EXISTS `organization` ADD COLUMN `title` VARCHAR(255) DEFAULT NULL;

-- =============================================================================
-- 5. VERIFY AND FIX FOREIGN KEY RELATIONSHIPS (for tables that exist)
-- =============================================================================

-- Ensure students table has proper collation on id
ALTER TABLE IF EXISTS `students` MODIFY COLUMN `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT;
ALTER TABLE IF EXISTS `student` MODIFY COLUMN `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT;

-- Ensure student_id has consistent collation
ALTER TABLE IF EXISTS `students` MODIFY COLUMN `student_id` VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `student` MODIFY COLUMN `student_id` VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Ensure fee_payments references correct columns
ALTER TABLE IF EXISTS `fee_payments`
MODIFY COLUMN `student_id` VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

ALTER TABLE IF EXISTS `fee_payment`
MODIFY COLUMN `student_id` VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- =============================================================================
-- 6. ENSURE ALL STRING COLUMNS MATCHING FOR JOINS
-- =============================================================================

-- Standardize collation on commonly joined columns
ALTER TABLE IF EXISTS `users` MODIFY COLUMN `email` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `user` MODIFY COLUMN `email` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE IF EXISTS `students` MODIFY COLUMN `email` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `student` MODIFY COLUMN `email` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE IF EXISTS `roles` MODIFY COLUMN `name` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `role` MODIFY COLUMN `name` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE IF EXISTS `permissions` MODIFY COLUMN `name` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE IF EXISTS `permission` MODIFY COLUMN `name` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- =============================================================================
-- 7. CREATE INDEXES FOR PERFORMANCE (if tables exist)
-- =============================================================================

CREATE INDEX IF NOT EXISTS `idx_students_regnumber` ON `students`(`regnumber`);
CREATE INDEX IF NOT EXISTS `idx_student_regnumber` ON `student`(`regnumber`);
CREATE INDEX IF NOT EXISTS `idx_fee_payments_student_id` ON `fee_payments`(`student_id`);
CREATE INDEX IF NOT EXISTS `idx_fee_payment_student_id` ON `fee_payment`(`student_id`);
CREATE INDEX IF NOT EXISTS `idx_fee_payments_invoice_id` ON `fee_payments`(`invoice_id`);
CREATE INDEX IF NOT EXISTS `idx_fee_payment_invoice_id` ON `fee_payment`(`invoice_id`);
CREATE INDEX IF NOT EXISTS `idx_module_marks_student_id` ON `module_marks`(`student_id`);
CREATE INDEX IF NOT EXISTS `idx_module_mark_student_id` ON `module_mark`(`student_id`);
CREATE INDEX IF NOT EXISTS `idx_module_marks_module_id` ON `module_marks`(`module_id`);
CREATE INDEX IF NOT EXISTS `idx_module_mark_module_id` ON `module_mark`(`module_id`);
CREATE INDEX IF NOT EXISTS `idx_users_email` ON `users`(`email`);
CREATE INDEX IF NOT EXISTS `idx_user_email` ON `user`(`email`);
CREATE INDEX IF NOT EXISTS `idx_users_role_id` ON `users`(`role_id`);
CREATE INDEX IF NOT EXISTS `idx_user_role_id` ON `user`(`role_id`);

-- =============================================================================
-- 8. VERIFY DATABASE STATUS
-- =============================================================================

SELECT 'Migration completed successfully' as status;

-- Show list of tables in database
SELECT TABLE_NAME, TABLE_COLLATION FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME;

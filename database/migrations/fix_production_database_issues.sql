-- =============================================================================
-- PRODUCTION DATABASE FIX MIGRATION
-- Issue: Collation mismatch and missing tables
-- Date: 2026-07-04
-- =============================================================================

-- 1. FIX COLLATION ISSUES
-- Convert all tables to use utf8mb4_unicode_ci consistently

ALTER TABLE `students` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `users` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `roles` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `permissions` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `fee_payments` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `modules` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `module_marks` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `organizations` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `documents` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `invoices` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `academic_years` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `programs` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `courses` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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
-- 3. FIX fee_payments TABLE - Make bank_slip_file_id nullable
-- =============================================================================

ALTER TABLE `fee_payments`
MODIFY COLUMN `bank_slip_file_id` BIGINT UNSIGNED DEFAULT NULL;

-- Add default value for nullable columns
ALTER TABLE `fee_payments`
MODIFY COLUMN `reference_number` VARCHAR(255) DEFAULT NULL;

-- =============================================================================
-- 4. ADD MISSING COLUMNS (if they don't exist)
-- =============================================================================

-- Add title column to organizations if missing
ALTER TABLE `organizations` ADD COLUMN `title` VARCHAR(255) DEFAULT NULL AFTER `name`;

-- Add id column to modules if missing (check structure first)
-- This is usually already there, but just in case

-- =============================================================================
-- 5. VERIFY AND FIX FOREIGN KEY RELATIONSHIPS
-- =============================================================================

-- Ensure students table has proper collation on id
ALTER TABLE `students` MODIFY COLUMN `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT;
ALTER TABLE `students` MODIFY COLUMN `student_id` VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Ensure fee_payments references correct columns
ALTER TABLE `fee_payments`
MODIFY COLUMN `student_id` VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- =============================================================================
-- 6. ENSURE ALL STRING COLUMNS MATCHING FOR JOINS
-- =============================================================================

-- Standardize collation on commonly joined columns
ALTER TABLE `users` MODIFY COLUMN `email` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci UNIQUE;
ALTER TABLE `students` MODIFY COLUMN `email` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `roles` MODIFY COLUMN `name` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci UNIQUE;
ALTER TABLE `permissions` MODIFY COLUMN `name` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci UNIQUE;

-- =============================================================================
-- 7. CREATE INDEXES FOR PERFORMANCE
-- =============================================================================

CREATE INDEX IF NOT EXISTS `idx_students_regnumber` ON `students`(`regnumber`);
CREATE INDEX IF NOT EXISTS `idx_fee_payments_student_id` ON `fee_payments`(`student_id`);
CREATE INDEX IF NOT EXISTS `idx_fee_payments_invoice_id` ON `fee_payments`(`invoice_id`);
CREATE INDEX IF NOT EXISTS `idx_module_marks_student_id` ON `module_marks`(`student_id`);
CREATE INDEX IF NOT EXISTS `idx_module_marks_module_id` ON `module_marks`(`module_id`);
CREATE INDEX IF NOT EXISTS `idx_users_email` ON `users`(`email`);
CREATE INDEX IF NOT EXISTS `idx_users_role_id` ON `users`(`role_id`);

-- =============================================================================
-- 8. VERIFY DATABASE STATUS
-- =============================================================================

-- Show current status after migration
SELECT 'Migration completed successfully' as status;

-- You can verify with:
-- SELECT TABLE_NAME, COLLATION_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE();
-- SELECT TABLE_NAME, COLUMN_NAME, COLLATION_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE();

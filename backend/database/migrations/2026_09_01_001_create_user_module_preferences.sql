-- Migration: 2026_09_01_001_create_user_module_preferences
-- Creates table for per-user, per-module academic year selection
-- Allows Finance, Academic, HR, Registry, etc to independently select different years

SET FOREIGN_KEY_CHECKS = 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: user_module_preferences
-- ─────────────────────────────────────────────────────────────────────────────
-- Stores which academic year each user is viewing for each module.
-- This allows departments to work independently without interfering with each other.
--
-- Columns:
--   id                     - Primary key
--   user_id                - FK to users (which staff member)
--   module_name            - Module identifier (finance, academic, hr, registry, etc)
--   selected_academic_year_id - FK to academic_years (NULL = use current year)
--   created_at             - When preference was first set
--   updated_at             - When preference was last changed
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `user_module_preferences` (
    `id`                        INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id`                   INT UNSIGNED NOT NULL,
    `module_name`               VARCHAR(50) NOT NULL COMMENT 'finance, academic, hr, registry, admissions, library, hostel, etc',
    `selected_academic_year_id` INT UNSIGNED NULL COMMENT 'NULL means use system current academic year',
    `created_at`                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `unique_user_module` (`user_id`, `module_name`),
    INDEX `idx_user_module_prefs_user` (`user_id`),
    INDEX `idx_user_module_prefs_module` (`module_name`),
    INDEX `idx_user_module_prefs_year` (`selected_academic_year_id`),

    CONSTRAINT `fk_ump_user` FOREIGN KEY (`user_id`)
        REFERENCES `users`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_ump_academic_year` FOREIGN KEY (`selected_academic_year_id`)
        REFERENCES `academic_years`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
COMMENT='User module-level academic year preferences - allows independent year selection per department';

-- ─────────────────────────────────────────────────────────────────────────────
-- DATA SAFETY VERIFICATION QUERIES
-- ─────────────────────────────────────────────────────────────────────────────
-- Run these queries to verify no data was affected:

-- Check that academic_years table is unchanged:
-- SELECT COUNT(*) as total_academic_years FROM academic_years;

-- Check that users table is unchanged:
-- SELECT COUNT(*) as total_users FROM users;

-- Check that all existing data is still accessible:
-- SELECT COUNT(*) FROM invoices WHERE deleted_at IS NULL;
-- SELECT COUNT(*) FROM marks WHERE deleted_at IS NULL;
-- SELECT COUNT(*) FROM student_payroll WHERE deleted_at IS NULL;

SET FOREIGN_KEY_CHECKS = 1;

-- ═════════════════════════════════════════════════════════════════════════════
-- MIGRATION COMPLETE
-- ═════════════════════════════════════════════════════════════════════════════
-- Table created successfully.
-- Data integrity: NO DATA MODIFIED (new table only, no cascading changes)
-- Next: Run API endpoints in backend/app/Controllers/UserModulePreferenceController.php
-- ═════════════════════════════════════════════════════════════════════════════

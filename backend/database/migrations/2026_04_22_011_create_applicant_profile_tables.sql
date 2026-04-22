-- Migration: 2026_04_22_011_create_applicant_profile_tables
-- Adds authenticated applicant profile layer on top of the existing
-- student_applications module.
--
-- Tables created / altered:
--   1. ALTER users           → add is_applicant flag
--   2. CREATE applicant_profiles         → extended per-applicant profile
--   3. CREATE applicant_academic_records → full academic history per profile
--   4. INSERT applicant role + MANAGE_OWN_PROFILE permission

SET FOREIGN_KEY_CHECKS = 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Mark applicant accounts in the users table
--    is_applicant = 1 → created via applicant self-registration
--    is_applicant = 0 (default) → staff / superadmin accounts
-- ─────────────────────────────────────────────────────────────────────────────
SET @col_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'is_applicant'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE `users` ADD COLUMN `is_applicant` TINYINT(1) NOT NULL DEFAULT 0 COMMENT \'1 = self-registered applicant; 0 = staff account\' AFTER `is_active`',
    'SELECT 1'
);
PREPARE _stmt FROM @sql; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. applicant_profiles — one per user/application pair
--    Created automatically when an applicant claims their account.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `applicant_profiles` (
    `id`                      INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id`                 INT UNSIGNED NOT NULL COMMENT 'FK → users.id',
    `application_id`          INT UNSIGNED NOT NULL COMMENT 'FK → student_applications.id',

    -- Extended personal info (optional — updated by the applicant)
    `middle_name`             VARCHAR(100) NULL,
    `id_type`                 ENUM('national_id','passport','birth_certificate') NULL,
    `id_number`               VARCHAR(50)  NULL,

    -- Location / address
    `province`                VARCHAR(100) NULL,
    `district`                VARCHAR(100) NULL,
    `sector`                  VARCHAR(100) NULL,

    -- Emergency contact
    `emergency_contact_name`  VARCHAR(150) NULL,
    `emergency_contact_phone` VARCHAR(30)  NULL,

    -- Profile photo (file-server UUID)
    `profile_photo_id`        VARCHAR(100) NULL,

    `created_at`              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_ap_user`               (`user_id`),
    UNIQUE KEY `uq_ap_application`        (`application_id`),
    INDEX       `idx_ap_user`             (`user_id`),

    CONSTRAINT `fk_ap_user`        FOREIGN KEY (`user_id`)        REFERENCES `users`(`id`)                ON DELETE CASCADE,
    CONSTRAINT `fk_ap_application` FOREIGN KEY (`application_id`) REFERENCES `student_applications`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. applicant_academic_records — full academic history per applicant
--    An applicant may have multiple records (secondary + higher diploma, etc.)
--    is_primary = 1 marks the record used as the merit-scoring record.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `applicant_academic_records` (
    `id`                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `applicant_profile_id` INT UNSIGNED NOT NULL COMMENT 'FK → applicant_profiles.id',

    `institution_name`    VARCHAR(255) NOT NULL,
    `qualification`       VARCHAR(150) NOT NULL COMMENT 'e.g. Rwanda Leaving Certificate, Diploma, Degree',
    `grade`               VARCHAR(50)  NOT NULL COMMENT 'Numeric % or letter grade',
    `combination`         VARCHAR(100) NULL     COMMENT 'A-level subject combination e.g. MCB, PCB',
    `year_completed`      YEAR         NOT NULL,
    `is_primary`          TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1 = record used for merit scoring',

    `created_at`          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    INDEX `idx_aar_profile` (`applicant_profile_id`),

    CONSTRAINT `fk_aar_profile` FOREIGN KEY (`applicant_profile_id`)
        REFERENCES `applicant_profiles`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Seed: applicant role + MANAGE_OWN_PROFILE permission
-- ─────────────────────────────────────────────────────────────────────────────

-- 4a. Ensure the permission category for "Applicant Portal" exists
INSERT IGNORE INTO `permission_categories` (`name`, `description`)
    VALUES ('Applicant Portal', 'Permissions for authenticated applicant self-service');

-- 4b. Seed the MANAGE_OWN_PROFILE permission under that category
SET @cat_id = (SELECT `id` FROM `permission_categories` WHERE `name` = 'Applicant Portal' LIMIT 1);
INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`)
    VALUES (
        @cat_id,
        'Manage Own Profile',
        'MANAGE_OWN_PROFILE',
        'Allows an applicant to view and update their own profile, academic records, and documents.'
    );

-- 4c. Ensure the "applicant" role exists
INSERT IGNORE INTO `roles` (`name`, `description`)
    VALUES ('applicant', 'Self-registered prospective student');

-- 4d. Assign MANAGE_OWN_PROFILE to the applicant role
SET @role_id = (SELECT `id` FROM `roles` WHERE `name` = 'applicant' LIMIT 1);
SET @perm_id = (SELECT `id` FROM `permissions` WHERE `slug` = 'MANAGE_OWN_PROFILE' LIMIT 1);
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
    VALUES (@role_id, @perm_id);

SET FOREIGN_KEY_CHECKS = 1;

-- Migration: 2026_04_22_009_create_admission_tables
-- Creates all tables for the Student Management / Admissions Module.
--
-- Notes:
--   - The legacy `application` and `application_documents` tables are renamed to
--     `legacy_application` / `legacy_application_documents` to free the names.
--   - All new tables use utf8mb4 and explicit FK constraints.
--   - `student_applications.academic_year_id` is auto-populated server-side from
--     the active academic year; applicants never submit it directly.
--   - Document requirements are configured per faculty + academic year by admins.

SET FOREIGN_KEY_CHECKS = 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- PRE-FLIGHT: ensure `programs` has a PRIMARY KEY (created without one)
-- ─────────────────────────────────────────────────────────────────────────────
SET @pk_exists = (
    SELECT COUNT(*)
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'programs'
      AND CONSTRAINT_TYPE = 'PRIMARY KEY'
);
SET @sql = IF(@pk_exists = 0, 'ALTER TABLE `programs` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE _stmt FROM @sql;
EXECUTE _stmt;
DEALLOCATE PREPARE _stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Rename legacy tables to avoid name conflicts
-- ─────────────────────────────────────────────────────────────────────────────
SET @t = (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'application');
SET @sql = IF(@t > 0, 'RENAME TABLE `application` TO `legacy_application`', 'SELECT 1');
PREPARE _stmt FROM @sql; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

SET @t = (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'application_documents');
SET @sql = IF(@t > 0, 'RENAME TABLE `application_documents` TO `legacy_application_documents`', 'SELECT 1');
PREPARE _stmt FROM @sql; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

SET @t = (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'application_options');
SET @sql = IF(@t > 0, 'RENAME TABLE `application_options` TO `legacy_application_options`', 'SELECT 1');
PREPARE _stmt FROM @sql; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. document_types  — global catalogue of possible document types
--    Admins manage this list. Actual requirements per faculty+year are in
--    admission_requirements.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `document_types` (
    `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name`        VARCHAR(120) NOT NULL,
    `slug`        VARCHAR(100) NOT NULL,
    `description` TEXT         NULL,
    `is_active`   TINYINT(1)   NOT NULL DEFAULT 1,
    `sort_order`  INT          NOT NULL DEFAULT 0,
    `created_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_document_types_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. admission_requirements  — per-faculty per-academic-year document checklist
--    Each row says: "for Faculty X in Year Y, document type Z is [required|optional]"
--    Admins configure this before the admission round opens.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `admission_requirements` (
    `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `faculty_id`       INT          NOT NULL,
    `academic_year_id` INT UNSIGNED NOT NULL,
    `document_type_id` INT UNSIGNED NOT NULL,
    `is_required`      TINYINT(1)   NOT NULL DEFAULT 1,
    `notes`            VARCHAR(255) NULL COMMENT 'Guidance shown to applicant (e.g. "Must be certified copy")',
    `sort_order`       INT          NOT NULL DEFAULT 0,
    `created_by`       INT UNSIGNED NULL,
    `created_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_ar_faculty_year_type` (`faculty_id`, `academic_year_id`, `document_type_id`),
    INDEX `idx_ar_faculty_year` (`faculty_id`, `academic_year_id`),
    CONSTRAINT `fk_ar_academic_year`  FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_ar_document_type`  FOREIGN KEY (`document_type_id`) REFERENCES `document_types`(`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_ar_created_by`     FOREIGN KEY (`created_by`)       REFERENCES `users`(`id`)          ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. student_applications  — central application record (state machine)
--
--    Hierarchy: school → faculty → department → program
--    faculty_id is stored directly for fast querying and to support
--    faculty-specific document requirements.
--    academic_year_id is set server-side from the active academic year.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `student_applications` (
    `id`                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `application_number` VARCHAR(20)  NOT NULL,

    -- Institutional context (server-set)
    `academic_year_id`   INT UNSIGNED NOT NULL,
    `faculty_id`         INT          NOT NULL COMMENT 'FK → faculty.fac_id',
    `program_id`         INT UNSIGNED NOT NULL,
    `intake`             VARCHAR(20)  NOT NULL COMMENT 'e.g. "2026-A", "2026-B"',

    -- Personal information
    `first_name`         VARCHAR(100) NOT NULL,
    `last_name`          VARCHAR(100) NOT NULL,
    `email`              VARCHAR(150) NOT NULL,
    `phone`              VARCHAR(30)  NOT NULL,
    `gender`             ENUM('M','F','Other') NOT NULL,
    `birthdate`          DATE         NOT NULL,
    `nationality`        VARCHAR(100) NOT NULL DEFAULT 'Rwandan',
    `address`            TEXT         NULL,

    -- Academic background
    `prev_school`        VARCHAR(255) NOT NULL,
    `prev_qualification` VARCHAR(150) NOT NULL COMMENT 'e.g. "Rwanda Leaving Certificate", "Diploma"',
    `prev_grade`         VARCHAR(50)  NOT NULL COMMENT 'Numeric % or letter grade; used for merit scoring',
    `combination`        VARCHAR(100) NULL     COMMENT 'A-level combination e.g. MCB, PCB, HEG',
    `graduation_year`    YEAR         NOT NULL,

    -- Sponsorship (important for Rwandan context)
    `sponsorship`        ENUM('government','self','private','scholarship') NOT NULL DEFAULT 'self',
    `sponsor_name`       VARCHAR(150) NULL COMMENT 'Filled when sponsorship = private or scholarship',

    -- State machine
    `status` ENUM(
        'draft',
        'submitted',
        'documents_under_review',
        'documents_verified',
        'documents_rejected',
        'merit_listed',
        'offered',
        'offer_accepted',
        'offer_declined',
        'enrolled',
        'withdrawn'
    ) NOT NULL DEFAULT 'draft',

    `document_status` ENUM(
        'incomplete',
        'under_review',
        'verified',
        'rejected'
    ) NOT NULL DEFAULT 'incomplete',

    -- Merit scoring (populated during merit list generation)
    `merit_score`        DECIMAL(8,4) NULL,
    `merit_rank`         INT          NULL,

    -- Tracking
    `submitted_at`       TIMESTAMP    NULL,
    `reviewed_by`        INT UNSIGNED NULL,
    `reviewed_at`        TIMESTAMP    NULL,
    `internal_notes`     TEXT         NULL COMMENT 'Admin-only notes, never shown to applicant',
    `rejection_reason`   TEXT         NULL COMMENT 'Shown to applicant if overall rejected',
    `ip_address`         VARCHAR(45)  NULL,

    `created_at`         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_application_number` (`application_number`),
    INDEX `idx_sa_email`           (`email`),
    INDEX `idx_sa_status`          (`status`),
    INDEX `idx_sa_faculty_year`    (`faculty_id`, `academic_year_id`),
    INDEX `idx_sa_program_intake`  (`program_id`, `intake`),

    CONSTRAINT `fk_sa_program`     FOREIGN KEY (`program_id`)       REFERENCES `programs`(`id`)        ON DELETE RESTRICT,
    CONSTRAINT `fk_sa_acad_year`   FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_sa_reviewer`    FOREIGN KEY (`reviewed_by`)      REFERENCES `users`(`id`)           ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. application_documents  — uploaded files per application (one per type)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `application_documents` (
    `id`                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `application_id`      INT UNSIGNED NOT NULL,
    `document_type_id`    INT UNSIGNED NOT NULL,
    `file_server_id`      VARCHAR(100) NULL COMMENT 'UUID returned by the file-server service',
    `file_original_name`  VARCHAR(255) NULL,
    `file_size`           INT          NULL COMMENT 'bytes',
    `file_mime`           VARCHAR(100) NULL,
    `verification_status` ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
    `verified_by`         INT UNSIGNED NULL,
    `verified_at`         TIMESTAMP    NULL,
    `rejection_notes`     TEXT         NULL,
    `uploaded_at`         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_app_doctype` (`application_id`, `document_type_id`),

    CONSTRAINT `fk_ad_application`   FOREIGN KEY (`application_id`)   REFERENCES `student_applications`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_ad_document_type` FOREIGN KEY (`document_type_id`) REFERENCES `document_types`(`id`)       ON DELETE RESTRICT,
    CONSTRAINT `fk_ad_verified_by`   FOREIGN KEY (`verified_by`)      REFERENCES `users`(`id`)                ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. application_status_log  — immutable audit trail of every status transition
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `application_status_log` (
    `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `application_id` INT UNSIGNED NOT NULL,
    `from_status`    VARCHAR(50)  NULL,
    `to_status`      VARCHAR(50)  NOT NULL,
    `actor_id`       INT UNSIGNED NULL,
    `actor_type`     ENUM('applicant','admin','system') NOT NULL DEFAULT 'system',
    `notes`          TEXT         NULL,
    `created_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    INDEX `idx_asl_application` (`application_id`),

    CONSTRAINT `fk_asl_application` FOREIGN KEY (`application_id`) REFERENCES `student_applications`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_asl_actor`       FOREIGN KEY (`actor_id`)       REFERENCES `users`(`id`)                ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. merit_criteria  — scoring weights per program + intake + academic year
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `merit_criteria` (
    `id`                    INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    `program_id`            INT UNSIGNED  NOT NULL,
    `intake`                VARCHAR(20)   NOT NULL,
    `academic_year_id`      INT UNSIGNED  NOT NULL,
    `grade_weight`          DECIMAL(5,2)  NOT NULL DEFAULT 60.00  COMMENT '% contribution of academic grade to score',
    `combination_weight`    DECIMAL(5,2)  NOT NULL DEFAULT 30.00  COMMENT '% contribution of subject combination',
    `other_weight`          DECIMAL(5,2)  NOT NULL DEFAULT 10.00  COMMENT 'Reserved for future factors',
    `min_grade`             VARCHAR(50)   NULL     COMMENT 'Minimum grade to qualify (numeric or letter)',
    `required_combinations` TEXT          NULL     COMMENT 'JSON array of accepted A-level combinations',
    `cutoff_score`          DECIMAL(8,4)  NULL     COMMENT 'Minimum computed merit score to qualify',
    `max_capacity`          INT           NULL     COMMENT 'Maximum students to offer admission',
    `is_published`          TINYINT(1)    NOT NULL DEFAULT 0,
    `created_by`            INT UNSIGNED  NULL,
    `created_at`            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_mc_program_intake_year` (`program_id`, `intake`, `academic_year_id`),

    CONSTRAINT `fk_mc_program`    FOREIGN KEY (`program_id`)       REFERENCES `programs`(`id`)        ON DELETE RESTRICT,
    CONSTRAINT `fk_mc_acad_year`  FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_mc_created_by` FOREIGN KEY (`created_by`)       REFERENCES `users`(`id`)           ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. merit_lists  — ranked snapshot of applicants per program + intake + year
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `merit_lists` (
    `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `program_id`       INT UNSIGNED NOT NULL,
    `intake`           VARCHAR(20)  NOT NULL,
    `academic_year_id` INT UNSIGNED NOT NULL,
    `application_id`   INT UNSIGNED NOT NULL,
    `merit_score`      DECIMAL(8,4) NOT NULL,
    `rank`             INT          NOT NULL,
    `is_qualified`     TINYINT(1)   NOT NULL DEFAULT 0,
    `generated_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `generated_by`     INT UNSIGNED NULL,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_ml_app_program_intake` (`application_id`, `program_id`, `intake`),
    INDEX `idx_ml_program_intake` (`program_id`, `intake`, `academic_year_id`),

    CONSTRAINT `fk_ml_application`  FOREIGN KEY (`application_id`) REFERENCES `student_applications`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_ml_generated_by` FOREIGN KEY (`generated_by`)   REFERENCES `users`(`id`)                ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. admission_offers  — formal offer linked to an accepted application
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `admission_offers` (
    `id`                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `application_id`         INT UNSIGNED NOT NULL,
    `offer_letter_reference` VARCHAR(50)  NOT NULL,
    `offered_at`             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `offered_by`             INT UNSIGNED NULL,
    `expires_at`             DATE         NOT NULL,
    `status`                 ENUM('pending','accepted','declined','expired') NOT NULL DEFAULT 'pending',
    `responded_at`           TIMESTAMP    NULL,
    `response_notes`         TEXT         NULL,
    `enrollment_initiated`   TINYINT(1)   NOT NULL DEFAULT 0,
    `student_id`             INT          NULL COMMENT 'Populated after enrollment; references student.id',
    `enrolled_at`            TIMESTAMP    NULL,
    `updated_at`             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_ao_application`     (`application_id`),
    UNIQUE KEY `uq_ao_offer_reference` (`offer_letter_reference`),

    CONSTRAINT `fk_ao_application` FOREIGN KEY (`application_id`) REFERENCES `student_applications`(`id`) ON DELETE RESTRICT,
    CONSTRAINT `fk_ao_offered_by`  FOREIGN KEY (`offered_by`)     REFERENCES `users`(`id`)                ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

SET FOREIGN_KEY_CHECKS = 1;

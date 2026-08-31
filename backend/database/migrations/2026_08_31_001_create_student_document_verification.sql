-- Migration: 2026_08_31_001_create_student_document_verification
-- Creates tables for Registry staff to verify student documents by programme
-- Enables tracking of verified, missing, and pending documents per student
--
-- Tables:
--   - student_document_requirements  — required documents per student programme
--   - student_document_verification  — verification status per requirement

SET FOREIGN_KEY_CHECKS = 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. student_document_requirements  — per-student per-programme document checklist
--    Defines which documents a student must provide based on their programme type
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `student_document_requirements` (
    `id`                INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `student_id`        INT UNSIGNED NOT NULL,
    `programme_type`    ENUM('UNDERGRADUATE', 'MASTERS', 'PGDE') NOT NULL COMMENT 'Programme classification',
    `document_name`     VARCHAR(255) NOT NULL COMMENT 'Required document name (e.g. "Notarized A2 or equivalent")',
    `is_active`         TINYINT(1)   NOT NULL DEFAULT 1,
    `sort_order`        INT          NOT NULL DEFAULT 0,
    `created_at`        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_sdr_student` (`student_id`),
    INDEX `idx_sdr_student_programme` (`student_id`, `programme_type`),
    CONSTRAINT `fk_sdr_student` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. student_document_verification  — verification status of each required document
--    State: NULL (not checked), true (verified), false (missing)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `student_document_verification` (
    `id`                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `requirement_id`      INT UNSIGNED NOT NULL,
    `verified_status`     TINYINT(1)   NULL COMMENT 'NULL = not checked, 1 = verified, 0 = missing',
    `verified_by`         INT UNSIGNED NULL COMMENT 'User ID of Registry officer who verified',
    `verified_at`         TIMESTAMP    NULL COMMENT 'Date and time of verification',
    `notes`               TEXT         NULL COMMENT 'Additional notes about verification',
    `created_at`          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_sdv_requirement` (`requirement_id`),
    INDEX `idx_sdv_verified_by` (`verified_by`),
    INDEX `idx_sdv_verified_at` (`verified_at`),
    CONSTRAINT `fk_sdv_requirement` FOREIGN KEY (`requirement_id`) REFERENCES `student_document_requirements`(`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_sdv_verified_by` FOREIGN KEY (`verified_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

SET FOREIGN_KEY_CHECKS = 1;

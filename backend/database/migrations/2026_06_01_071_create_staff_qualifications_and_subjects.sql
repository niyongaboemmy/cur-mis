-- ============================================================
-- Migration: 071 — Faculty Qualifications & Credentials Tracking
-- Date: 2026-06-01
-- Closes Gap 7 (Faculty Profile Management): adds structured
-- capture of academic qualifications, professional certifications
-- and teaching subjects / specialisations for HR staff profiles.
--
-- Tables: staff_qualifications, staff_subjects
-- Both are keyed by employees.employee_id.
-- ============================================================

-- ── 1. Qualifications & Credentials ──────────────────────────
-- Holds academic degrees AND professional certifications, told
-- apart by `qual_type`. Certification-only fields (expiry_date,
-- reference_no) are nullable so the same table serves both.
CREATE TABLE IF NOT EXISTS `staff_qualifications` (
    `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `employee_id`    INT          NOT NULL,
    `qual_type`      ENUM('Degree','Certification','Other') NOT NULL DEFAULT 'Degree',
    `title`          VARCHAR(200) NOT NULL COMMENT 'e.g. PhD in Computer Science / AWS Solutions Architect',
    `field_of_study` VARCHAR(200) DEFAULT NULL,
    `institution`    VARCHAR(200) DEFAULT NULL COMMENT 'Awarding university / issuing body',
    `year_obtained`  SMALLINT     DEFAULT NULL,
    `grade`          VARCHAR(60)  DEFAULT NULL COMMENT 'e.g. First Class, Distinction, GPA 3.8',
    `reference_no`   VARCHAR(120) DEFAULT NULL COMMENT 'Certificate / licence number',
    `expiry_date`    DATE         DEFAULT NULL COMMENT 'For certifications that lapse',
    `document_url`   VARCHAR(500) DEFAULT NULL,
    `notes`          VARCHAR(500) DEFAULT NULL,
    `created_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_staff_qual_emp` (`employee_id`, `qual_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 2. Teaching Subjects / Specialisations ───────────────────
CREATE TABLE IF NOT EXISTS `staff_subjects` (
    `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `employee_id`      INT          NOT NULL,
    `subject_name`     VARCHAR(200) NOT NULL,
    `proficiency`      ENUM('Beginner','Intermediate','Advanced','Expert') NOT NULL DEFAULT 'Advanced',
    `years_experience` SMALLINT     DEFAULT NULL,
    `is_primary`       TINYINT(1)   NOT NULL DEFAULT 0 COMMENT 'Primary teaching specialisation',
    `notes`            VARCHAR(500) DEFAULT NULL,
    `created_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_staff_subj_emp` (`employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

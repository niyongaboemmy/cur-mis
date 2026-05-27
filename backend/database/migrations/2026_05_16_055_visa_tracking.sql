-- ============================================================
-- Migration 055 — International student visa tracking.
-- Adds student_visa_records (renewable history) and per-student fields
-- for international flag + assigned registry officer.
-- ============================================================

CREATE TABLE IF NOT EXISTS `student_visa_records` (
    `id`                INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `student_id`        INT(11)          NOT NULL,
    `country_of_origin` VARCHAR(100)     NOT NULL,
    `entry_date`        DATE             NOT NULL,
    `visa_issue_date`   DATE             NOT NULL,
    `visa_expiry_date`  DATE             NOT NULL,
    `visa_type`         VARCHAR(100)     DEFAULT NULL,
    `notes`             VARCHAR(500)     DEFAULT NULL,
    `is_current`        TINYINT(1)       NOT NULL DEFAULT 1,
    `created_by`        INT(10) UNSIGNED DEFAULT NULL,
    `created_at`        TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_visa_student`  (`student_id`),
    KEY `idx_visa_current`  (`is_current`),
    KEY `idx_visa_expiry`   (`visa_expiry_date`),
    CONSTRAINT `fk_visa_student`  FOREIGN KEY (`student_id`) REFERENCES `student` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_visa_creator`  FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student' AND COLUMN_NAME = 'assigned_registry_user_id');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student` ADD COLUMN `assigned_registry_user_id` INT(10) UNSIGNED NULL DEFAULT NULL',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student' AND COLUMN_NAME = 'is_international');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student` ADD COLUMN `is_international` TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

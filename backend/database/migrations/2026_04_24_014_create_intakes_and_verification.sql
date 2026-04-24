-- Migration: Create intakes lookup table and add email verification columns
-- to student_applications. Idempotent — safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. intakes lookup table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `intakes` (
    `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name`       VARCHAR(50)  NOT NULL,
    `start_date` DATE         NOT NULL,
    `end_date`   DATE         NOT NULL,
    `is_active`  TINYINT(1)   NOT NULL DEFAULT 1,
    `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_intakes_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed default intakes (UNIQUE(name) guarantees no duplicates on re-run)
INSERT IGNORE INTO `intakes` (`name`, `start_date`, `end_date`, `is_active`) VALUES
('2026-A (January)', '2026-01-01', '2026-06-30', 1),
('2026-B (August)',  '2026-08-01', '2026-12-31', 1);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Add email_verified and verification_code to student_applications
-- ─────────────────────────────────────────────────────────────────────────────
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications'
              AND COLUMN_NAME = 'email_verified');
SET @sql = IF(@col = 0,
    'ALTER TABLE `student_applications` ADD COLUMN `email_verified` TINYINT(1) NOT NULL DEFAULT 0 AFTER `status`',
    'SELECT 1');
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications'
              AND COLUMN_NAME = 'verification_code');
SET @sql = IF(@col = 0,
    'ALTER TABLE `student_applications` ADD COLUMN `verification_code` VARCHAR(10) DEFAULT NULL AFTER `email_verified`',
    'SELECT 1');
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

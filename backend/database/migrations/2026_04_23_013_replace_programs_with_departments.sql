-- Migration: Replace programs table with departements as the program/department
-- hierarchy anchor for admissions. The MIS now treats the department
-- (departements.dep_id) as the unit an applicant applies to — programs are a
-- catalogue/curriculum concept and no longer referenced from admissions.
--
-- This migration is idempotent and safe on a database that still has the
-- original program_id columns + FKs. It:
--   1. Adds a nullable `department_id` column alongside the existing
--      `program_id` in each affected table.
--   2. Backfills `department_id` from `programs.department_id`.
--   3. Drops the legacy FK / indexes on `program_id`.
--   4. Drops the `program_id` column.
--   5. Makes `department_id` NOT NULL and installs the new FK to
--      `departements.dep_id`.
--   6. Drops the `programs` table last, once nothing references it.
--
-- Date: 2026-04-23

SET FOREIGN_KEY_CHECKS = 0;

-- ── Helper: conditional ALTER (idempotent) ──────────────────────────────────
-- We use prepared statements throughout so the same file can be re-run safely.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. student_applications
-- ─────────────────────────────────────────────────────────────────────────────

-- 1a. Add department_id nullable if missing
SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications'
              AND COLUMN_NAME = 'department_id');
SET @sql = IF(@col = 0,
    'ALTER TABLE `student_applications` ADD COLUMN `department_id` INT NULL AFTER `faculty_id`',
    'SELECT 1');
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

-- 1b. Backfill department_id from programs.department_id where still present
SET @has_prog = (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications'
                   AND COLUMN_NAME = 'program_id');
SET @sql = IF(@has_prog > 0,
    'UPDATE `student_applications` sa JOIN `programs` p ON p.id = sa.program_id SET sa.department_id = p.department_id WHERE sa.department_id IS NULL',
    'SELECT 1');
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

-- 1c. Drop FK on program_id if present
SET @fk = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications'
             AND CONSTRAINT_NAME = 'fk_sa_program');
SET @sql = IF(@fk > 0, 'ALTER TABLE `student_applications` DROP FOREIGN KEY `fk_sa_program`', 'SELECT 1');
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

-- 1d. Drop old program_intake index
SET @ix = (SELECT COUNT(*) FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications'
             AND INDEX_NAME = 'idx_sa_program_intake');
SET @sql = IF(@ix > 0, 'ALTER TABLE `student_applications` DROP INDEX `idx_sa_program_intake`', 'SELECT 1');
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

-- 1e. Drop program_id column
SET @sql = IF(@has_prog > 0, 'ALTER TABLE `student_applications` DROP COLUMN `program_id`', 'SELECT 1');
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

-- 1f. Enforce NOT NULL + add new FK + index on department_id
ALTER TABLE `student_applications`
    MODIFY `department_id` INT NOT NULL;

SET @ix = (SELECT COUNT(*) FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications'
             AND INDEX_NAME = 'idx_sa_dept_intake');
SET @sql = IF(@ix = 0,
    'ALTER TABLE `student_applications` ADD INDEX `idx_sa_dept_intake` (`department_id`, `intake`)',
    'SELECT 1');
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @fk = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications'
             AND CONSTRAINT_NAME = 'fk_sa_dept');
SET @sql = IF(@fk = 0,
    'ALTER TABLE `student_applications` ADD CONSTRAINT `fk_sa_dept` FOREIGN KEY (`department_id`) REFERENCES `departements`(`dep_id`)',
    'SELECT 1');
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. merit_criteria — same dance
-- ─────────────────────────────────────────────────────────────────────────────

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merit_criteria'
              AND COLUMN_NAME = 'department_id');
SET @sql = IF(@col = 0,
    'ALTER TABLE `merit_criteria` ADD COLUMN `department_id` INT NULL AFTER `id`',
    'SELECT 1');
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @has_prog = (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merit_criteria'
                   AND COLUMN_NAME = 'program_id');
SET @sql = IF(@has_prog > 0,
    'UPDATE `merit_criteria` mc JOIN `programs` p ON p.id = mc.program_id SET mc.department_id = p.department_id WHERE mc.department_id IS NULL',
    'SELECT 1');
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @fk = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merit_criteria'
             AND CONSTRAINT_NAME = 'fk_mc_program');
SET @sql = IF(@fk > 0, 'ALTER TABLE `merit_criteria` DROP FOREIGN KEY `fk_mc_program`', 'SELECT 1');
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @ix = (SELECT COUNT(*) FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merit_criteria'
             AND INDEX_NAME = 'uq_mc_program_intake_year');
SET @sql = IF(@ix > 0, 'ALTER TABLE `merit_criteria` DROP INDEX `uq_mc_program_intake_year`', 'SELECT 1');
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @sql = IF(@has_prog > 0, 'ALTER TABLE `merit_criteria` DROP COLUMN `program_id`', 'SELECT 1');
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

ALTER TABLE `merit_criteria`
    MODIFY `department_id` INT NOT NULL;

SET @ix = (SELECT COUNT(*) FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merit_criteria'
             AND INDEX_NAME = 'uq_mc_dept_intake_year');
SET @sql = IF(@ix = 0,
    'ALTER TABLE `merit_criteria` ADD UNIQUE KEY `uq_mc_dept_intake_year` (`department_id`, `intake`, `academic_year_id`)',
    'SELECT 1');
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @fk = (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merit_criteria'
             AND CONSTRAINT_NAME = 'fk_mc_dept');
SET @sql = IF(@fk = 0,
    'ALTER TABLE `merit_criteria` ADD CONSTRAINT `fk_mc_dept` FOREIGN KEY (`department_id`) REFERENCES `departements`(`dep_id`)',
    'SELECT 1');
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. merit_lists — same dance
-- ─────────────────────────────────────────────────────────────────────────────

SET @col = (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merit_lists'
              AND COLUMN_NAME = 'department_id');
SET @sql = IF(@col = 0,
    'ALTER TABLE `merit_lists` ADD COLUMN `department_id` INT NULL AFTER `id`',
    'SELECT 1');
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @has_prog = (SELECT COUNT(*) FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merit_lists'
                   AND COLUMN_NAME = 'program_id');
SET @sql = IF(@has_prog > 0,
    'UPDATE `merit_lists` ml JOIN `programs` p ON p.id = ml.program_id SET ml.department_id = p.department_id WHERE ml.department_id IS NULL',
    'SELECT 1');
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

-- Add a standalone index so fk_ml_application has an index to rely on
-- before we drop the unique key that currently covers application_id.
SET @ix = (SELECT COUNT(*) FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merit_lists'
             AND INDEX_NAME = 'idx_ml_application_id');
SET @sql = IF(@ix = 0,
    'ALTER TABLE `merit_lists` ADD INDEX `idx_ml_application_id` (`application_id`)',
    'SELECT 1');
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @ix = (SELECT COUNT(*) FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merit_lists'
             AND INDEX_NAME = 'uq_ml_app_program_intake');
SET @sql = IF(@ix > 0, 'ALTER TABLE `merit_lists` DROP INDEX `uq_ml_app_program_intake`', 'SELECT 1');
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @ix = (SELECT COUNT(*) FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merit_lists'
             AND INDEX_NAME = 'idx_ml_program_intake');
SET @sql = IF(@ix > 0, 'ALTER TABLE `merit_lists` DROP INDEX `idx_ml_program_intake`', 'SELECT 1');
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @sql = IF(@has_prog > 0, 'ALTER TABLE `merit_lists` DROP COLUMN `program_id`', 'SELECT 1');
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

ALTER TABLE `merit_lists`
    MODIFY `department_id` INT NOT NULL;

SET @ix = (SELECT COUNT(*) FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merit_lists'
             AND INDEX_NAME = 'uq_ml_app_dept_intake');
SET @sql = IF(@ix = 0,
    'ALTER TABLE `merit_lists` ADD UNIQUE KEY `uq_ml_app_dept_intake` (`application_id`, `department_id`, `intake`)',
    'SELECT 1');
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

SET @ix = (SELECT COUNT(*) FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merit_lists'
             AND INDEX_NAME = 'idx_ml_dept_intake');
SET @sql = IF(@ix = 0,
    'ALTER TABLE `merit_lists` ADD INDEX `idx_ml_dept_intake` (`department_id`, `intake`, `academic_year_id`)',
    'SELECT 1');
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

-- Clean up the temporary standalone index now covered by the unique key
SET @ix = (SELECT COUNT(*) FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'merit_lists'
             AND INDEX_NAME = 'idx_ml_application_id');
SET @sql = IF(@ix > 0, 'ALTER TABLE `merit_lists` DROP INDEX `idx_ml_application_id`', 'SELECT 1');
PREPARE _s FROM @sql; EXECUTE _s; DEALLOCATE PREPARE _s;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Drop programs table — nothing references it anymore
-- ─────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS `programs`;

SET FOREIGN_KEY_CHECKS = 1;

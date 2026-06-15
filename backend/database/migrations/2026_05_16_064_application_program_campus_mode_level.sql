-- ============================================================
-- Migration 064 — Backfill schema for the apply-wizard step 3.
--
-- The applicant's "Programme" step writes program_id (FK
-- options.id), campus_id (FK campuses.id), mode_of_study (Day /
-- Evening / Weekend) and level_id (FK levels.id) onto the
-- student_applications row. These columns have lived in the
-- production DB for months (originally added by hand) but no
-- migration ever created them, so a fresh deployment running
-- `migrate.php` ends up with a broken applications flow:
--
--   - StudentApplicationModel marks all four as fillable
--   - ApplicationAdminController filters by mode_of_study /
--     campus_id / level_id
--   - The bulk-import and PDF-export paths join through
--     `options` / `campuses` / `levels` via these FKs
--
-- This migration creates the four columns idempotently so the
-- branch is self-contained.
--
-- Also adds `student.updated_at` — required by the bulk
-- campus-reassign endpoint introduced on this branch
-- (`UPDATE student SET campus = ?, updated_at = NOW() …`),
-- which silently fails on a fresh DB today.
--
-- All statements idempotent — safe to re-run.
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- §1. student_applications: program / campus / mode / level
-- ───────────────────────────────────────────────────────────

-- program_id → options.id (the catalogue programme the applicant chose)
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 'student_applications'
               AND COLUMN_NAME  = 'program_id');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student_applications` ADD COLUMN `program_id` INT UNSIGNED NULL DEFAULT NULL AFTER `department_id`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- campus_id → campuses.id (the campus the applicant picked)
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 'student_applications'
               AND COLUMN_NAME  = 'campus_id');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student_applications` ADD COLUMN `campus_id` INT UNSIGNED NULL DEFAULT NULL AFTER `program_id`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- mode_of_study — Day / Evening / Weekend / Distance Learning
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 'student_applications'
               AND COLUMN_NAME  = 'mode_of_study');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student_applications` ADD COLUMN `mode_of_study` VARCHAR(40) NULL DEFAULT NULL AFTER `campus_id`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- level_id → levels.id (programme level — undergraduate, masters, …)
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 'student_applications'
               AND COLUMN_NAME  = 'level_id');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student_applications` ADD COLUMN `level_id` INT UNSIGNED NULL DEFAULT NULL AFTER `mode_of_study`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Indices powering the admin filters + JOINs.
SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 'student_applications'
               AND INDEX_NAME   = 'idx_sa_program_level');
SET @stmt := IF(@idx = 0,
  'ALTER TABLE `student_applications` ADD INDEX `idx_sa_program_level` (`program_id`, `level_id`)',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 'student_applications'
               AND INDEX_NAME   = 'idx_sa_campus_mode');
SET @stmt := IF(@idx = 0,
  'ALTER TABLE `student_applications` ADD INDEX `idx_sa_campus_mode` (`campus_id`, `mode_of_study`)',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ───────────────────────────────────────────────────────────
-- §2. student.updated_at — bulk-campus reassign endpoint
-- ───────────────────────────────────────────────────────────
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 'student'
               AND COLUMN_NAME  = 'updated_at');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

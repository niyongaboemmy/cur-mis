-- ============================================================
-- Migration: Classify students into application categories
-- (Undergraduate / Postgraduate / Masters)
--
-- WHY
-- ───
-- Registration numbers already encode a tier in their leading digit
-- (1CUR… = undergraduate, 2CUR… = postgraduate/masters), but there was
-- no clean, structured column to classify a student by that same
-- category — only the free-text `student.category` (messy: "under
-- graduate", "xx", "FULL-TIME", …) and the finer-grained
-- `programme_level` ENUM (undergraduate/pgde/masters/phd/diploma/
-- certificate), which doesn't map 1:1 onto the 3 categories the
-- application process actually cares about.
--
-- This migration adds `programme_category` to both `student` and
-- `student_applications`, and backfills existing students from their
-- already-issued `programme_level` (falling back to the regnumber
-- prefix when programme_level is unreliable/missing).
--
-- All statements idempotent — safe to re-run.
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- §1. student.programme_category
-- ───────────────────────────────────────────────────────────
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 'student'
               AND COLUMN_NAME  = 'programme_category');
SET @stmt := IF(@col = 0,
  "ALTER TABLE `student` ADD COLUMN `programme_category` ENUM('undergraduate','postgraduate','masters') NULL DEFAULT NULL AFTER `programme_level`",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 'student'
               AND INDEX_NAME   = 'idx_student_programme_category');
SET @stmt := IF(@idx = 0,
  'ALTER TABLE `student` ADD INDEX `idx_student_programme_category` (`programme_category`)',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ───────────────────────────────────────────────────────────
-- §2. student_applications.programme_category
-- (captured from the applicant's welcome-screen selection)
-- ───────────────────────────────────────────────────────────
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 'student_applications'
               AND COLUMN_NAME  = 'programme_category');
SET @stmt := IF(@col = 0,
  "ALTER TABLE `student_applications` ADD COLUMN `programme_category` ENUM('undergraduate','postgraduate','masters') NULL DEFAULT NULL AFTER `department_id`",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ───────────────────────────────────────────────────────────
-- §3. Backfill existing students.
--
-- `programme_level` turns out to be unreliable in production: it is
-- 'undergraduate' for every single row in the live dataset, including
-- students whose own registration number already carries the '2CUR'
-- postgraduate/masters prefix (confirming the level_name-guessing bug
-- described in ApplicationService::initiateEnrollment()). So the
-- registration number's leading digit is the PRIMARY signal here, not
-- programme_level. The legacy free-text `category` column is checked
-- next for an explicit 'postgraduate' mention (found on the majority
-- of '2CUR' rows) — nothing in the current data distinguishes
-- 'masters' from generic 'postgraduate' among the '2CUR' rows, so
-- those default to 'postgraduate' as the closest defensible bucket.
-- ───────────────────────────────────────────────────────────
UPDATE `student`
   SET `programme_category` = 'undergraduate'
 WHERE `programme_category` IS NULL
   AND `regnumber` REGEXP '^1CUR';

UPDATE `student`
   SET `programme_category` = 'masters'
 WHERE `programme_category` IS NULL
   AND `regnumber` REGEXP '^2CUR'
   AND `programme_level` = 'masters';

UPDATE `student`
   SET `programme_category` = 'postgraduate'
 WHERE `programme_category` IS NULL
   AND `regnumber` REGEXP '^2CUR';

-- Legacy/malformed registration numbers that don't start with 1CUR/2CUR
-- (hand-entered imports, typos, etc.) — fall back to programme_level,
-- then to the legacy `category` text, then default to undergraduate.
UPDATE `student`
   SET `programme_category` = 'masters'
 WHERE `programme_category` IS NULL
   AND `programme_level` = 'masters';

UPDATE `student`
   SET `programme_category` = 'postgraduate'
 WHERE `programme_category` IS NULL
   AND (`programme_level` IN ('pgde','phd') OR `category` LIKE '%postgraduate%');

UPDATE `student`
   SET `programme_category` = 'undergraduate'
 WHERE `programme_category` IS NULL;

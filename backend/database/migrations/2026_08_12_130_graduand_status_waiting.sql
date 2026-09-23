-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 130: graduand status vocabulary + one row per student.
-- Date: 2026-08-12
--
-- 1. `status` becomes ENUM('waiting','pending','approved','graduated') with
--    'waiting' as the default, replacing 'deferred'. A student who has finished
--    their curriculum but whom nobody has actioned yet is *waiting*, which is
--    also how the roster renders a student with no row here at all — the two
--    read identically on screen, so bulk-setting a status never has to care
--    which of the two it started from.
--
-- 2. UNIQUE KEY on `student_id`. Two things need it:
--      • the graduation roster LEFT JOINs `graduands` per student, so a second
--        row for the same student would silently duplicate them in the list;
--      • the bulk status update upserts with ON DUPLICATE KEY UPDATE, which
--        needs a unique index to match against.
--    Duplicates are collapsed first, keeping the furthest-progressed row.
--
-- Idempotent and portable — INFORMATION_SCHEMA guards rather than MariaDB-only
-- `IF NOT EXISTS`, which is a 1064 syntax error on the local MySQL 8.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Widen the enum so both old and new values are legal at once.
SET @t := (SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'graduands'
             AND COLUMN_NAME = 'status');

SET @sql := IF(@t LIKE '%waiting%', 'SELECT 1',
  "ALTER TABLE `graduands` MODIFY `status`
     ENUM('waiting','pending','approved','graduated','deferred')
     NOT NULL DEFAULT 'waiting'");
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── 2. Retire 'deferred'. A deferred graduand is one waiting to be actioned.
UPDATE `graduands` SET `status` = 'waiting' WHERE `status` = 'deferred';

-- ── 3. Narrow the enum to the four statuses the workflow now uses.
SET @t := (SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'graduands'
             AND COLUMN_NAME = 'status');

SET @sql := IF(@t LIKE '%deferred%',
  "ALTER TABLE `graduands` MODIFY `status`
     ENUM('waiting','pending','approved','graduated')
     NOT NULL DEFAULT 'waiting'",
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── 4. Collapse any duplicate rows per student before the unique key lands.
--    Ranking keeps the furthest-progressed record; `id` breaks ties so the
--    result is deterministic.
DELETE g FROM `graduands` g
JOIN `graduands` keep
  ON keep.student_id = g.student_id
 AND (
      FIELD(keep.status, 'waiting', 'pending', 'approved', 'graduated')
        > FIELD(g.status, 'waiting', 'pending', 'approved', 'graduated')
   OR (FIELD(keep.status, 'waiting', 'pending', 'approved', 'graduated')
        = FIELD(g.status, 'waiting', 'pending', 'approved', 'graduated')
       AND keep.id > g.id)
 );

-- ── 5. One graduand record per student.
SET @u := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'graduands'
             AND INDEX_NAME = 'uniq_graduands_student');

SET @sql := IF(@u = 0,
  'ALTER TABLE `graduands` ADD UNIQUE KEY `uniq_graduands_student` (`student_id`)',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── 6. The plain index from migration 129 is now redundant — the unique key
--    above serves the same lookups as its leftmost prefix.
SET @i := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'graduands'
             AND INDEX_NAME = 'idx_graduands_student');

SET @sql := IF(@i > 0,
  'ALTER TABLE `graduands` DROP INDEX `idx_graduands_student`',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

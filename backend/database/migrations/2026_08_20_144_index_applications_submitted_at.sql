-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 144: index `student_applications.submitted_at`.
-- Date: 2026-08-20
--
-- WHY
-- ───
-- The August 2026 registry report asked for a From/To filter on the
-- applications list and on every report built from it. That filter ranges on
-- `submitted_at`, which carried no index of its own — `SHOW INDEX` listed
-- status, faculty+year, dept+intake, is_hidden, program+level, campus+mode and
-- enrolled_student_id, but nothing on the submission date.
--
-- Without it, every date-filtered list, export and statistics query is a full
-- scan of the applications table, and each one runs a COUNT(*) over the same
-- predicate for the pagination footer.
--
-- The filter is deliberately written as a half-open range
--   submitted_at >= '2026-08-01 00:00:00' AND submitted_at < '2026-08-21 00:00:00'
-- rather than DATE(submitted_at) BETWEEN ... — a function on the column would
-- make this index unusable, which is the whole reason it exists.
--
-- Idempotent: MySQL has no CREATE INDEX IF NOT EXISTS, so the existence check
-- goes through information_schema and a prepared statement.
-- ══════════════════════════════════════════════════════════════════════════════

SET @idx_exists := (
    SELECT COUNT(*)
      FROM `information_schema`.`STATISTICS`
     WHERE `TABLE_SCHEMA` = DATABASE()
       AND `TABLE_NAME`   = 'student_applications'
       AND `INDEX_NAME`   = 'idx_sa_submitted_at'
);

SET @sql := IF(
    @idx_exists = 0,
    'ALTER TABLE `student_applications` ADD INDEX `idx_sa_submitted_at` (`submitted_at`)',
    'SELECT "idx_sa_submitted_at already present" AS note'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

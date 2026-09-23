-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 129: make `graduands` writable.
-- Date: 2026-08-12
--
-- The table shipped as:
--     `id` int unsigned NOT NULL      -- no PRIMARY KEY, no AUTO_INCREMENT
--
-- so `INSERT INTO graduands (student_id, …)` has always died with
-- 1364 "Field 'id' doesn't have a default value". Nothing could ever be added
-- to the graduation list, which is why the screen has only ever shown
-- "No graduands found."
--
-- Three repairs:
--   1. `id` becomes a real auto-increment primary key.
--   2. `cgpa` DECIMAL(4,2) → DECIMAL(5,2). The old type tops out at 99.99, so a
--      student averaging 100% would have been rejected on insert.
--   3. An index on `student_id`, which the graduation roster joins on for every
--      row it renders.
--
-- Idempotent and portable: every step is guarded through INFORMATION_SCHEMA
-- rather than using MariaDB-only `IF NOT EXISTS` clauses, which are a 1064
-- syntax error on the local MySQL 8.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Give every existing row a unique id before a PRIMARY KEY can be added.
--    Rows can only exist here from a direct import (the app could never insert),
--    and they would all carry id = 0, which a PK would reject.
SET @pk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'graduands'
              AND CONSTRAINT_TYPE = 'PRIMARY KEY');

SET @n := 0;
SET @sql := IF(@pk = 0,
  'UPDATE `graduands` SET `id` = (@n := @n + 1) ORDER BY `created_at`, `student_id`',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @sql := IF(@pk = 0,
  'ALTER TABLE `graduands` ADD PRIMARY KEY (`id`)',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── 2. AUTO_INCREMENT (needs the key from step 1 to already exist).
SET @ai := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'graduands'
              AND COLUMN_NAME = 'id' AND EXTRA LIKE '%auto_increment%');

SET @sql := IF(@ai = 0,
  'ALTER TABLE `graduands` MODIFY `id` INT UNSIGNED NOT NULL AUTO_INCREMENT',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── 3. Widen cgpa so a 100% average fits.
SET @w := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'graduands'
             AND COLUMN_NAME = 'cgpa' AND NUMERIC_PRECISION = 4);

SET @sql := IF(@w = 1,
  'ALTER TABLE `graduands` MODIFY `cgpa` DECIMAL(5,2) DEFAULT NULL',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- ── 4. Index the column the roster joins on.
SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'graduands'
               AND INDEX_NAME = 'idx_graduands_student');

SET @sql := IF(@idx = 0,
  'ALTER TABLE `graduands` ADD KEY `idx_graduands_student` (`student_id`)',
  'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

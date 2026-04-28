-- 2026_04_27_030_admission_requirements_drop_year.sql
-- Make admission requirements faculty-scoped (no longer per-academic-year).
--
-- Why:
--   The product team decided document requirements stay constant per faculty
--   year-over-year. Tracking them per year added admin overhead (a "Copy to
--   year" workflow) and split visibility — a stale row could exist for a year
--   that nobody filters by, which is exactly what was hiding requirements
--   from the admin UI while the duplicate-check still rejected them.
--
-- Steps:
--   1. Drop the FK, the unique key, and the composite index that include
--      `academic_year_id`.
--   2. Dedupe existing rows: keep the most recent per (faculty, document_type),
--      delete the rest.
--   3. Drop the `academic_year_id` column.
--   4. Add the new unique key on (faculty_id, document_type_id) and a matching
--      lookup index on (faculty_id).
--
-- Idempotent: each step is guarded so the script is safe to re-run after a
-- partial application.

-- 1. Drop FK ────────────────────────────────────────────────────────────────
SET @fk_exists := (
    SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'admission_requirements'
      AND CONSTRAINT_NAME = 'fk_ar_academic_year'
);
SET @sql := IF(@fk_exists > 0,
    'ALTER TABLE `admission_requirements` DROP FOREIGN KEY `fk_ar_academic_year`',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2a. Drop the year-bearing unique key ─────────────────────────────────────
SET @uq_exists := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'admission_requirements'
      AND INDEX_NAME = 'uq_ar_faculty_year_type'
);
SET @sql := IF(@uq_exists > 0,
    'ALTER TABLE `admission_requirements` DROP INDEX `uq_ar_faculty_year_type`',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2b. Drop the year-bearing lookup index ───────────────────────────────────
SET @ix_exists := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'admission_requirements'
      AND INDEX_NAME = 'idx_ar_faculty_year'
);
SET @sql := IF(@ix_exists > 0,
    'ALTER TABLE `admission_requirements` DROP INDEX `idx_ar_faculty_year`',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Dedupe — keep the newest row per (faculty_id, document_type_id) ──────
SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'admission_requirements'
      AND COLUMN_NAME = 'academic_year_id'
);
SET @sql := IF(@col_exists > 0,
    'DELETE ar FROM `admission_requirements` ar
     JOIN (
         SELECT MAX(id) AS keep_id
         FROM `admission_requirements`
         GROUP BY faculty_id, document_type_id
     ) keepers ON keepers.keep_id != ar.id
     JOIN (
         SELECT faculty_id, document_type_id
         FROM `admission_requirements`
         GROUP BY faculty_id, document_type_id
         HAVING COUNT(*) > 1
     ) dupes ON dupes.faculty_id = ar.faculty_id
            AND dupes.document_type_id = ar.document_type_id',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. Drop the column ───────────────────────────────────────────────────────
SET @sql := IF(@col_exists > 0,
    'ALTER TABLE `admission_requirements` DROP COLUMN `academic_year_id`',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5. Add the new unique key + lookup index ─────────────────────────────────
SET @new_uq := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'admission_requirements'
      AND INDEX_NAME = 'uq_ar_faculty_type'
);
SET @sql := IF(@new_uq = 0,
    'ALTER TABLE `admission_requirements`
     ADD UNIQUE KEY `uq_ar_faculty_type` (`faculty_id`, `document_type_id`)',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @new_ix := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'admission_requirements'
      AND INDEX_NAME = 'idx_ar_faculty'
);
SET @sql := IF(@new_ix = 0,
    'ALTER TABLE `admission_requirements`
     ADD INDEX `idx_ar_faculty` (`faculty_id`)',
    'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

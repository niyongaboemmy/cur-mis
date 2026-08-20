-- 2026_04_26_028_add_clearance_threshold.sql
-- Adds clearance_threshold to academic_years.
-- Idempotent: uses information_schema check (MySQL 5.7 compatible).

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'academic_years'
    AND COLUMN_NAME  = 'clearance_threshold'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE `academic_years` ADD COLUMN `clearance_threshold` DECIMAL(15,2) NOT NULL DEFAULT 0.00 AFTER `is_current`',
  'SELECT 1');
PREPARE _stmt FROM @sql; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

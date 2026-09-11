-- 2026_09_10_160_admission_requirements_is_active.sql
-- Admins had no way to temporarily disable a required-document row without
-- deleting it outright (losing notes/sort_order/history). Adds an is_active
-- flag so a requirement can be toggled off — applicants stop seeing it on
-- their upload checklist, but the admin config row stays intact for re-use.
-- Idempotent: only adds the column when it isn't there yet.

SET @exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'admission_requirements'
    AND COLUMN_NAME  = 'is_active'
);
SET @sql := IF(@exists = 0,
  'ALTER TABLE `admission_requirements` ADD COLUMN `is_active` TINYINT(1) NOT NULL DEFAULT 1 AFTER `is_required`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

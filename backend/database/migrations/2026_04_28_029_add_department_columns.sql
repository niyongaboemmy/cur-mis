-- Add allowed_combinations and program_level to departements.
-- These columns are required by the application portal department query.
-- Without them the SELECT fails with "Unknown column" and returns no departments.
-- Safe to re-run (MySQL 5.7 compatible -- no ADD COLUMN IF NOT EXISTS).

SET @col1 = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'departements'
    AND COLUMN_NAME  = 'allowed_combinations'
);
SET @sql1 = IF(@col1 = 0,
  'ALTER TABLE `departements` ADD COLUMN `allowed_combinations` TEXT NULL DEFAULT NULL COMMENT ''JSON array of allowed subject combinations for this department''',
  'SELECT 1'
);
PREPARE stmt1 FROM @sql1;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

SET @col2 = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'departements'
    AND COLUMN_NAME  = 'program_level'
);
SET @sql2 = IF(@col2 = 0,
  'ALTER TABLE `departements` ADD COLUMN `program_level` VARCHAR(50) NULL DEFAULT NULL COMMENT ''Degree level offered, e.g. Bachelor, Master, Diploma''',
  'SELECT 1'
);
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

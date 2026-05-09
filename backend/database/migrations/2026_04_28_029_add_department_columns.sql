-- Add allowed_combinations and program_level to departements.
-- These columns are required by the application portal department query.
-- Without them the SELECT fails with "Unknown column" and returns no departments.

ALTER TABLE `departements`
  ADD COLUMN IF NOT EXISTS `allowed_combinations` TEXT NULL DEFAULT NULL
    COMMENT 'JSON array of allowed subject combinations for this department',
  ADD COLUMN IF NOT EXISTS `program_level` VARCHAR(50) NULL DEFAULT NULL
    COMMENT 'Degree level offered, e.g. Bachelor, Master, Diploma';

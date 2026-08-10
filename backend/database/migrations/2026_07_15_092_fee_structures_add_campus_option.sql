-- 2026_07_15_092_fee_structures_add_campus_option.sql
-- Add campus_id column to fee_structures for campus scoping.
-- Create fee_structure_options join table for multi-option (program) targeting.
--
-- Idempotent: INFORMATION_SCHEMA-guarded ALTER, CREATE TABLE IF NOT EXISTS.
-- (`ADD COLUMN IF NOT EXISTS` is MariaDB-only and is a 1064 error on MySQL 8.)

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='fee_structures' AND COLUMN_NAME='campus_id');
SET @stmt := IF(@col=0,
  'ALTER TABLE `fee_structures` ADD COLUMN `campus_id` INT UNSIGNED NULL DEFAULT NULL AFTER `level_id`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

CREATE TABLE IF NOT EXISTS `fee_structure_options` (
  `fee_structure_id` INT UNSIGNED NOT NULL,
  `option_id`        INT UNSIGNED NOT NULL,
  PRIMARY KEY (`fee_structure_id`, `option_id`),
  KEY `idx_fso_option` (`option_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

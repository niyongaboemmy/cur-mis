-- 2026_07_14_092_add_module_order_to_module_programs.sql
-- Add module_order column to module_programs table for curriculum sequencing.
-- Idempotent — safe to re-run.
-- Guarded via INFORMATION_SCHEMA rather than `ADD COLUMN IF NOT EXISTS`, which
-- is MariaDB-only syntax and is a 1064 syntax error on MySQL 8.

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='module_programs' AND COLUMN_NAME='module_order');
SET @stmt := IF(@col=0,
  'ALTER TABLE `module_programs` ADD COLUMN `module_order` INT UNSIGNED NULL DEFAULT NULL AFTER `option_id`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

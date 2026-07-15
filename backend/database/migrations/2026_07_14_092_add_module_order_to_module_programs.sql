-- 2026_07_14_092_add_module_order_to_module_programs.sql
-- Add module_order column to module_programs table for curriculum sequencing.
-- Idempotent — safe to re-run.

ALTER TABLE `module_programs` ADD COLUMN IF NOT EXISTS `module_order` INT UNSIGNED NULL DEFAULT NULL AFTER `option_id`;

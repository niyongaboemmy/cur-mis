-- 2026_07_15_092_fee_structures_add_campus_option.sql
-- Add campus_id column to fee_structures for campus scoping.
-- Create fee_structure_options join table for multi-option (program) targeting.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS.

ALTER TABLE `fee_structures` ADD COLUMN IF NOT EXISTS `campus_id` INT UNSIGNED NULL DEFAULT NULL AFTER `level_id`;

CREATE TABLE IF NOT EXISTS `fee_structure_options` (
  `fee_structure_id` INT UNSIGNED NOT NULL,
  `option_id`        INT UNSIGNED NOT NULL,
  PRIMARY KEY (`fee_structure_id`, `option_id`),
  KEY `idx_fso_option` (`option_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

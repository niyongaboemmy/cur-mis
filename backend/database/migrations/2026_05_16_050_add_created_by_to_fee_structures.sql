-- Adds missing created_by column to fee_structures and fee_invoices
-- (tables were created from an older draft of migration 022 before this column was added)

ALTER TABLE `fee_structures`
  ADD COLUMN IF NOT EXISTS `created_by` INT UNSIGNED NOT NULL DEFAULT 0 AFTER `is_active`;

ALTER TABLE `fee_invoices`
  ADD COLUMN IF NOT EXISTS `created_by` INT UNSIGNED NOT NULL DEFAULT 0 AFTER `is_system_generated`;

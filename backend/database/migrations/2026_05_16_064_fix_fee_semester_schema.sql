-- Migration 064: Fix semester nullability and add missing column to fee_payments
--
-- This fixes the "Column 'semester' cannot be null" error by ensuring the column
-- is nullable across all finance tables, allowing for "Full Year" records.
-- It also adds the missing 'semester' column to fee_payments.

SET @db = DATABASE();

-- 1. fee_structures: Ensure semester is nullable
ALTER TABLE `fee_structures` 
  MODIFY COLUMN `semester` TINYINT UNSIGNED NULL DEFAULT NULL COMMENT '1|2 or NULL for full year';

-- 2. fee_invoices: Ensure semester is nullable
ALTER TABLE `fee_invoices` 
  MODIFY COLUMN `semester` TINYINT UNSIGNED NULL DEFAULT NULL COMMENT '1|2 or NULL for full year';

-- 3. fee_payments: Add missing semester column or ensure it is nullable
SET @q = IF(
  EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @db
      AND TABLE_NAME  = 'fee_payments'
      AND COLUMN_NAME = 'semester'
  ),
  'ALTER TABLE `fee_payments` MODIFY COLUMN `semester` TINYINT UNSIGNED NULL DEFAULT NULL',
  'ALTER TABLE `fee_payments` ADD COLUMN `semester` TINYINT UNSIGNED NULL DEFAULT NULL AFTER `academic_year_id`'
);
PREPARE _stmt FROM @q; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

-- 4. fee_payments: Ensure academic_year_id and fee_type (from migration 061) are nullable
ALTER TABLE `fee_payments` 
  MODIFY COLUMN `fee_type` VARCHAR(60) NULL DEFAULT NULL,
  MODIFY COLUMN `academic_year_id` INT UNSIGNED NULL DEFAULT NULL;

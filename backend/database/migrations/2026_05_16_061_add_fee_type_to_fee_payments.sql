-- Migration 061: Add fee_type and academic_year_id to fee_payments
--
-- UrubutoPayService::recordMobilePayment() passes both fields to
-- FeePaymentModel::create(). filterFillable() includes them (both are in
-- $fillable), so without these columns the INSERT fails on /webhook/callback
-- with "Unknown column 'fee_type' in 'field list'".
--
-- NULL default: manual payments recorded before this migration are unaffected.
-- Idempotent: guarded by INFORMATION_SCHEMA existence checks.

SET @db = DATABASE();

-- fee_type: denormalised from fee_invoices.fee_type for fast per-type filtering
SET @q = IF(
  EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @db
      AND TABLE_NAME  = 'fee_payments'
      AND COLUMN_NAME = 'fee_type'
  ),
  'SELECT 1',
  'ALTER TABLE `fee_payments`
     ADD COLUMN `fee_type` VARCHAR(60) NULL DEFAULT NULL
     COMMENT ''Denormalised from fee_invoices.fee_type''
     AFTER `amount`'
);
PREPARE _stmt FROM @q; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

-- academic_year_id: denormalised from fee_invoices.academic_year_id
SET @q = IF(
  EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @db
      AND TABLE_NAME  = 'fee_payments'
      AND COLUMN_NAME = 'academic_year_id'
  ),
  'SELECT 1',
  'ALTER TABLE `fee_payments`
     ADD COLUMN `academic_year_id` INT UNSIGNED NULL DEFAULT NULL
     COMMENT ''Denormalised from fee_invoices.academic_year_id''
     AFTER `fee_type`'
);
PREPARE _stmt FROM @q; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

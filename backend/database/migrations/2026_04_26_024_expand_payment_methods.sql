-- 2026_04_26_024_expand_payment_methods.sql
-- Adds payment_sub_method to fee_payments to track specific Rwandan banking
-- channels: Bank of Kigali, Equity Bank, MTN MoMo, Airtel Money, etc.
-- Idempotent: uses information_schema check (MySQL 5.7 compatible).

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'fee_payments'
    AND COLUMN_NAME  = 'payment_sub_method'
);
SET @sql := IF(@col = 0,
  'ALTER TABLE `fee_payments` ADD COLUMN `payment_sub_method` VARCHAR(30) NULL DEFAULT NULL COMMENT ''e.g. BK, EQUITY, COGEBANQUE, IM_BANK, MTN_MOMO, AIRTEL_MONEY'' AFTER `payment_method`',
  'SELECT 1');
PREPARE _stmt FROM @sql; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

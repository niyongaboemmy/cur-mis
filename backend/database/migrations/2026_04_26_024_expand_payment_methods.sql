-- 2026_04_26_024_expand_payment_methods.sql
-- Adds payment_sub_method to fee_payments to track specific Rwandan banking
-- channels: Bank of Kigali, Equity Bank, MTN MoMo, Airtel Money, etc.
-- Idempotent via IF NOT EXISTS column check pattern.

ALTER TABLE `fee_payments`
  ADD COLUMN IF NOT EXISTS `payment_sub_method` VARCHAR(30) NULL DEFAULT NULL
    COMMENT 'e.g. BK, EQUITY, COGEBANQUE, IM_BANK, MTN_MOMO, AIRTEL_MONEY'
    AFTER `payment_method`;

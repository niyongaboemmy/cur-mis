-- 2026_09_05_157_fee_payments_add_manual_method.sql
-- FeeService::creditAdmissionPaymentsForStudent() copies application_invoice_payments
-- .payment_method verbatim into fee_payments.payment_method when an admitted
-- applicant's offline (recordManualPayment) payments are credited onto their
-- real student ledger. application_invoice_payments.payment_method is a free
-- VARCHAR and AdmissionBillingService::recordManualPayment() always writes
-- 'MANUAL', but fee_payments.payment_method is the narrower
-- ENUM('CASH','BANK_TRANSFER','MOBILE_MONEY','BURSARY','WAIVER') — MySQL
-- silently coerces the unrecognized value to '' with warning 1265, so the
-- payment method is lost on the ledger. Add 'MANUAL' to the enum.
-- Idempotent: only alters if 'MANUAL' is not already a valid value.

SET @needs_change := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'fee_payments'
    AND COLUMN_NAME  = 'payment_method'
    AND COLUMN_TYPE NOT LIKE '%''MANUAL''%'
);
SET @sql := IF(@needs_change > 0,
  "ALTER TABLE `fee_payments` MODIFY `payment_method` ENUM('CASH','BANK_TRANSFER','MOBILE_MONEY','BURSARY','WAIVER','MANUAL') NOT NULL",
  'SELECT 1');
PREPARE _stmt FROM @sql; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

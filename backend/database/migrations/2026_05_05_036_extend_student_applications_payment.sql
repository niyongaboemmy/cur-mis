-- 2026_05_05_036_extend_student_applications_payment.sql
-- Adds the payment-step columns the apply wizard now collects in step 5
-- (Payment): transaction id, slip file id, amount, currency and paid_at.
-- All nullable so existing drafts/applications remain valid.
--
-- Idempotent — guards each ADD COLUMN with INFORMATION_SCHEMA.

-- transaction_id
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'transaction_id');
SET @stmt := IF(@col = 0, "ALTER TABLE `student_applications` ADD COLUMN `transaction_id` VARCHAR(100) NULL AFTER `sponsor_name`", 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- payment_slip_file_id
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'payment_slip_file_id');
SET @stmt := IF(@col = 0, "ALTER TABLE `student_applications` ADD COLUMN `payment_slip_file_id` VARCHAR(100) NULL AFTER `transaction_id`", 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- payment_amount
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'payment_amount');
SET @stmt := IF(@col = 0, "ALTER TABLE `student_applications` ADD COLUMN `payment_amount` DECIMAL(12,2) NULL AFTER `payment_slip_file_id`", 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- payment_currency
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'payment_currency');
SET @stmt := IF(@col = 0, "ALTER TABLE `student_applications` ADD COLUMN `payment_currency` VARCHAR(10) NULL DEFAULT 'RWF' AFTER `payment_amount`", 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- payment_slip_mime — captured at upload time so we can preview without
-- a HEAD round-trip and so the front-end picks the right viewer.
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'payment_slip_mime');
SET @stmt := IF(@col = 0, "ALTER TABLE `student_applications` ADD COLUMN `payment_slip_mime` VARCHAR(100) NULL AFTER `payment_slip_file_id`", 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- paid_at
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'paid_at');
SET @stmt := IF(@col = 0, "ALTER TABLE `student_applications` ADD COLUMN `paid_at` TIMESTAMP NULL DEFAULT NULL AFTER `payment_currency`", 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

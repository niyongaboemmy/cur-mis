-- Add payment plan configuration to fee structures
-- PDO-compatible: no DELIMITER/stored procedures
-- Runner skips 'Duplicate column name' errors automatically

ALTER TABLE `fee_structures` ADD COLUMN `payment_plan` ENUM('full_year','per_semester','per_installment') NOT NULL DEFAULT 'full_year' AFTER `semester`;
ALTER TABLE `fee_structures` ADD COLUMN `installment_count` TINYINT UNSIGNED NULL DEFAULT NULL AFTER `payment_plan`;

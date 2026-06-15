-- =============================================================================
-- Migration 051: Rebuild fee_payments to match FeePaymentModel
-- Date: 2026-05-16
--
-- Problem: fee_payments was created from the legacy payment_api schema
--   (latin1 charset, INT student_id, lowercase enums, missing columns).
--   Migration 022 used CREATE TABLE IF NOT EXISTS so it never overwrote it.
--
-- Fix: Drop the legacy table and recreate with the schema that the
--   FeePaymentModel, FinanceController, and UrubutoPayService expect.
--
-- Data loss: 3 legacy test rows — incompatible student_ids (integers vs
--   varchar regnumbers), no real payments, safe to discard.
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `fee_payments`;

CREATE TABLE `fee_payments` (
  `id`                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `invoice_id`        INT UNSIGNED  NOT NULL,
  `student_id`        VARCHAR(20)   NOT NULL                  COMMENT 'student.regnumber',
  `amount`            DECIMAL(12,2) NOT NULL,
  `payment_method`    ENUM('CASH','BANK_TRANSFER','MOBILE_MONEY','BURSARY','WAIVER') NOT NULL,
  `payment_sub_method` VARCHAR(30)  NULL DEFAULT NULL         COMMENT 'e.g. BK, EQUITY, MTN_MOMO, AIRTEL_MONEY',
  `reference_number`  VARCHAR(80)   NULL DEFAULT NULL,
  `bank_slip_file_id` VARCHAR(36)   NULL DEFAULT NULL         COMMENT 'UUID in file-server',
  `receipt_number`    VARCHAR(30)   NOT NULL,
  `status`            ENUM('pending','confirmed','rejected')  NOT NULL DEFAULT 'confirmed',
  `notes`             TEXT          NULL DEFAULT NULL,
  `recorded_by`       INT UNSIGNED  NULL DEFAULT NULL         COMMENT 'NULL for system/webhook payments',
  `paid_at`           DATETIME      NOT NULL,
  `confirmed_by`      INT UNSIGNED  NULL DEFAULT NULL,
  `confirmed_at`      DATETIME      NULL DEFAULT NULL,
  `rejection_reason`  TEXT          NULL DEFAULT NULL,
  `created_at`        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_receipt_number` (`receipt_number`),
  INDEX `idx_fp_invoice`  (`invoice_id`),
  INDEX `idx_fp_student`  (`student_id`),
  CONSTRAINT `fk_fp_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `fee_invoices` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

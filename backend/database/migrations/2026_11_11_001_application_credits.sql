-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 2026_11_11_001: student credit ledger for admission payments.
--
-- WHY
-- ───
-- A verified UrubutoPay payment could be discarded when the admission bill it
-- belonged to did not exist yet (Registration paid before the bill was raised),
-- or when the surplus above the application fee found no open bill. The money
-- was confirmed by the gateway and then lost from the ledger.
--
-- This table records EVERY gateway settlement the moment it is verified, with
-- what has been allocated to bills and what is still unapplied. Unapplied
-- credit is allocated automatically when an admission bill is raised.
--
-- application_invoice_payments gains application_credit_id so each allocation
-- can be traced back to the credit it came from. Existing rows keep NULL, which
-- is correct: they were applied directly when they arrived.
--
-- Idempotent: safe to re-run.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. The credit ledger ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `application_credits` (
  `id`               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `application_id`   INT UNSIGNED  NOT NULL,
  `reference_number` VARCHAR(120)  NOT NULL COMMENT 'Gateway transaction code this money arrived under',
  `payer_code`       VARCHAR(60)   NOT NULL DEFAULT '' COMMENT 'Application number the payment was made on',
  `service_code`     VARCHAR(80)   DEFAULT NULL COMMENT 'Service the payer chose (steers allocation)',
  `currency`         VARCHAR(10)   NOT NULL DEFAULT 'RWF',
  `source`           ENUM('GATEWAY','MANUAL') NOT NULL DEFAULT 'GATEWAY',
  `amount_received`  DECIMAL(12,2) NOT NULL COMMENT 'Full amount the gateway confirmed',
  `amount_allocated` DECIMAL(12,2) NOT NULL DEFAULT '0.00' COMMENT 'Sum of application_invoice_payments rows drawn from this credit',
  `amount_remaining` DECIMAL(12,2) NOT NULL COMMENT 'Unapplied balance; never negative',
  `status`           ENUM('open','exhausted') NOT NULL DEFAULT 'open',
  `received_at`      DATETIME      NOT NULL COMMENT 'When the gateway says the money was paid',
  `notes`            VARCHAR(255)  DEFAULT NULL,
  `created_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- One credit per gateway transaction per application: the idempotency guard
  -- for a callback the gateway retries.
  UNIQUE KEY `uq_ac_application_reference` (`application_id`, `reference_number`),
  KEY `idx_ac_open` (`application_id`, `status`, `received_at`),
  -- RESTRICT, not CASCADE: deleting an application must not silently delete money
  -- that was received against it. The application has to be settled or refunded first.
  CONSTRAINT `fk_ac_application` FOREIGN KEY (`application_id`)
      REFERENCES `student_applications` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 2. Link allocations back to the credit they came from ──────────────────
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'application_invoice_payments'
               AND COLUMN_NAME = 'application_credit_id');
SET @stmt := IF(@col = 0,
    'ALTER TABLE `application_invoice_payments` ADD COLUMN `application_credit_id` INT UNSIGNED NULL DEFAULT NULL COMMENT ''application_credits.id this allocation was drawn from, NULL when applied on arrival'' AFTER `application_id`',
    'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'application_invoice_payments'
               AND INDEX_NAME = 'idx_aip_credit');
SET @stmt := IF(@idx = 0,
    'ALTER TABLE `application_invoice_payments` ADD KEY `idx_aip_credit` (`application_credit_id`)',
    'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

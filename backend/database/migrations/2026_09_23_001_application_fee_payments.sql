-- ============================================================
-- 2026_09_23_001_application_fee_payments.sql
--
-- A ledger for the APPLICATION (processing) fee, so partial payments add up.
--
-- WHY
-- ───
-- UrubutoPay lets the payer choose the amount, so an applicant quoted 5,000 RWF
-- can send 100. Until now `recordApplicationPayment()` wrote that 100 straight
-- onto `student_applications.payment_amount` and stamped `paid_at` — which is
-- the system's definition of "the processing fee is settled". Every later
-- payment was then routed to the admission bills, and the applicant's real
-- balance existed nowhere.
--
-- This adds one row per settlement. `student_applications.payment_amount` is
-- kept as the CUMULATIVE total (so every existing reader keeps working) and
-- `paid_at` is now stamped only when the balance reaches zero.
--
-- `application_fee_due` freezes the quote the applicant was billed against, so
-- a later price change does not retroactively move their balance.
--
-- All statements idempotent — safe to re-run.
-- ============================================================

-- ───────────────────────────────────────────────────────────
-- §1. The ledger
-- (application_id, reference_number) is UNIQUE: that uniqueness IS the
-- idempotency guard for a callback the gateway retries.
--
-- Scoped to the application rather than global on the reference, because the
-- reference does not identify an application — the PAYER CODE does, and a
-- retried callback always comes back to the same application. Legacy and
-- manually-keyed data does carry one reference across several applicants
-- (a placeholder such as 'TXN-12345' entered by hand on more than one row),
-- and a global unique key would refuse to record their payments at all.
-- ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `application_fee_payments` (
    `id`               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    `application_id`   INT UNSIGNED  NOT NULL,
    `amount`           DECIMAL(12,2) NOT NULL,
    `currency`         VARCHAR(10)   NOT NULL DEFAULT 'RWF',
    `payment_method`   VARCHAR(30)   NOT NULL DEFAULT 'MOBILE_MONEY',
    `reference_number` VARCHAR(120)  NOT NULL COMMENT 'Gateway transaction code',
    `receipt_number`   VARCHAR(40)   NOT NULL DEFAULT '',
    `service_code`     VARCHAR(80)   DEFAULT NULL,
    `source`           ENUM('GATEWAY','MANUAL','SIMULATED') NOT NULL DEFAULT 'GATEWAY',
    `recorded_by`      INT UNSIGNED  DEFAULT NULL COMMENT 'users.id for MANUAL confirmations',
    `notes`            VARCHAR(255)  DEFAULT NULL,
    `paid_at`          DATETIME      NOT NULL,
    `created_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_afp_app_reference` (`application_id`, `reference_number`),
    KEY `idx_afp_reference` (`reference_number`),
    KEY `idx_afp_application` (`application_id`, `paid_at`),
    CONSTRAINT `fk_afp_application` FOREIGN KEY (`application_id`)
        REFERENCES `student_applications` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ───────────────────────────────────────────────────────────
-- §1b. Re-key a ledger created by the FIRST version of this migration, which
-- made `reference_number` globally unique. Dropped and replaced in place; the
-- table is empty or backfill-only at this point, so nothing is lost.
-- ───────────────────────────────────────────────────────────
SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'application_fee_payments'
               AND INDEX_NAME = 'uq_afp_reference');
SET @stmt := IF(@idx > 0, 'ALTER TABLE `application_fee_payments` DROP INDEX `uq_afp_reference`', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'application_fee_payments'
               AND INDEX_NAME = 'uq_afp_app_reference');
SET @stmt := IF(@idx = 0,
    'ALTER TABLE `application_fee_payments` ADD UNIQUE KEY `uq_afp_app_reference` (`application_id`, `reference_number`)',
    'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'application_fee_payments'
               AND INDEX_NAME = 'idx_afp_reference');
SET @stmt := IF(@idx = 0,
    'ALTER TABLE `application_fee_payments` ADD KEY `idx_afp_reference` (`reference_number`)',
    'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ───────────────────────────────────────────────────────────
-- §2. The quote the applicant is billed against, frozen on first payment
-- ───────────────────────────────────────────────────────────
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications'
               AND COLUMN_NAME = 'application_fee_due');
SET @stmt := IF(@col = 0,
    "ALTER TABLE `student_applications` ADD COLUMN `application_fee_due` DECIMAL(12,2) NULL DEFAULT NULL COMMENT 'Application fee quoted to this applicant; frozen at first payment' AFTER `payment_currency`",
    'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications'
               AND COLUMN_NAME = 'application_fee_structure_id');
SET @stmt := IF(@col = 0,
    "ALTER TABLE `student_applications` ADD COLUMN `application_fee_structure_id` INT UNSIGNED NULL DEFAULT NULL COMMENT 'fee_structures.id the quote was cut from' AFTER `application_fee_due`",
    'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ───────────────────────────────────────────────────────────
-- §3. Backfill: every application already carrying a payment gets its one
-- historical ledger row, so "total paid" is computed the same way everywhere.
-- ───────────────────────────────────────────────────────────
INSERT INTO `application_fee_payments`
    (`application_id`, `amount`, `currency`, `payment_method`, `reference_number`,
     `receipt_number`, `source`, `notes`, `paid_at`)
SELECT sa.id,
       sa.payment_amount,
       COALESCE(NULLIF(sa.payment_currency, ''), 'RWF'),
       CASE WHEN sa.transaction_id LIKE 'DEV-SIM-%' THEN 'SIMULATED' ELSE 'MOBILE_MONEY' END,
       sa.transaction_id,
       '',
       CASE WHEN sa.transaction_id LIKE 'DEV-SIM-%' THEN 'SIMULATED' ELSE 'GATEWAY' END,
       'Backfilled from student_applications by migration 2026_09_23_001',
       COALESCE(sa.paid_at, sa.updated_at, sa.created_at)
FROM `student_applications` sa
WHERE sa.transaction_id IS NOT NULL
  AND sa.transaction_id <> ''
  AND sa.payment_amount IS NOT NULL
  AND sa.payment_amount > 0
  AND NOT EXISTS (
      -- COLLATE: the ledger is utf8mb4_unicode_ci (like the admission-fee
      -- ledger) while `student_applications` is utf8mb4_general_ci on this
      -- schema, and an uncollated comparison of the two is an error.
      SELECT 1 FROM `application_fee_payments` p
       WHERE p.application_id = sa.id
         AND p.reference_number = sa.transaction_id COLLATE utf8mb4_unicode_ci
  );

-- ───────────────────────────────────────────────────────────
-- §4. Grandfather applications that have already moved on.
-- Once an applicant has been merit-listed, offered or enrolled, the fee they
-- paid IS the fee they were asked for — re-pricing them against today's
-- APPLICATION structure would reopen a balance nobody will ever collect.
-- Their quote is frozen at what they paid; everyone still in the pipeline is
-- priced live by ApplicationFeeService.
-- ───────────────────────────────────────────────────────────
UPDATE `student_applications`
   SET `application_fee_due` = `payment_amount`
 WHERE `application_fee_due` IS NULL
   AND `payment_amount` IS NOT NULL
   AND `payment_amount` > 0
   AND `paid_at` IS NOT NULL
   AND `status` IN ('merit_listed','offered','offer_accepted','offer_declined','enrolled','withdrawn');

-- ───────────────────────────────────────────────────────────
-- §5. `paid_at` now means SETTLED, so an applicant still in the pipeline who
-- paid less than the published application fee must not carry the stamp — it is
-- what the admin "payment status" filter and the portal read as "fee paid".
-- Conservative on purpose: only cleared when the amount is below the CHEAPEST
-- published APPLICATION price for their year, so no grandfathered or
-- correctly-settled row is touched.
-- ───────────────────────────────────────────────────────────
UPDATE `student_applications` sa
   SET sa.`paid_at` = NULL
 WHERE sa.`application_fee_due` IS NULL
   AND sa.`paid_at` IS NOT NULL
   AND sa.`payment_amount` IS NOT NULL
   AND sa.`status` IN ('draft','submitted','documents_under_review','documents_verified','documents_rejected','requested_changes')
   AND sa.`payment_amount` < (
        SELECT MIN(fs.`amount`)
          FROM `fee_structures` fs
         WHERE fs.`academic_year_id` = sa.`academic_year_id`
           AND fs.`fee_type` = 'APPLICATION'
           AND fs.`is_active` = 1
   );

-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 140: admission billing — the fees an ADMITTED APPLICANT must settle
-- between the offer and the registration number.
-- Date: 2026-08-18
--
-- WHY
-- ───
-- Until now the step between "offer issued" and "registration number generated"
-- was a button in the admin UI labelled "Simulate registration fee payment" that
-- flipped the offer to accepted without any money moving. The real process is:
-- an admitted applicant owes the Registration fee and the CURSU fee, pays them
-- through UrubutoPay exactly like the application fee, and only then gets a
-- registration number.
--
-- `fee_invoices` cannot carry these bills: its `student_id` is a regnumber, and
-- the whole point is that the applicant does not have one yet. Hence a parallel,
-- deliberately small pair of tables keyed on `student_applications.id`, which
-- FeeService picks up at enrollment (the paid amounts are credited onto the real
-- invoices there).
--
-- WHAT IT DOES NOT DO
-- ───────────────────
-- It creates no `fee_structures` rows and invents no amounts. The bill is built
-- from whatever Finance has published for the fee types named in the
-- `admission_billing_fee_types` setting (REGISTRATION and CURSU by default) for
-- the applicant's academic year / department / level. If a fee type has no
-- published structure, it is simply not billed — the applicant is never charged
-- a number nobody approved.
--
-- Idempotent — safe to re-run.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. The bills ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `application_invoices` (
  `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `application_id`   INT UNSIGNED NOT NULL,
  `fee_structure_id` INT UNSIGNED DEFAULT NULL COMMENT 'The published price this bill was cut from',
  `fee_type`         VARCHAR(50)  NOT NULL COMMENT 'fee_structures.fee_type — REGISTRATION, CURSU, …',
  `label`            VARCHAR(120) NOT NULL DEFAULT '',
  `service_code`     VARCHAR(80)  DEFAULT NULL COMMENT 'urubuto_services.service_code the applicant pays it on',
  `amount_due`       DECIMAL(12,2) NOT NULL,
  `amount_paid`      DECIMAL(12,2) NOT NULL DEFAULT '0.00',
  `currency`         VARCHAR(10)  NOT NULL DEFAULT 'RWF',
  `status`           ENUM('unpaid','partial','paid','cancelled') NOT NULL DEFAULT 'unpaid',
  `transaction_id`   VARCHAR(100) DEFAULT NULL COMMENT 'Last gateway transaction that settled it',
  `paid_at`          DATETIME     DEFAULT NULL,
  `billed_by`        INT UNSIGNED DEFAULT NULL COMMENT 'users.id of the validator who issued it; NULL = system',
  `billed_at`        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- One live bill per fee type per application: re-billing updates the amount
  -- rather than stacking a second Registration fee on the same applicant.
  UNIQUE KEY `uq_ai_application_fee_type` (`application_id`, `fee_type`),
  KEY `idx_ai_status` (`status`),
  KEY `fk_ai_fee_structure` (`fee_structure_id`),
  CONSTRAINT `fk_ai_application`  FOREIGN KEY (`application_id`)   REFERENCES `student_applications` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ai_fee_structure` FOREIGN KEY (`fee_structure_id`) REFERENCES `fee_structures` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 2. The money against them ───────────────────────────────────────────────
-- One row per settlement. `reference_number` is UNIQUE and carries the gateway
-- transaction code: that uniqueness IS the idempotency guard for a callback the
-- gateway retries, the same guard `fee_payments.reference_number` gives on the
-- student side.
CREATE TABLE IF NOT EXISTS `application_invoice_payments` (
  `id`                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `application_invoice_id` INT UNSIGNED NOT NULL,
  `application_id`        INT UNSIGNED NOT NULL,
  `amount`                DECIMAL(12,2) NOT NULL,
  `currency`              VARCHAR(10)  NOT NULL DEFAULT 'RWF',
  `payment_method`        VARCHAR(30)  NOT NULL DEFAULT 'MOBILE_MONEY',
  `reference_number`      VARCHAR(120) NOT NULL COMMENT 'Gateway transaction code (suffixed -2, -3 … on spillover)',
  `receipt_number`        VARCHAR(40)  NOT NULL DEFAULT '',
  `service_code`          VARCHAR(80)  DEFAULT NULL,
  `source`                ENUM('GATEWAY','MANUAL') NOT NULL DEFAULT 'GATEWAY',
  `recorded_by`           INT UNSIGNED DEFAULT NULL COMMENT 'users.id for MANUAL confirmations',
  `notes`                 VARCHAR(255) DEFAULT NULL,
  `paid_at`               DATETIME     NOT NULL,
  `created_at`            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_aip_reference` (`reference_number`),
  KEY `idx_aip_application` (`application_id`),
  CONSTRAINT `fk_aip_invoice` FOREIGN KEY (`application_invoice_id`) REFERENCES `application_invoices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 3. The application row remembers it was auto-submitted ──────────────────
-- The application fee callback now submits the application itself, so the
-- applicant does not have to come back and press a button. When they DO come
-- back, the wizard still posts its final field values; this flag is what lets
-- submitApplication() accept that as a data sync instead of rejecting it with
-- "Application is already submitted".
ALTER TABLE `student_applications`
  ADD COLUMN `auto_submitted` TINYINT(1) NOT NULL DEFAULT 0
  COMMENT 'Submitted by the payment callback rather than by the applicant pressing Submit';

-- ── 4. Settings ─────────────────────────────────────────────────────────────
INSERT INTO `settings` (`key_name`, `value`, `description`) VALUES
  ('admission_billing_fee_types',   'REGISTRATION,CURSU',
   'Comma-separated fee_structures.fee_type list an admitted applicant is billed before enrollment. Order is the order shown to the applicant.'),
  ('admission_billing_auto_bill',   '1',
   'Raise the admission bills automatically the moment an admission offer is issued (1) or only when a validator presses Bill Applicant (0).'),
  ('admission_billing_auto_enroll', '1',
   'Generate the registration number automatically once every admission bill is fully paid (1) or leave it to a validator (0).')
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);

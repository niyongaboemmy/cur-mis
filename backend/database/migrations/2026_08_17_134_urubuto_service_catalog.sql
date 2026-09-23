-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 134: UrubutoPay service catalogue — map every gateway service to an
-- internal fee type so we know WHAT a payer paid for, not just how much.
-- Date: 2026-08-17
--
-- Until now the integration knew exactly two service codes, hardcoded in
-- App\Services\UrubutoPayService::SERVICE_MAP:
--     tuition-fees-1258   (TUITION FEES)
--     cursu-fees-8249     (CURSU FEES — reused for registration/hostel/fine/…)
-- and the code that arrived on a callback was written into a free-text `notes`
-- string only. Money was then applied FIFO across the oldest open invoices, so a
-- student paying "Transcript" could silently pay down last year's tuition.
--
-- UrubutoPay has now registered 22 distinct services on the merchant account
-- (with NEW codes — `tuition-fees-4679` replaces `tuition-fees-1258`, and
-- `cursu-fees-5227` replaces `cursu-fees-8249`). Rather than grow the constant,
-- the mapping moves into this table so finance can add/retire a service without
-- a deploy, and revenue can be grouped per service in reports.
--
--   fee_type     — which fee_invoices.fee_type this service settles (the
--                  BILLING vocabulary). NULL means "no specific type" → fall
--                  through to the FIFO waterfall (used for `other-fees`, which
--                  is deliberately vague).
--   fee_structure_type
--                — which fee_structures.fee_type PRICES this service (the
--                  PRICING vocabulary). The two are deliberately separate
--                  because live data uses different words for the same thing:
--                  fee_invoices.fee_type holds 'TUITION' / 'service_request',
--                  while fee_structures.fee_type holds 'TUITION', 'CURSU',
--                  'GRADUATION', 'INTERNSHIP', 'TRANSCRIPT', 'TO_WHOM',
--                  'ENGLISH_CERTIFICATE', 'APPLICATION', 'REGISTRATION'.
--                  This column is what lets a callback answer "which fee
--                  structure is being paid", not just "which fee type".
--                  NULL = no central price is configured for this service yet;
--                  finance sets it once they add the structure, no deploy needed.
--   alias_of     — a retired code that still resolves to a live one. The two old
--                  codes above are seeded as aliases so in-flight callbacks and
--                  historic reconciliation keep working after the cutover.
--   payer_target — which payer branch the service belongs to (enrolled student,
--                  applicant paying the processing fee, or a public service
--                  request). Drives which services appear on the USSD menu.
--   show_in_menu — include in the validate-payer `services[]` list even when the
--                  payer owes nothing on it (amount = 0, ad-hoc payment allowed).
--
-- Idempotent — safe to re-run.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. The catalogue ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `urubuto_services` (
  `id`                 INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `urubuto_service_id` VARCHAR(20)               DEFAULT NULL COMMENT 'Gateway-side service_id, e.g. 9773',
  `service_code`       VARCHAR(80)      NOT NULL COMMENT 'Gateway-side service_code, e.g. tuition-fees-4679',
  `service_name`       VARCHAR(150)     NOT NULL,
  `fee_type`           VARCHAR(60)               DEFAULT NULL COMMENT 'fee_invoices.fee_type this settles; NULL = FIFO waterfall',
  `fee_structure_type` VARCHAR(100)              DEFAULT NULL COMMENT 'fee_structures.fee_type used to price this service; NULL = not priced centrally',
  `payer_target`       ENUM('STUDENT','APPLICANT','SERVICE_REQUEST') NOT NULL DEFAULT 'STUDENT',
  `account_number`     VARCHAR(40)               DEFAULT NULL,
  `bank_name`          VARCHAR(40)               DEFAULT 'BK',
  `default_amount`     DECIMAL(12,2)             DEFAULT NULL COMMENT 'Gateway-registered amount; informational only',
  `alias_of`           VARCHAR(80)               DEFAULT NULL COMMENT 'Retired code — resolves to this live service_code',
  `show_in_menu`       TINYINT(1)       NOT NULL DEFAULT 1,
  `is_active`          TINYINT(1)       NOT NULL DEFAULT 1,
  `sort_order`         INT(10)          NOT NULL DEFAULT 100,
  `created_at`         TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_us_service_code` (`service_code`),
  KEY `idx_us_fee_type` (`fee_type`),
  KEY `idx_us_alias` (`alias_of`),
  KEY `idx_us_active` (`is_active`, `payer_target`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ── 1b. Additive column guard ───────────────────────────────────────────────
-- CREATE TABLE IF NOT EXISTS above is a no-op once the table exists, so a
-- re-run after `fee_structure_type` was introduced would not gain the column
-- and the seed below would fail on "Unknown column".
SET @db = DATABASE();

SET @q = IF(
  EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'urubuto_services' AND COLUMN_NAME = 'fee_structure_type'
  ),
  'SELECT 1',
  'ALTER TABLE `urubuto_services`
     ADD COLUMN `fee_structure_type` VARCHAR(100) NULL DEFAULT NULL
     COMMENT ''fee_structures.fee_type used to price this service''
     AFTER `fee_type`'
);
PREPARE _stmt FROM @q; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

SET @q = IF(
  EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'urubuto_services' AND INDEX_NAME = 'idx_us_fee_structure_type'
  ),
  'SELECT 1',
  'ALTER TABLE `urubuto_services` ADD INDEX `idx_us_fee_structure_type` (`fee_structure_type`)'
);
PREPARE _stmt FROM @q; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

-- ── 2. Seed the 22 gateway-registered services ──────────────────────────────
-- fee_type choices follow the values actually present in fee_invoices.fee_type
-- (VARCHAR(50) in live): the original ENUM set — 'TUITION','REGISTRATION',
-- 'ADMISSION','HOSTEL','ACADEMIC_DOCUMENT','FINE','REPEAT_MODULE','ARREARS',
-- 'BURSARY_CREDIT','MODULE_FEE' — plus 'service_request', which is what
-- ServiceRequestService writes for public service-request invoices.
-- Services with no honest equivalent (`other-fees`) are left NULL rather than
-- mis-typed; the exact service is still preserved on
-- fee_payments.urubuto_service_code either way.
INSERT INTO `urubuto_services`
  (`urubuto_service_id`, `service_code`, `service_name`, `fee_type`, `fee_structure_type`, `payer_target`,
   `account_number`, `bank_name`, `default_amount`, `alias_of`, `show_in_menu`, `sort_order`)
VALUES
  ('9773',  'tuition-fees-4679',          'TUITION FEES',           'TUITION',           'TUITION',             'STUDENT', '000500032937476', 'BK', 5.00, NULL, 1, 10),
  ('10254', 'registration-fees-9493',     'Registration fees',      'REGISTRATION',      'REGISTRATION',        'STUDENT', '000500032937476', 'BK', 5.00, NULL, 1, 20),
  ('10256', 'cursu-fees-5227',            'CURSU fees',             'REGISTRATION',      'CURSU',               'STUDENT', '000500775241756', 'BK', 5.00, NULL, 1, 30),
  ('10255', 'technology-fees-9754',       'Technology fees',        'REGISTRATION',      NULL,                  'STUDENT', '000500032937476', 'BK', 5.00, NULL, 1, 40),
  ('10264', 'fines-1062',                 'Fines',                  'FINE',              NULL,                  'STUDENT', '000500032937476', 'BK', 5.00, NULL, 1, 50),
  ('10263', 'retake-5953',                'Retake',                 'REPEAT_MODULE',     NULL,                  'STUDENT', '000500032937476', 'BK', 5.00, NULL, 1, 60),
  ('10261', 'reintegration-fees-2417',    'Re-integration fees',    'REGISTRATION',      NULL,                  'STUDENT', '000500032937476', 'BK', 5.00, NULL, 1, 70),
  ('10270', '1st-internship-fees-7088',   '1st Internship fees',    'MODULE_FEE',        'INTERNSHIP',          'STUDENT', '000500032937476', 'BK', 5.00, NULL, 1, 80),
  ('10271', '2nd-internship-fees-3365',   '2nd Internship fees',    'MODULE_FEE',        'INTERNSHIP',          'STUDENT', '000500032937476', 'BK', 5.00, NULL, 1, 90),
  ('10272', 'final-project-fees-9014',    'Final project fees',     'MODULE_FEE',        NULL,                  'STUDENT', '000500032937476', 'BK', 5.00, NULL, 1, 100),
  ('10266', 'cpa-foundation1-6821',       'CPA foundation1',        'TUITION',           NULL,                  'STUDENT', '000500032937476', 'BK', 5.00, NULL, 1, 110),
  ('10267', 'cpa-foundation2-7872',       'CPA foundation2',        'TUITION',           NULL,                  'STUDENT', '000500032937476', 'BK', 5.00, NULL, 1, 120),
  ('10268', 'cpa-advanced-8607',          'CPA Advanced',           'TUITION',           NULL,                  'STUDENT', '000500032937476', 'BK', 5.00, NULL, 1, 130),
  ('10269', 'cpa-registration-fee-2199',  'CPA registration fee',   'REGISTRATION',      NULL,                  'STUDENT', '000500032937476', 'BK', 5.00, NULL, 1, 140),
  ('10273', 'graduation-fees-8196',       'Graduation fees',        'ACADEMIC_DOCUMENT', 'GRADUATION',          'STUDENT', '000500032937476', 'BK', 5.00, NULL, 1, 150),
  ('10274', 'other-fees-8272',            'Other fees',             NULL,                NULL,                  'STUDENT', '000500032937476', 'BK', 5.00, NULL, 1, 160),
  -- Document / letter services — normally paid through the public Service
  -- Request platform (payer_code = request_code), so they stay off the student
  -- USSD menu but must still resolve on a callback.
  ('10257', 'transcript-1712',            'Transcript',             'service_request',  'TRANSCRIPT',          'SERVICE_REQUEST', '000500032937476', 'BK', 5.00, NULL, 0, 200),
  ('10258', 'to-whom-1604',               'To whom',                'service_request',  'TO_WHOM',             'SERVICE_REQUEST', '000500032937476', 'BK', 5.00, NULL, 0, 210),
  ('10259', 'english-certificate-4298',   'English certificate',    'service_request',  'ENGLISH_CERTIFICATE', 'SERVICE_REQUEST', '000500032937476', 'BK', 5.00, NULL, 0, 220),
  ('10260', 'covered-module-report-8800', 'Covered module report',  'service_request',  NULL,                  'SERVICE_REQUEST', '000500032937476', 'BK', 5.00, NULL, 0, 230),
  ('10265', 'recommendation-letter-6660', 'Recommendation letter',  'service_request',  NULL,                  'SERVICE_REQUEST', '000500032937476', 'BK', 5.00, NULL, 0, 240),
  -- Applicant-facing: the one-off application processing fee.
  ('10253', 'application-fees-6590',      'Application fees',       'ADMISSION',         'APPLICATION',         'APPLICANT', '000500032937476', 'BK', 5.00, NULL, 0, 300),
  -- Retired codes from the previous merchant registration. Kept active as
  -- aliases so callbacks still in flight (and historic rows) resolve.
  (NULL,    'tuition-fees-1258',          'TUITION FEES (retired)', 'TUITION',           'TUITION',             'STUDENT', NULL, 'BK', NULL, 'tuition-fees-4679', 0, 900),
  (NULL,    'cursu-fees-8249',            'CURSU FEES (retired)',   'REGISTRATION',      'CURSU',               'STUDENT', NULL, 'BK', NULL, 'cursu-fees-5227',   0, 910)
ON DUPLICATE KEY UPDATE
  `urubuto_service_id` = VALUES(`urubuto_service_id`),
  `service_name`       = VALUES(`service_name`),
  `fee_type`           = VALUES(`fee_type`),
  `fee_structure_type` = VALUES(`fee_structure_type`),
  `payer_target`       = VALUES(`payer_target`),
  `account_number`     = VALUES(`account_number`),
  `bank_name`          = VALUES(`bank_name`),
  `default_amount`     = VALUES(`default_amount`),
  `alias_of`           = VALUES(`alias_of`),
  `show_in_menu`       = VALUES(`show_in_menu`),
  `sort_order`         = VALUES(`sort_order`);

-- ── 3. Record the paid-for service on each payment ──────────────────────────
-- Previously only recoverable by string-parsing fee_payments.notes.
SET @db = DATABASE();

SET @q = IF(
  EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'fee_payments' AND COLUMN_NAME = 'urubuto_service_code'
  ),
  'SELECT 1',
  'ALTER TABLE `fee_payments`
     ADD COLUMN `urubuto_service_code` VARCHAR(80) NULL DEFAULT NULL
     COMMENT ''UrubutoPay service_code the payer selected''
     AFTER `reference_number`'
);
PREPARE _stmt FROM @q; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

SET @q = IF(
  EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'fee_payments' AND INDEX_NAME = 'idx_fp_urubuto_service'
  ),
  'SELECT 1',
  'ALTER TABLE `fee_payments` ADD INDEX `idx_fp_urubuto_service` (`urubuto_service_code`)'
);
PREPARE _stmt FROM @q; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

-- fee_structure_id: the exact priced structure this payment settled, so finance
-- can reconcile gateway revenue against the published fee schedule rather than
-- inferring it from the invoice.
SET @q = IF(
  EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'fee_payments' AND COLUMN_NAME = 'fee_structure_id'
  ),
  'SELECT 1',
  'ALTER TABLE `fee_payments`
     ADD COLUMN `fee_structure_id` INT(10) UNSIGNED NULL DEFAULT NULL
     COMMENT ''fee_structures.id this payment was priced against''
     AFTER `urubuto_service_code`'
);
PREPARE _stmt FROM @q; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

SET @q = IF(
  EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'fee_payments' AND INDEX_NAME = 'idx_fp_fee_structure'
  ),
  'SELECT 1',
  'ALTER TABLE `fee_payments` ADD INDEX `idx_fp_fee_structure` (`fee_structure_id`)'
);
PREPARE _stmt FROM @q; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

-- Backfill from the legacy free-text note ("UrubutoPay — service: <code>, tx: …").
UPDATE `fee_payments`
   SET `urubuto_service_code` = NULLIF(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(`notes`, 'service: ', -1), ',', 1)), '')
 WHERE `urubuto_service_code` IS NULL
   AND `notes` LIKE 'UrubutoPay%service: %';

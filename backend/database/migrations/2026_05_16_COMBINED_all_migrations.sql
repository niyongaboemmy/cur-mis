-- =============================================================================
-- 2026_05_16_COMBINED_all_migrations.sql
-- -----------------------------------------------------------------------------
-- Single deterministic file that folds every schema change introduced on this
-- branch (migrations 048 → 060) into one idempotent script.
--
-- Safe to run on:
--   • a fresh database (no individual migration has run)
--   • a database where some or all individual migrations already ran
--
-- Every change is guarded by INFORMATION_SCHEMA checks, IF NOT EXISTS,
-- ON DUPLICATE KEY UPDATE, or INSERT IGNORE so re-running is a no-op.
--
-- Section index:
--   §1.  campuses                    — table + 3 institutional rows
--   §2.  user_campus_assignments     — user ↔ campus N:N pivot
--   §3.  roles.enforce_campus_scope  — per-role campus lock flag
--   §4.  student                     — user_id, parent link, level, intl, registry
--   §5.  staff                       — user_id FK
--   §6.  api_authorization           — UrubutoPay / third-party API credentials
--   §7.  fee_structures + fee_invoices — created_by columns
--   §8.  fee_invoices.status          — add 'cancelled' ENUM value
--   §9.  fee_payments                 — recorded_by nullable, status enum, student_id type
--   §10. student_applications         — hide/restore, credit-transfer, A-Level, gender
--   §11. application_documents        — applicant_profile_id + verification_comment
--   §12. student_visa_records         — international student visa renewals
--   §13. application_pending_notes    — shared "why is this pending" thread
--   §14. settings                     — pending_timeout_days default
--   §15. student.campus remap         — legacy free-text labels → campuses.id
--   §16. permissions                  — VIEW_MOBILE_PAYMENTS, VIEW_ONLINE_PAYMENTS_HISTORY, MY_INVOICE
--   §17. role_permissions             — assign permissions to roles
-- =============================================================================


-- =============================================================================
-- §1  campuses
-- -----------------------------------------------------------------------------
-- Mirrors migration 032 / 059. Defensive CREATE so this file is self-sufficient
-- on a fresh DB without depending on prior migrations having run first.
-- =============================================================================
CREATE TABLE IF NOT EXISTS `campuses` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`       VARCHAR(120) NOT NULL,
  `code`       VARCHAR(32)  DEFAULT NULL,
  `location`   VARCHAR(160) DEFAULT NULL,
  `address`    VARCHAR(255) DEFAULT NULL,
  `phone`      VARCHAR(40)  DEFAULT NULL,
  `email`      VARCHAR(120) DEFAULT NULL,
  `is_active`  TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_campus_name` (`name`),
  UNIQUE KEY `uniq_campus_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Seed / sync the 3 institutional campuses. Keyed on `code` so IDs may
-- legitimately differ between environments.
INSERT INTO `campuses` (`name`, `code`, `location`, `is_active`) VALUES
  ('Save Campus',   'SAVE',   'Huye',   1),
  ('Taba Campus',   'TABA',   'Huye',   1),
  ('Kigali Campus', 'KIGALI', 'Kigali', 1)
ON DUPLICATE KEY UPDATE
  `name`      = VALUES(`name`),
  `location`  = VALUES(`location`),
  `is_active` = VALUES(`is_active`);


-- =============================================================================
-- §2  user_campus_assignments  (migration 049)
-- -----------------------------------------------------------------------------
-- Registry staff can be assigned to one or more campuses; their application
-- list is then auto-scoped to those campuses when roles.enforce_campus_scope is ON.
-- =============================================================================
CREATE TABLE IF NOT EXISTS `user_campus_assignments` (
    `id`           INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    `user_id`      INT(10) UNSIGNED NOT NULL,
    `campus_id`    INT UNSIGNED     NOT NULL,
    `assigned_by`  INT(10) UNSIGNED DEFAULT NULL,
    `assigned_at`  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `ux_uca_user_campus` (`user_id`, `campus_id`),
    KEY `idx_uca_user`    (`user_id`),
    KEY `idx_uca_campus`  (`campus_id`),
    CONSTRAINT `fk_uca_user`        FOREIGN KEY (`user_id`)     REFERENCES `users`    (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_uca_campus`      FOREIGN KEY (`campus_id`)   REFERENCES `campuses` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_uca_assigned_by` FOREIGN KEY (`assigned_by`) REFERENCES `users`    (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =============================================================================
-- §3  roles.enforce_campus_scope  (migration 058)
-- -----------------------------------------------------------------------------
-- Per-role flag. When ON, every campus-aware admin endpoint restricts the
-- user's view to their assigned campuses (replaces the old hardcoded
-- "admin/superadmin always bypass" rule).
-- =============================================================================
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'roles' AND COLUMN_NAME = 'enforce_campus_scope');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `roles` ADD COLUMN `enforce_campus_scope` TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;


-- =============================================================================
-- §4  student — user_id, parent link, programme level, registry, international
-- -----------------------------------------------------------------------------
-- Folds migrations 048 (user_id), 051 (parent_student_id, programme_level),
-- and 055 (assigned_registry_user_id, is_international).
-- =============================================================================

-- 4a. user_id — links each student record to its portal login in `users`.
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student' AND COLUMN_NAME = 'user_id');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student` ADD COLUMN `user_id` INT(10) UNSIGNED DEFAULT NULL AFTER `id`',
  'SELECT ''student.user_id already exists''');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4b. parent_student_id — links a returning applicant's new cohort row to their
--     prior one (e.g. UG → Masters).
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student' AND COLUMN_NAME = 'parent_student_id');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student` ADD COLUMN `parent_student_id` INT(10) UNSIGNED DEFAULT NULL AFTER `user_id`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 4c. programme_level — each row carries its own programme tier.
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student' AND COLUMN_NAME = 'programme_level');
SET @stmt := IF(@col = 0,
  "ALTER TABLE `student` ADD COLUMN `programme_level` ENUM('undergraduate','pgde','masters','phd','diploma','certificate') NOT NULL DEFAULT 'undergraduate' AFTER `current_level`",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 4d. Index for "all programmes for this person" lookup.
SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student' AND INDEX_NAME = 'idx_student_parent');
SET @stmt := IF(@idx = 0,
  'ALTER TABLE `student` ADD INDEX `idx_student_parent` (`parent_student_id`)',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 4e. assigned_registry_user_id — owner of international student case.
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student' AND COLUMN_NAME = 'assigned_registry_user_id');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student` ADD COLUMN `assigned_registry_user_id` INT(10) UNSIGNED NULL DEFAULT NULL',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 4f. is_international — boolean flag, drives the International Students page.
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student' AND COLUMN_NAME = 'is_international');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student` ADD COLUMN `is_international` TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;


-- =============================================================================
-- §5  staff — user_id  (migration 048)
-- -----------------------------------------------------------------------------
-- Links each staff record to its portal login in the `users` table.
-- =============================================================================
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff' AND COLUMN_NAME = 'user_id');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `staff` ADD COLUMN `user_id` INT(10) UNSIGNED DEFAULT NULL AFTER `id`',
  'SELECT ''staff.user_id already exists''');
PREPARE stmt FROM @stmt; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- =============================================================================
-- §6  api_authorization  (migration 049 — UrubutoPay integration)
-- -----------------------------------------------------------------------------
-- Stores the API credential set that UrubutoPay uses to authenticate against us.
-- Used by UrubutoPayService::authenticateApiUser() and the webhook middleware.
-- =============================================================================
CREATE TABLE IF NOT EXISTS `api_authorization` (
  `id`            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `username`      VARCHAR(80)   NOT NULL,
  `password`      VARCHAR(255)  NOT NULL COMMENT 'plain, MD5, SHA-1, SHA-256, or bcrypt hash',
  `token`         VARCHAR(255)  NOT NULL COMMENT 'Bearer token returned to UrubutoPay after auth',
  `merchant_code` VARCHAR(50)   NULL DEFAULT NULL,
  `created_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_api_auth_username` (`username`),
  UNIQUE KEY `uq_api_auth_token`    (`token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='UrubutoPay (and any future third-party) API credentials';


-- =============================================================================
-- §7  fee_structures + fee_invoices — created_by columns  (migration 050)
-- -----------------------------------------------------------------------------
-- Tables were created from an older draft of migration 022 before this column
-- was added. ADD COLUMN IF NOT EXISTS is a no-op on re-run.
-- =============================================================================
ALTER TABLE `fee_structures`
  ADD COLUMN IF NOT EXISTS `created_by` INT UNSIGNED NOT NULL DEFAULT 0 AFTER `is_active`;

ALTER TABLE `fee_invoices`
  ADD COLUMN IF NOT EXISTS `created_by` INT UNSIGNED NOT NULL DEFAULT 0 AFTER `is_system_generated`;


-- =============================================================================
-- §8  fee_invoices.status — add 'cancelled'  (migration 049)
-- -----------------------------------------------------------------------------
-- UrubutoPayService queries: status NOT IN ('paid','waived','cancelled').
-- 'cancelled' was missing from the ENUM definition.
-- MODIFY COLUMN is safe to re-run with the same definition.
-- =============================================================================
ALTER TABLE `fee_invoices`
  MODIFY COLUMN `status`
    ENUM('unpaid','partial','paid','overdue','waived','cancelled')
    NOT NULL DEFAULT 'unpaid';


-- =============================================================================
-- §9  fee_payments — recorded_by nullable, status enum, student_id type
-- -----------------------------------------------------------------------------
-- Folds migrations 049 (recorded_by nullable), 052 (status 'reversed'),
-- and 054 (student_id VARCHAR fix).
-- =============================================================================

-- 9a. recorded_by: webhook-triggered payments are system-initiated; no human
--     operator to reference. Column stays nullable; manual payments still carry
--     the finance officer's user ID.
ALTER TABLE `fee_payments`
  MODIFY COLUMN `recorded_by` INT UNSIGNED NULL DEFAULT NULL;

-- 9b. status: add 'reversed' to track UrubutoPay reversals without conflating
--     them with 'rejected'.
ALTER TABLE `fee_payments`
  MODIFY COLUMN `status`
    ENUM('pending','confirmed','rejected','reversed')
    NOT NULL DEFAULT 'pending';

-- 9c. student_id: the column was INT UNSIGNED but the system stores registration
--     numbers like "CUR/BBA/001/2022" (varchar). FeePaymentModel joins on
--     s.regnumber = fp.student_id, so the column must be VARCHAR.
--     MODIFY COLUMN to the same type is a no-op on re-run.
ALTER TABLE `fee_payments`
  MODIFY COLUMN `student_id` VARCHAR(20) NOT NULL;


-- =============================================================================
-- §10  student_applications — hide/restore, credit-transfer, A-Level, gender
-- -----------------------------------------------------------------------------
-- Folds migrations 053 (is_hidden, hidden_*, pending timeout), 054
-- (credit-transfer fields), 057 (A-Level fields), and 052 (gender normalise).
-- =============================================================================

-- 10a. Hide/restore flags (Task 1.9).
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'is_hidden');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student_applications` ADD COLUMN `is_hidden` TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'hidden_at');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student_applications` ADD COLUMN `hidden_at` TIMESTAMP NULL DEFAULT NULL',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'hidden_by');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student_applications` ADD COLUMN `hidden_by` INT(10) UNSIGNED NULL DEFAULT NULL',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'hidden_reason');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student_applications` ADD COLUMN `hidden_reason` VARCHAR(255) NULL DEFAULT NULL',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND INDEX_NAME = 'idx_sa_is_hidden');
SET @stmt := IF(@idx = 0,
  'ALTER TABLE `student_applications` ADD INDEX `idx_sa_is_hidden` (`is_hidden`)',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 10b. Credit-transfer / upgrading applicant workflow.
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'is_credit_transfer');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student_applications` ADD COLUMN `is_credit_transfer` TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'credit_transfer_from');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student_applications` ADD COLUMN `credit_transfer_from` VARCHAR(255) NULL DEFAULT NULL',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'exemption_letter_status');
SET @stmt := IF(@col = 0,
  "ALTER TABLE `student_applications` ADD COLUMN `exemption_letter_status` ENUM('not_required','pending','received_registry','received_finance','confirmed') NOT NULL DEFAULT 'not_required'",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'exemption_letter_received_at');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student_applications` ADD COLUMN `exemption_letter_received_at` TIMESTAMP NULL DEFAULT NULL',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'entry_level_override');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student_applications` ADD COLUMN `entry_level_override` VARCHAR(50) NULL DEFAULT NULL',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 10c. A-Level academic fields (migration 057; also referenced by 035 header).
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'a2_grades');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student_applications` ADD COLUMN `a2_grades` VARCHAR(160) NULL DEFAULT NULL AFTER `combination`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'principal_passes');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student_applications` ADD COLUMN `principal_passes` TINYINT UNSIGNED NULL DEFAULT NULL AFTER `a2_grades`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'serial_number');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student_applications` ADD COLUMN `serial_number` VARCHAR(80) NULL DEFAULT NULL AFTER `principal_passes`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 10d. Normalise gender to single letter (M / F / Other) for the gender filter
--      (Task 1.8). Idempotent — once normalised, the WHEN branches re-emit the
--      same value so re-running is safe.
UPDATE `student_applications`
   SET `gender` = CASE
     WHEN UPPER(LEFT(IFNULL(`gender`, ''), 1)) = 'M' THEN 'M'
     WHEN UPPER(LEFT(IFNULL(`gender`, ''), 1)) = 'F' THEN 'F'
     WHEN UPPER(LEFT(IFNULL(`gender`, ''), 1)) = 'O' THEN 'Other'
     ELSE `gender`
   END
 WHERE `gender` IS NOT NULL AND `gender` <> '';


-- =============================================================================
-- §11  application_documents — applicant_profile_id + verification_comment
-- -----------------------------------------------------------------------------
-- Migration 056. Adds the profile FK and adds verification_comment alongside
-- the legacy rejection_notes column (not dropped to preserve any tooling
-- that still reads it).
-- =============================================================================

-- 11a. applicant_profile_id
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'application_documents' AND COLUMN_NAME = 'applicant_profile_id');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `application_documents` ADD COLUMN `applicant_profile_id` INT UNSIGNED NULL DEFAULT NULL AFTER `application_id`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 11b. Index for the upsertForProfile lookup.
SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'application_documents' AND INDEX_NAME = 'idx_ad_profile_type');
SET @stmt := IF(@idx = 0,
  'ALTER TABLE `application_documents` ADD INDEX `idx_ad_profile_type` (`applicant_profile_id`, `document_type_id`)',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 11c. verification_comment (replaces legacy rejection_notes semantically).
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'application_documents' AND COLUMN_NAME = 'verification_comment');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `application_documents` ADD COLUMN `verification_comment` TEXT NULL DEFAULT NULL AFTER `verified_at`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 11d. Copy legacy rejection_notes into verification_comment when the old column
--      still exists. Only overwrites NULLs in the new column.
SET @legacy := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'application_documents' AND COLUMN_NAME = 'rejection_notes');
SET @stmt := IF(@legacy = 1,
  'UPDATE `application_documents` SET `verification_comment` = COALESCE(`verification_comment`, `rejection_notes`) WHERE `rejection_notes` IS NOT NULL',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 11e. Backfill applicant_profile_id from the application's profile link.
--      Skipped cleanly on fresh schemas that don't have applicant_profiles yet.
SET @has_ap := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'applicant_profiles');
SET @stmt := IF(@has_ap = 1,
  'UPDATE `application_documents` ad
     JOIN `applicant_profiles` ap ON ap.application_id = ad.application_id
      SET ad.applicant_profile_id = ap.id
    WHERE ad.applicant_profile_id IS NULL',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;


-- =============================================================================
-- §12  student_visa_records  (migration 055)
-- -----------------------------------------------------------------------------
-- International student visa renewal history. One row per renewal cycle;
-- is_current=1 marks the live record per student.
-- =============================================================================
CREATE TABLE IF NOT EXISTS `student_visa_records` (
    `id`                INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    `student_id`        INT(11)          NOT NULL,
    `country_of_origin` VARCHAR(100)     NOT NULL,
    `entry_date`        DATE             NOT NULL,
    `visa_issue_date`   DATE             NOT NULL,
    `visa_expiry_date`  DATE             NOT NULL,
    `visa_type`         VARCHAR(100)     DEFAULT NULL,
    `notes`             VARCHAR(500)     DEFAULT NULL,
    `is_current`        TINYINT(1)       NOT NULL DEFAULT 1,
    `created_by`        INT(10) UNSIGNED DEFAULT NULL,
    `created_at`        TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_visa_student`  (`student_id`),
    KEY `idx_visa_current`  (`is_current`),
    KEY `idx_visa_expiry`   (`visa_expiry_date`),
    CONSTRAINT `fk_visa_student`  FOREIGN KEY (`student_id`) REFERENCES `student` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_visa_creator`  FOREIGN KEY (`created_by`) REFERENCES `users`   (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =============================================================================
-- §13  application_pending_notes  (migration 050)
-- -----------------------------------------------------------------------------
-- Shared "why is this pending" thread on an application. Visible to every
-- registry staffer regardless of campus assignment.
-- =============================================================================
CREATE TABLE IF NOT EXISTS `application_pending_notes` (
    `id`             INT UNSIGNED     NOT NULL AUTO_INCREMENT,
    `application_id` INT UNSIGNED     NOT NULL,
    `note`           TEXT             NOT NULL,
    `created_by`     INT(10) UNSIGNED DEFAULT NULL,
    `created_at`     TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_apn_application` (`application_id`),
    KEY `idx_apn_created_by`  (`created_by`),
    KEY `idx_apn_created_at`  (`created_at`),
    CONSTRAINT `fk_apn_application` FOREIGN KEY (`application_id`) REFERENCES `student_applications` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_apn_created_by`  FOREIGN KEY (`created_by`)     REFERENCES `users`                (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =============================================================================
-- §14  settings — pending_timeout_days default  (migration 053)
-- -----------------------------------------------------------------------------
-- 30-day default for auto-hiding stale pending applications. Admins can tune
-- the value via the Settings page; this only inserts the row when missing.
-- =============================================================================
SET @has_settings := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
                      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'settings');
SET @stmt := IF(@has_settings = 1,
  "INSERT INTO `settings` (`id`, `key_name`, `value`, `description`)
   SELECT COALESCE((SELECT MAX(`id`) FROM `settings`), 0) + 1,
          'pending_timeout_days',
          '30',
          'Auto-hide pending applications older than this many days.'
    WHERE NOT EXISTS (SELECT 1 FROM `settings` WHERE `key_name` = 'pending_timeout_days')",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;


-- =============================================================================
-- §15  student.campus — legacy free-text labels → campuses.id  (migration 059)
-- -----------------------------------------------------------------------------
-- Switches student.campus from labels like "SAVE-CAMPUS" / "TABA-CAMPUS" to
-- the numeric campuses.id (stored as varchar) the app now consumes.
-- IDs are resolved via the unique `code` column so this is portable across envs.
-- Once converted, rows no longer match the WHERE clauses so re-running is safe.
-- =============================================================================

-- 15a. Widen column to hold numeric IDs (and future longer values).
ALTER TABLE `student` MODIFY `campus` VARCHAR(64) DEFAULT NULL;

-- 15b. Remap each legacy variant per campus code.
UPDATE `student` s
JOIN `campuses` c ON c.`code` = 'SAVE'
SET s.`campus` = CAST(c.`id` AS CHAR)
WHERE s.`campus` IN ('SAVE-CAMPUS', 'SAVE CAMPUS', 'Save Campus', 'SAVE', 'Save', 'save', 'save-campus');

UPDATE `student` s
JOIN `campuses` c ON c.`code` = 'TABA'
SET s.`campus` = CAST(c.`id` AS CHAR)
WHERE s.`campus` IN ('TABA-CAMPUS', 'TABA CAMPUS', 'Taba Campus', 'TABA', 'Taba', 'taba', 'taba-campus');

UPDATE `student` s
JOIN `campuses` c ON c.`code` = 'KIGALI'
SET s.`campus` = CAST(c.`id` AS CHAR)
WHERE s.`campus` IN ('KIGALI-CAMPUS', 'KIGALI CAMPUS', 'Kigali Campus', 'KIGALI', 'Kigali', 'kigali', 'kigali-campus');

-- 15c. Normalise empty strings to NULL — column is either a real ID or NULL.
UPDATE `student` SET `campus` = NULL WHERE `campus` = '';


-- =============================================================================
-- §16  permissions  (migrations 049, 051, 053)
-- -----------------------------------------------------------------------------
-- Seeds VIEW_MOBILE_PAYMENTS, VIEW_ONLINE_PAYMENTS_HISTORY, and MY_INVOICE.
-- All inserts use INSERT IGNORE so re-running is a no-op.
-- =============================================================================

-- Resolve Finance category id once for all inserts below.
SET @cat_finance := (SELECT `id` FROM `permission_categories` WHERE `name` = 'Finance' LIMIT 1);

-- VIEW_MOBILE_PAYMENTS — UrubutoPay / USSD mobile money transactions.
INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`)
VALUES (
    @cat_finance,
    'View Mobile Payments',
    'VIEW_MOBILE_PAYMENTS',
    'View UrubutoPay USSD / mobile money payment transactions.'
);

-- VIEW_ONLINE_PAYMENTS_HISTORY — legacy online payments history table.
INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`)
VALUES (
    @cat_finance,
    'View Online Payments History',
    'VIEW_ONLINE_PAYMENTS_HISTORY',
    'View the legacy online payments history table from UrubutoPay and other gateways.'
);

-- MY_INVOICE — students view their own invoices and outstanding balance.
INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`)
VALUES (
    @cat_finance,
    'View My Invoices',
    'MY_INVOICE',
    'Students can view their own invoices, payment history and outstanding balance.'
);


-- =============================================================================
-- §17  role_permissions  (migrations 049, 051, 053)
-- -----------------------------------------------------------------------------
-- Assigns the new permissions to the appropriate roles. All inserts use
-- INSERT IGNORE so re-running is a no-op.
-- =============================================================================

-- VIEW_MOBILE_PAYMENTS → superadmin, admin, finance_officer
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM   `roles`       r
JOIN   `permissions` p ON p.`slug` = 'VIEW_MOBILE_PAYMENTS'
WHERE  r.`name` IN ('superadmin', 'admin', 'finance_officer');

-- VIEW_ONLINE_PAYMENTS_HISTORY → superadmin, admin, finance_officer
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM   `roles`       r
JOIN   `permissions` p ON p.`slug` = 'VIEW_ONLINE_PAYMENTS_HISTORY'
WHERE  r.`name` IN ('superadmin', 'admin', 'finance_officer');

-- MY_INVOICE → student role only
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM   `roles`       r
JOIN   `permissions` p ON p.`slug` = 'MY_INVOICE'
WHERE  r.`name` = 'student';

-- ACCESS_STUDENT_PORTAL → student role (idempotent guard, was in 049)
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM   `roles`       r
JOIN   `permissions` p ON p.`slug` = 'ACCESS_STUDENT_PORTAL'
WHERE  r.`name` = 'student';

-- Safety: ensure student role does NOT have VIEW_FINANCE (was in 053).
DELETE rp FROM `role_permissions` rp
JOIN `roles`       r ON r.`id` = rp.`role_id`
JOIN `permissions` p ON p.`id` = rp.`permission_id`
WHERE r.`name` = 'student'
  AND p.`slug` = 'VIEW_FINANCE';

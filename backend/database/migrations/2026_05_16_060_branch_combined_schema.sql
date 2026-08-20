-- =============================================================================
-- 2026_05_16_060_branch_combined_schema.sql
-- -----------------------------------------------------------------------------
-- One-shot combined migration for every schema change introduced on this
-- branch. Folds together migrations 049 → 059 (registry / campus scoping,
-- application workflow, visa tracking, A-Level fields, campus remap, etc.)
-- into a single deterministic file so:
--
--   • a fresh environment can reach the current schema with this one file,
--   • production / cPanel deploys don't have to apply 11 files in order,
--   • re-running on an env that already has the individual migrations is a
--     no-op (every change is guarded by INFORMATION_SCHEMA / IF NOT EXISTS
--     / ON DUPLICATE KEY UPDATE).
--
-- Section index:
--   §1.  campuses               — table + 3 institutional rows (Save/Taba/Kigali)
--   §2.  user_campus_assignments — user ↔ campus N:N pivot
--   §3.  roles.enforce_campus_scope — per-role campus lock flag
--   §4.  student                 — registry / international / returning-applicant fields
--   §5.  student_applications    — gender normalise, hide/restore, credit-transfer,
--                                  A-Level, hidden index
--   §6.  application_documents   — applicant_profile_id + verification_comment
--   §7.  student_visa_records    — international student visa renewals
--   §8.  application_pending_notes — shared "why is this pending" thread
--   §9.  settings                — pending_timeout_days default
--   §10. student.campus remap    — legacy free-text labels → campuses.id
-- =============================================================================


-- =============================================================================
-- §1  campuses
-- -----------------------------------------------------------------------------
-- Mirrors migration 032. Defensive CREATE so this file is self-sufficient
-- on a fresh DB without depending on 032 having run first.
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
-- §2  user_campus_assignments  (was migration 049)
-- -----------------------------------------------------------------------------
-- Registry staff can be assigned to one or more campuses; their application
-- list is then auto-scoped to those campuses (when roles.enforce_campus_scope
-- is on).
-- =============================================================================
CREATE TABLE IF NOT EXISTS `user_campus_assignments` (
    `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
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
-- §3  roles.enforce_campus_scope  (was migration 058)
-- -----------------------------------------------------------------------------
-- Per-role flag. When ON, every campus-aware admin endpoint restricts the
-- user's view to their assigned campuses (replaces the legacy hardcoded
-- "admin/superadmin always bypass" rule).
-- =============================================================================
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'roles' AND COLUMN_NAME = 'enforce_campus_scope');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `roles` ADD COLUMN `enforce_campus_scope` TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;


-- =============================================================================
-- §4  student — registry / international / returning-applicant fields
-- -----------------------------------------------------------------------------
-- Folds together migrations 051 (parent_student_id, programme_level) and
-- 055 (assigned_registry_user_id, is_international).
-- =============================================================================

-- 4a. parent_student_id — links a returning applicant's new cohort row to
--     their prior one (e.g. UG → Masters).
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student' AND COLUMN_NAME = 'parent_student_id');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student` ADD COLUMN `parent_student_id` INT(10) UNSIGNED DEFAULT NULL AFTER `user_id`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 4b. programme_level — each row carries its own programme tier.
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student' AND COLUMN_NAME = 'programme_level');
SET @stmt := IF(@col = 0,
  "ALTER TABLE `student` ADD COLUMN `programme_level` ENUM('undergraduate','pgde','masters','phd','diploma','certificate') NOT NULL DEFAULT 'undergraduate' AFTER `current_level`",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 4c. Index for "all programmes for this person" lookup.
SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student' AND INDEX_NAME = 'idx_student_parent');
SET @stmt := IF(@idx = 0,
  'ALTER TABLE `student` ADD INDEX `idx_student_parent` (`parent_student_id`)',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 4d. assigned_registry_user_id — owner of international student case.
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student' AND COLUMN_NAME = 'assigned_registry_user_id');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student` ADD COLUMN `assigned_registry_user_id` INT(10) UNSIGNED NULL DEFAULT NULL',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 4e. is_international — boolean flag, drives the International Students page.
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student' AND COLUMN_NAME = 'is_international');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student` ADD COLUMN `is_international` TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;


-- =============================================================================
-- §5  student_applications — workflow + filter columns
-- -----------------------------------------------------------------------------
-- Folds 052 (gender normalise), 053 (hide/restore), 054 (credit-transfer),
-- 057 (A-Level fields).
-- =============================================================================

-- 5a. Hide/restore (Task 1.9).
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

-- 5b. Credit-transfer / upgrading applicant workflow.
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

-- 5c. A-Level academic fields (was 057, also referenced by 035's header).
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

-- 5d. Normalise gender to single letter (M / F / Other). Deterministic for the
--     new gender filter (Task 1.8). Idempotent — once normalised, the WHEN
--     branches re-emit the same value.
UPDATE `student_applications`
   SET `gender` = CASE
     WHEN UPPER(LEFT(IFNULL(`gender`, ''), 1)) = 'M' THEN 'M'
     WHEN UPPER(LEFT(IFNULL(`gender`, ''), 1)) = 'F' THEN 'F'
     WHEN UPPER(LEFT(IFNULL(`gender`, ''), 1)) = 'O' THEN 'Other'
     ELSE `gender`
   END
 WHERE `gender` IS NOT NULL AND `gender` <> '';


-- =============================================================================
-- §6  application_documents — applicant_profile_id + verification_comment
-- -----------------------------------------------------------------------------
-- Was migration 056. Adds the profile FK and renames the legacy
-- rejection_notes column to verification_comment without dropping the old
-- one (other tooling may still read it).
-- =============================================================================
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'application_documents' AND COLUMN_NAME = 'applicant_profile_id');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `application_documents` ADD COLUMN `applicant_profile_id` INT UNSIGNED NULL DEFAULT NULL AFTER `application_id`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'application_documents' AND INDEX_NAME = 'idx_ad_profile_type');
SET @stmt := IF(@idx = 0,
  'ALTER TABLE `application_documents` ADD INDEX `idx_ad_profile_type` (`applicant_profile_id`, `document_type_id`)',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'application_documents' AND COLUMN_NAME = 'verification_comment');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `application_documents` ADD COLUMN `verification_comment` TEXT NULL DEFAULT NULL AFTER `verified_at`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Copy legacy rejection_notes into verification_comment when the old column
-- still exists. Safe to re-run: it only overwrites NULLs in the new column.
SET @legacy := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'application_documents' AND COLUMN_NAME = 'rejection_notes');
SET @stmt := IF(@legacy = 1,
  'UPDATE `application_documents` SET `verification_comment` = COALESCE(`verification_comment`, `rejection_notes`) WHERE `rejection_notes` IS NOT NULL',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Backfill applicant_profile_id from the application's profile link.
-- Wrapped to skip cleanly if either side of the JOIN doesn't exist yet
-- (very fresh schemas without applicant_profiles).
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
-- §7  student_visa_records  (was migration 055)
-- -----------------------------------------------------------------------------
-- International student visa renewal history. One row per renewal cycle;
-- `is_current=1` marks the live record per student.
-- =============================================================================
CREATE TABLE IF NOT EXISTS `student_visa_records` (
    `id`                INT UNSIGNED NOT NULL AUTO_INCREMENT,
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
-- §8  application_pending_notes  (was migration 050)
-- -----------------------------------------------------------------------------
-- Shared "why is this pending" thread on an application. Visible to every
-- registry staffer regardless of campus assignment so a colleague can
-- understand why a candidate is being held.
-- =============================================================================
CREATE TABLE IF NOT EXISTS `application_pending_notes` (
    `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
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
-- §9  settings — pending_timeout_days default  (was part of migration 053)
-- -----------------------------------------------------------------------------
-- 30-day default for auto-hiding stale pending applications. Admins can
-- tune the value via the Settings page; this only inserts the row when
-- it's missing.
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
-- §10  student.campus — legacy free-text → campuses.id remap (was 059)
-- -----------------------------------------------------------------------------
-- Switches student.campus from labels like "SAVE-CAMPUS" / "TABA-CAMPUS"
-- to the numeric `campuses.id` (stored as varchar) the app now consumes.
-- IDs are looked up via the unique `code` so this is portable across envs.
-- =============================================================================

-- 10a. Widen column so the new value (and any future longer ID) fits.
ALTER TABLE `student` MODIFY `campus` VARCHAR(64) DEFAULT NULL;

-- 10b. Remap each legacy variant per campus code.
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

-- 10c. Normalise empty strings to NULL so the column is either a real ID
--      or NULL — matches what the API + filters now assume.
UPDATE `student` SET `campus` = NULL WHERE `campus` = '';

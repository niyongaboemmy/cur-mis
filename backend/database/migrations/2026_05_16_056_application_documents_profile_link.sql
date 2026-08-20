-- ============================================================
-- Migration 056 — Application documents: add applicant_profile_id and
-- rename rejection_notes → verification_comment.
-- Idempotent so it's safe to re-run on environments that already have
-- the modern shape.
-- ============================================================

-- applicant_profile_id
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'application_documents' AND COLUMN_NAME = 'applicant_profile_id');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `application_documents` ADD COLUMN `applicant_profile_id` INT UNSIGNED NULL DEFAULT NULL AFTER `application_id`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Index for the upsertForProfile lookup
SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'application_documents' AND INDEX_NAME = 'idx_ad_profile_type');
SET @stmt := IF(@idx = 0,
  'ALTER TABLE `application_documents` ADD INDEX `idx_ad_profile_type` (`applicant_profile_id`, `document_type_id`)',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- verification_comment (new) — copy data from legacy rejection_notes if present
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'application_documents' AND COLUMN_NAME = 'verification_comment');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `application_documents` ADD COLUMN `verification_comment` TEXT NULL DEFAULT NULL AFTER `verified_at`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @legacy := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'application_documents' AND COLUMN_NAME = 'rejection_notes');
SET @stmt := IF(@legacy = 1,
  'UPDATE `application_documents` SET `verification_comment` = COALESCE(`verification_comment`, `rejection_notes`) WHERE `rejection_notes` IS NOT NULL',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Backfill applicant_profile_id from the application's profile link.
UPDATE `application_documents` ad
  JOIN `applicant_profiles` ap ON ap.application_id = ad.application_id
   SET ad.applicant_profile_id = ap.id
 WHERE ad.applicant_profile_id IS NULL;

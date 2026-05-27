-- ============================================================
-- Migration 062 — Visa fields on student applications.
--
-- For international (non-Rwandan) applicants, captures the visa
-- obtained date and the visa expiration date alongside the rest
-- of the application. Also seeds a "Visa" document type so the
-- applicant can upload the visa from the Documents Checklist.
--
-- All statements are idempotent.
-- ============================================================

-- ── visa_obtained_date ──────────────────────────────────────
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 'student_applications'
               AND COLUMN_NAME  = 'visa_obtained_date');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student_applications` ADD COLUMN `visa_obtained_date` DATE NULL DEFAULT NULL AFTER `national_id`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ── visa_expiration_date ────────────────────────────────────
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 'student_applications'
               AND COLUMN_NAME  = 'visa_expiration_date');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student_applications` ADD COLUMN `visa_expiration_date` DATE NULL DEFAULT NULL AFTER `visa_obtained_date`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ── Seed "Visa" document type so applicants can upload it ───
INSERT INTO `document_types` (`name`, `slug`, `description`, `is_active`, `sort_order`, `allowed_extensions`)
VALUES ('Visa', 'visa',
        'Valid entry visa for non-Rwandan applicants. Upload a clear scan or photo of the visa page.',
        1, 8, 'pdf,jpg,jpeg,png')
ON DUPLICATE KEY UPDATE
    `name`               = VALUES(`name`),
    `description`        = VALUES(`description`),
    `is_active`          = VALUES(`is_active`),
    `allowed_extensions` = VALUES(`allowed_extensions`);

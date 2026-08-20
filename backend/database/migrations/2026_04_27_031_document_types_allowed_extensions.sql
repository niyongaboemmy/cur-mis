-- 2026_04_27_031_document_types_allowed_extensions.sql
-- Ensures `document_types.allowed_extensions` exists.
--
-- Migration 027 declares the column on its `CREATE TABLE IF NOT EXISTS`,
-- but on databases first seeded by migration 009 the table already exists
-- without it — so the IF NOT EXISTS short-circuits and the column never
-- got added. Production code (DocumentTypeController, the upload validators
-- in ApplicationPortalController / ApplicantProfileController, and the
-- DocumentsUploader component) all rely on this column. Adding it back
-- here closes the gap.
--
-- Idempotent: checks information_schema before altering.

SET @col_exists := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'document_types'
      AND COLUMN_NAME  = 'allowed_extensions'
);

SET @sql := IF(@col_exists = 0,
    "ALTER TABLE `document_types`
       ADD COLUMN `allowed_extensions` VARCHAR(100)
       NOT NULL DEFAULT 'pdf,jpg,jpeg,png'
       AFTER `description`",
    'SELECT 1');

PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

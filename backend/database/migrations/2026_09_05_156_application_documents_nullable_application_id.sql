-- 2026_09_05_156_application_documents_nullable_application_id.sql
-- `application_documents.application_id` has been NOT NULL since migration 009,
-- but ApplicationDocumentModel::upsertForProfile() (used by the student
-- self-service upload endpoint, StudentController::meUploadDocument) has always
-- been able to insert with no application_id — a student who was never taken
-- through the admissions portal has no application to attach the document to.
-- Every such upload has been failing in production with:
--   SQLSTATE[23000]: Column 'application_id' cannot be null
-- Idempotent: only alters if the column is still NOT NULL.

SET @needs_change := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'application_documents'
    AND COLUMN_NAME  = 'application_id'
    AND IS_NULLABLE  = 'NO'
);
SET @sql := IF(@needs_change > 0,
  'ALTER TABLE `application_documents` MODIFY `application_id` INT UNSIGNED NULL DEFAULT NULL',
  'SELECT 1');
PREPARE _stmt FROM @sql; EXECUTE _stmt; DEALLOCATE PREPARE _stmt;

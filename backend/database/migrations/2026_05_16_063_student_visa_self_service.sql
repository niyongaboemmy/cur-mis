-- ============================================================
-- Migration 063 — Self-service visa for international students.
--
-- Lets the enrolled international student upload their visa
-- document (PDF/JPG/PNG) and record the obtained + expiration
-- dates from their own profile page.
--
-- The visa file is stored on the file-server; we keep the file
-- id, original name and mime type next to the visa record so
-- the document can be displayed alongside the rest of the
-- student's documents.
--
-- All statements idempotent.
-- ============================================================

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 'student_visa_records'
               AND COLUMN_NAME  = 'visa_document_file_id');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student_visa_records` ADD COLUMN `visa_document_file_id` VARCHAR(100) NULL DEFAULT NULL COMMENT ''UUID from file-server service'' AFTER `notes`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- If a prior run created the column as INT UNSIGNED (file-server actually
-- returns UUID strings), widen it to VARCHAR(100). Any int values still in
-- the column are stale and won't resolve on the file-server, but the new
-- string-typed column lets fresh uploads work.
SET @datatype := (SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
                  WHERE TABLE_SCHEMA = DATABASE()
                    AND TABLE_NAME   = 'student_visa_records'
                    AND COLUMN_NAME  = 'visa_document_file_id');
SET @stmt := IF(@datatype = 'int',
  'ALTER TABLE `student_visa_records` MODIFY COLUMN `visa_document_file_id` VARCHAR(100) NULL DEFAULT NULL COMMENT ''UUID from file-server service''',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 'student_visa_records'
               AND COLUMN_NAME  = 'visa_document_original_name');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student_visa_records` ADD COLUMN `visa_document_original_name` VARCHAR(255) NULL DEFAULT NULL AFTER `visa_document_file_id`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 'student_visa_records'
               AND COLUMN_NAME  = 'visa_document_mime');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student_visa_records` ADD COLUMN `visa_document_mime` VARCHAR(100) NULL DEFAULT NULL AFTER `visa_document_original_name`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 'student_visa_records'
               AND COLUMN_NAME  = 'visa_document_size');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student_visa_records` ADD COLUMN `visa_document_size` INT UNSIGNED NULL DEFAULT NULL AFTER `visa_document_mime`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

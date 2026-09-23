-- Add reg_number column to missing_document_notes table (idempotent —
-- 2026_09_20_001 already creates it, so this is a no-op on a fresh DB).

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 'missing_document_notes'
               AND COLUMN_NAME  = 'reg_number');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `missing_document_notes` ADD COLUMN `reg_number` VARCHAR(255) NULL AFTER `student_id`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

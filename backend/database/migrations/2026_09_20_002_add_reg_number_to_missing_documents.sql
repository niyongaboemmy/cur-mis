-- Add reg_number column to missing_document_notes table
-- This stores the student's registration number for easier reference

ALTER TABLE IF EXISTS `missing_document_notes`
ADD COLUMN IF NOT EXISTS `reg_number` VARCHAR(255) AFTER `student_id`;

CREATE INDEX IF NOT EXISTS `idx_reg_number` ON `missing_document_notes`(`reg_number`);

-- Add reg_number column to missing_document_notes table
-- This stores the student's registration number for easier reference

ALTER TABLE `missing_document_notes`
ADD COLUMN `reg_number` VARCHAR(255) AFTER `student_id`;

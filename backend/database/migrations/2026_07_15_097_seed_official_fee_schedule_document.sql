-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 097: Seed official CUR fee schedule as System Document
--
-- Registers the official signed CUR Academic Fees Structure 2025-2026 PDF
-- as a System Document in the Finance Department for easy reference and download.
--
-- IMPORTANT: The PDF file must be present at the file_path specified below.
-- This migration is configured for local dev (XAMPP) with the path:
--   C:\xamppP\htdocs\cur-mis\backend\storage\system-documents\Fee-Structure-2025-2026-Official.pdf
--
-- For production (cPanel), you will need to:
-- 1. Copy the PDF to: /home/[username]/backend/storage/system-documents/Fee-Structure-2025-2026-Official.pdf
-- 2. After running this migration, update the file_path via phpMyAdmin:
--    UPDATE system_documents
--    SET file_path = '/home/[username]/backend/storage/system-documents/Fee-Structure-2025-2026-Official.pdf'
--    WHERE name = 'CUR Academic Fees Structure 2025-2026 (Official)';
-- ══════════════════════════════════════════════════════════════════════════════

-- Clean up broken rows from any previous failed migration attempts
DELETE FROM `system_documents`
WHERE `name` = 'CUR Academic Fees Structure 2025-2026 (Official)'
  AND (`file_path` IS NULL OR `file_path` = '' OR `file_size` = 0);

-- Insert the official fee schedule document with full metadata
INSERT INTO `system_documents`
  (`name`, `description`, `file_path`, `file_name`, `file_size`, `file_type`, `category`, `uploaded_by`, `uploaded_at`, `is_active`)
SELECT
  'CUR Academic Fees Structure 2025-2026 (Official)',
  'Official signed fee schedule for Academic Year 2025-2026. Contains complete fee structure by faculty and program including: Application Fee, Registration Fee, CURSU Fee, Total Tuition, Internship Fee, Final Project Fee, and Graduation Fee.',
  'C:\\xamppP\\htdocs\\cur-mis\\backend\\storage\\system-documents\\Fee-Structure-2025-2026-Official.pdf',
  'Fee-Structure-2025-2026-Official.pdf',
  509145,
  'application/pdf',
  'Fee Structure',
  NULL,
  NOW(),
  1
WHERE NOT EXISTS (
  SELECT 1 FROM `system_documents`
  WHERE `name` = 'CUR Academic Fees Structure 2025-2026 (Official)'
    AND `file_path` IS NOT NULL
    AND `file_path` != ''
);

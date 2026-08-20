-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 097: Seed official CUR fee schedule as System Document
--
-- Registers the official signed CUR Academic Fees Structure 2025-2026 PDF
-- as a System Document in the Finance Department for easy reference and download.
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO `system_documents`
  (`name`, `description`, `file_path`, `file_name`, `file_size`, `file_type`, `category`, `uploaded_by`, `is_active`)
VALUES
  (
    'CUR Academic Fees Structure 2025-2026 (Official)',
    'Official signed fee schedule for Academic Year 2025-2026. Contains complete fee structure by faculty and program including: Application Fee, Registration Fee, CURSU Fee, Total Tuition, Internship Fee, Final Project Fee, and Graduation Fee.',
    'storage/system-documents/Fee-Structure-2025-2026-Official.pdf',
    'Fee-Structure-2025-2026-Official.pdf',
    0,
    'application/pdf',
    'Fee Structure',
    1,
    1
  )
ON DUPLICATE KEY UPDATE
  `updated_at` = NOW();

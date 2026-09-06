-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 097: Seed official CUR fee schedule as System Document
--
-- Registers the official signed CUR Academic Fees Structure 2025-2026 PDF
-- as a System Document in the Finance Department for easy reference and download.
--
-- uploaded_by is resolved to an existing user id (lowest id, i.e. the seeded
-- superadmin) rather than a hardcoded 1 — the FK fails on a DB where user 1
-- does not exist. Falls back to NULL (the column is nullable, ON DELETE SET NULL).
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO `system_documents`
  (`name`, `description`, `file_path`, `file_name`, `file_size`, `file_type`, `category`, `uploaded_by`, `is_active`)
SELECT
    'CUR Academic Fees Structure 2025-2026 (Official)',
    'Official signed fee schedule for Academic Year 2025-2026. Contains complete fee structure by faculty and program including: Application Fee, Registration Fee, CURSU Fee, Total Tuition, Internship Fee, Final Project Fee, and Graduation Fee.',
    'storage/system-documents/Fee-Structure-2025-2026-Official.pdf',
    'Fee-Structure-2025-2026-Official.pdf',
    0,
    'application/pdf',
    'Fee Structure',
    (SELECT MIN(`id`) FROM `users`),
    1
ON DUPLICATE KEY UPDATE
  `updated_at` = NOW();

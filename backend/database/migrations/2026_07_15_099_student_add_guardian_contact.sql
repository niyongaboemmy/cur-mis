-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Migration 099: Add guardian/next-of-kin contact columns to student
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Phase 2 (Student Directory — Finance view) of the MIS revision request needs a guardian/
-- next-of-kin contact per student. Checked first (per the plan's Open Question #1) whether this
-- already exists elsewhere:
--   - `student.father` / `student.mother` (2026_04_27_027_comprehensive_schema.sql) — name only,
--     no phone/email/relationship, and no indication of which parent is the actual contact.
--   - `applicant_profiles.emergency_contact_name` / `emergency_contact_phone`
--     (2026_04_22_011_create_applicant_profile_tables.sql) — closest match, but keyed by
--     `user_id`/`application_id`, only populated for students who came through the newer
--     applicant self-registration portal (not the bulk of legacy/imported student rows), and
--     missing email + relationship fields entirely.
--   - `student_applications` — only has the applicant's own email/phone, no guardian fields.
-- None of these cover "a guardian contact per student" as a general-purpose column set usable by
-- every row in `student`, so this migration adds it directly rather than duplicating/aliasing.
--
-- All four columns are nullable — no backfill; legacy rows simply have no guardian on file until
-- Registrar/Finance data-enters it.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

SET FOREIGN_KEY_CHECKS = 0;

-- Guarded via INFORMATION_SCHEMA rather than `ADD COLUMN IF NOT EXISTS`, which
-- is MariaDB-only syntax and is a 1064 syntax error on MySQL 8.

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='student' AND COLUMN_NAME='guardian_name');
SET @stmt := IF(@col=0,
  'ALTER TABLE `student` ADD COLUMN `guardian_name` VARCHAR(150) NULL DEFAULT NULL AFTER `mother`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='student' AND COLUMN_NAME='guardian_phone');
SET @stmt := IF(@col=0,
  'ALTER TABLE `student` ADD COLUMN `guardian_phone` VARCHAR(30) NULL DEFAULT NULL AFTER `guardian_name`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='student' AND COLUMN_NAME='guardian_email');
SET @stmt := IF(@col=0,
  'ALTER TABLE `student` ADD COLUMN `guardian_email` VARCHAR(150) NULL DEFAULT NULL AFTER `guardian_phone`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='student' AND COLUMN_NAME='guardian_relationship');
SET @stmt := IF(@col=0,
  'ALTER TABLE `student` ADD COLUMN `guardian_relationship` VARCHAR(50) NULL DEFAULT NULL AFTER `guardian_email`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET FOREIGN_KEY_CHECKS = 1;

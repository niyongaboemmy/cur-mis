-- 2026_05_07_041_add_faculty_acronym.sql
-- Faculty gains an explicit `fac_acronym` column. Historically `fac_code`
-- has stored short identifiers like "FOS", "FOE" — those are acronyms,
-- not codes. We add `fac_acronym`, backfill it from the existing values,
-- and leave `fac_code` in place so the new admin UI can populate it with
-- the real (longer) faculty code without breaking the seven other readers
-- that currently SELECT `fac_code AS faculty_code`.
--
-- Idempotent.

ALTER TABLE `faculty`
  ADD COLUMN `fac_acronym` VARCHAR(50) NULL AFTER `fac_name`;

-- Backfill: copy the existing fac_code values into fac_acronym so the
-- "Acro" UI field shows them straight away.
UPDATE `faculty`
SET    `fac_acronym` = `fac_code`
WHERE  `fac_acronym` IS NULL
  AND  `fac_code` IS NOT NULL;

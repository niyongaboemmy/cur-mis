-- 2026_10_23_001_schools_widen_address.sql
-- `schools.school_address` was VARCHAR(21), so saving the institution profile
-- with a real address ("Huye-Taba Gisagara-Save", 23 chars) failed with
-- SQLSTATE 22001 "Data too long for column 'school_address'". `url` was
-- VARCHAR(40), which is short enough to hit the same error. Both are widened
-- to VARCHAR(255). Existing values are kept as they are.
-- Safe to re-run: MODIFY to the same definition is a no-op.

ALTER TABLE `schools`
  MODIFY COLUMN `school_address` VARCHAR(255) NOT NULL,
  MODIFY COLUMN `url`            VARCHAR(255) NOT NULL;

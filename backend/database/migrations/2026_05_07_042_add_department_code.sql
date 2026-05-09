-- 2026_05_07_042_add_department_code.sql
-- Departments gain a `dep_code` column for the actual department code
-- (distinct from `dep_acronym` which already holds the short tag like
-- "CS" / "ICT"). Mirrors the faculty `fac_code` / `fac_acronym` split.
--
-- Idempotent.

ALTER TABLE `departements`
  ADD COLUMN `dep_code` VARCHAR(50) NULL AFTER `dep_acronym`;

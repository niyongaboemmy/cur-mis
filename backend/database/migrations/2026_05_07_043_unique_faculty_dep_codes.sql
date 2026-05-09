-- 2026_05_07_043_unique_faculty_dep_codes.sql
-- Faculty and department codes must be unique. NULL values are allowed
-- (multiple rows may have NULL — MySQL UNIQUE indexes allow multiple
-- NULLs by default), so existing rows that haven't been assigned a code
-- yet are not affected.
--
-- Idempotent: the migration runner swallows "already exists" / "Duplicate
-- key" errors as already-applied. App-level uniqueness checks in
-- AcademicsManagementController back this up if the DB index ever
-- fails to apply (e.g. because of pre-existing duplicate data).

ALTER TABLE `faculty`
  ADD UNIQUE KEY `uniq_faculty_fac_code` (`fac_code`);

ALTER TABLE `departements`
  ADD UNIQUE KEY `uniq_departements_dep_code` (`dep_code`);

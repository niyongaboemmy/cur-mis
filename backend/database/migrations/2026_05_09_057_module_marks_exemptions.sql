-- 2026_05_09_057_module_marks_exemptions.sql
-- Allow admins to record an "exemption" mark for a student against a specific
-- module. Exemptions are stored in `module_marks` like any other mark (so they
-- show up on the transcript and curriculum view) but are flagged with
-- `is_exempted=1` and carry an optional human-readable reason. Exemption rows
-- typically only have a `percentage` filled (the equivalence mark from the
-- exempting institution); CAT/exam component fields are left null.
--
-- Idempotent — duplicate-column errors are swallowed by the migration runner.

ALTER TABLE `module_marks`
  ADD COLUMN `is_exempted`      TINYINT(1)   NOT NULL DEFAULT 0 AFTER `decision`,
  ADD COLUMN `exemption_reason` VARCHAR(500) DEFAULT NULL        AFTER `is_exempted`;

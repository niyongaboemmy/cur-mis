-- 2026_05_07_045_add_option_metadata.sql
-- Programs (the `options` table) gain explicit code/acronym/date columns to
-- mirror what we already have on faculties and departments. `code` is unique
-- and follows the convention `<dep_code>.<seq>` (e.g. "3.1.1") — backfilled
-- by backend/scripts/generate_option_codes.php.
--
-- Idempotent — the migration runner swallows duplicate-column / duplicate-
-- key errors as already-applied.

ALTER TABLE `options`
  ADD COLUMN `code`       VARCHAR(50) NULL AFTER `name`,
  ADD COLUMN `acro`       VARCHAR(50) NULL AFTER `code`,
  ADD COLUMN `start_date` DATE        NULL AFTER `acro`,
  ADD COLUMN `end_date`   DATE        NULL AFTER `start_date`;

ALTER TABLE `options`
  ADD UNIQUE KEY `uniq_options_code` (`code`);

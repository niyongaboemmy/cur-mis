-- 2026_05_07_052_module_offering_dates.sql
-- The Schedules tab plans concrete start/end calendar dates per module
-- inside a (program, mode) combination. Add the two columns to
-- `module_offerings` so we don't need a separate table.
--
-- Idempotent — duplicate-column errors are swallowed by the migration runner.

ALTER TABLE `module_offerings`
  ADD COLUMN `start_date` DATE NULL AFTER `semesters`,
  ADD COLUMN `end_date`   DATE NULL AFTER `start_date`;

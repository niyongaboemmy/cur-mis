-- 2026_05_07_053_module_offering_session.sql
-- Schedules tab now also captures the weekly meeting time (day-of-week +
-- start_time + end_time) and the instructor for the per-(program, mode)
-- placement. Stays on `module_offerings` so all schedule data lives in
-- one row per placement.
--
-- Idempotent — duplicate-column errors are swallowed by the migration runner.

ALTER TABLE `module_offerings`
  ADD COLUMN `day_of_week`   TINYINT     NULL AFTER `end_date`,
  ADD COLUMN `start_time`    TIME        NULL AFTER `day_of_week`,
  ADD COLUMN `end_time`      TIME        NULL AFTER `start_time`,
  ADD COLUMN `instructor_id` INT         NULL AFTER `end_time`;

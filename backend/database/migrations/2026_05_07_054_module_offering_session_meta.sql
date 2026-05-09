-- 2026_05_07_054_module_offering_session_meta.sql
-- The university's timetable carries a few extra fields per teaching
-- block: the activity ("Teaching" / "Final Exam"), the lecturer's name
-- as it appears in the source file (used when the name doesn't match an
-- `hr_employees` row), and the year-of-study within the program. Adding
-- them so a row in `module_offerings` can faithfully represent one
-- teaching block from the imported CSV.
--
-- Idempotent — duplicate-column errors are swallowed by the migration runner.

ALTER TABLE `module_offerings`
  ADD COLUMN `activity`        VARCHAR(20)  NULL AFTER `instructor_id`,
  ADD COLUMN `instructor_name` VARCHAR(120) NULL AFTER `activity`,
  ADD COLUMN `year_of_study`   TINYINT      NULL AFTER `instructor_name`;

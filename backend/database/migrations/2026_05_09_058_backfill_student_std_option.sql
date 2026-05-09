-- 2026_05_09_058_backfill_student_std_option.sql
-- Older enrollment flows did not copy `student_applications.program_id` onto
-- the `student` record, so the per-student curriculum view (which joins on
-- `student.std_option` -> `options.id`) reports "No program assigned" for
-- every student admitted before that mapping existed.
--
-- This backfill walks each enrolled application linked through
-- `admission_offers.student_id` and copies the application's program_id /
-- campus_id onto the student row, but only when those columns are still
-- empty so re-running the migration is a no-op for already-mapped students.
--
-- Idempotent — safe to re-apply.

UPDATE `student` s
JOIN `admission_offers`     ao ON ao.student_id = s.id
JOIN `student_applications` sa ON sa.id         = ao.application_id
SET
    s.std_option = COALESCE(NULLIF(s.std_option, ''), CAST(sa.program_id AS CHAR)),
    s.campus     = COALESCE(NULLIF(s.campus, ''),     CAST(sa.campus_id  AS CHAR))
WHERE sa.program_id IS NOT NULL
  AND (
        s.std_option IS NULL OR s.std_option = ''
     OR s.campus     IS NULL OR s.campus     = ''
  );

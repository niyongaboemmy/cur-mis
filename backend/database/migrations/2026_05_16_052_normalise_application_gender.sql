-- ============================================================
-- Migration 052 — Normalise student_applications.gender to single letter.
-- Maps any case-variant of "Male"/"Female"/"Other" to its initial letter
-- so the new gender filter (Task 1.8) is deterministic.
-- ============================================================

UPDATE `student_applications`
   SET `gender` = CASE
     WHEN UPPER(LEFT(IFNULL(`gender`, ''), 1)) = 'M' THEN 'M'
     WHEN UPPER(LEFT(IFNULL(`gender`, ''), 1)) = 'F' THEN 'F'
     WHEN UPPER(LEFT(IFNULL(`gender`, ''), 1)) = 'O' THEN 'Other'
     ELSE `gender`
   END
 WHERE `gender` IS NOT NULL AND `gender` <> '';

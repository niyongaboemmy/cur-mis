-- Update Midwifery(A1) and Nursing(A1) students to Level 7
-- While keeping their existing semester unchanged
--
-- Issue: Students enrolled in Midwifery(A1) and Nursing(A1) programs need to be
-- updated to Level 7. Since semester is derived from current_level, updating the
-- level automatically preserves the semester progression.
--
-- Database structure:
-- - options table: programs (NO level column)
-- - option_campuses table: program-campus links (NO level column)
-- - student table: student enrollments (HAS current_level, programme_level)
-- - Level information is stored PER STUDENT, not per program

-- Step 1: Check which students are affected - BEFORE update
SELECT id, regnumber, fname, lname, programme_level, current_level, programme_category, acc_year
FROM `student`
WHERE programme_category IN ('Nursing(A1)', 'Midwifery(A1)')
  AND (current_level != 7 OR programme_level != 7)
ORDER BY programme_category, acc_year, regnumber;

-- Step 2: Update student levels to 7
-- This automatically preserves semester because semester is calculated from level
UPDATE `student`
SET `current_level` = 7, `programme_level` = 7, `updated_at` = NOW()
WHERE programme_category IN ('Nursing(A1)', 'Midwifery(A1)')
  AND (current_level != 7 OR programme_level != 7);

-- Step 3: Verify the update - AFTER update
SELECT id, regnumber, fname, lname, programme_level, current_level, programme_category, updated_at
FROM `student`
WHERE programme_category IN ('Nursing(A1)', 'Midwifery(A1)')
ORDER BY programme_category, regnumber;

-- Step 4: Count how many students were updated by program category
SELECT COUNT(*) as students_updated, programme_category
FROM `student`
WHERE programme_category IN ('Nursing(A1)', 'Midwifery(A1)')
  AND current_level = 7
GROUP BY programme_category;

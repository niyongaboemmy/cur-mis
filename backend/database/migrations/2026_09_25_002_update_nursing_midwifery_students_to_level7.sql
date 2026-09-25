-- Update Midwifery(A1) and Nursing(A1) students to Level 7
-- While keeping their existing semester unchanged
-- Issue: Students in Midwifery(A1) and Nursing(A1) need level update to 7
-- but should remain in their current semester (e.g., Sem 5 stays Sem 5)

-- Step 1: Check which students are affected
SELECT id, regnumber, fname, lname, programme_level, current_level, acc_year
FROM `student`
WHERE programme_category IN ('Nursing(A1)', 'Midwifery(A1)')
ORDER BY acc_year, regnumber;

-- Step 2: Update student level from current level to 7
-- This keeps their semester (semester is NOT stored per student, it's derived from their current_level)
-- So we ONLY update the level
UPDATE `student`
SET `current_level` = 7, `programme_level` = 7, `updated_at` = NOW()
WHERE programme_category IN ('Nursing(A1)', 'Midwifery(A1)')
  AND (current_level != 7 OR programme_level != 7);

-- Step 3: Verify the update
SELECT id, regnumber, fname, lname, programme_level, current_level, updated_at
FROM `student`
WHERE programme_category IN ('Nursing(A1)', 'Midwifery(A1)')
ORDER BY regnumber;

-- Step 4: Count how many students were updated
SELECT COUNT(*) as students_updated, programme_category
FROM `student`
WHERE programme_category IN ('Nursing(A1)', 'Midwifery(A1)')
  AND (current_level = 7 OR programme_level = 7)
GROUP BY programme_category;

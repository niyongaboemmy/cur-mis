-- Change Midwifery(A1) and Nursing(A1) programs to Level 7
-- Issue: Midwifery(A1) and Nursing(A1) programs need to be set to Level 7
-- This updates the PROGRAM level, not individual student levels
-- Student level updates are handled in migration 2026_09_25_002

-- Step 1: Check current program levels before update
SELECT id, name, `level` as current_level, is_active
FROM `options`
WHERE name IN ('Midwifery(A1)', 'Nursing(A1)')
ORDER BY name;

-- Step 2: Update programs to Level 7
UPDATE `options`
SET `level` = 7, `updated_at` = NOW()
WHERE name IN ('Midwifery(A1)', 'Nursing(A1)')
  AND `level` != 7;

-- Step 3: Verify the program update
SELECT id, name, `level` as current_level, is_active, updated_at
FROM `options`
WHERE name IN ('Midwifery(A1)', 'Nursing(A1)')
ORDER BY name;

-- Step 4: Show Level 7 details for reference
SELECT id, name FROM `levels` WHERE id = 7;

-- Step 5: Show count of updated programs
SELECT COUNT(*) as programs_updated FROM `options`
WHERE name IN ('Midwifery(A1)', 'Nursing(A1)')
  AND `level` = 7;

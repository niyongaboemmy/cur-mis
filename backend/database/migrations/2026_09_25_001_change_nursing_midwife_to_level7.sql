-- Change Midwife and Nursing A1 programs to Level 7
-- Issue: Need to update Midwife and Nursing A1 programs from their current level to Level 7

-- Check current levels before update
SELECT id, name, `level` as current_level
FROM `options`
WHERE name LIKE '%Midwife%' OR name LIKE '%Nursing%'
ORDER BY name;

-- Update to Level 7 (id = 7)
UPDATE `options`
SET `level` = 7, `updated_at` = NOW()
WHERE (name LIKE '%Midwife%' OR name LIKE '%Nursing%')
  AND `level` != 7;

-- Verify the update
SELECT id, name, `level` as current_level, updated_at
FROM `options`
WHERE name LIKE '%Midwife%' OR name LIKE '%Nursing%'
ORDER BY name;

-- Show Level 7 details
SELECT id, name FROM `levels` WHERE id = 7;

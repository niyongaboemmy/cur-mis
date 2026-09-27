-- Add missing Level 7, Semester 5 & 6 records
-- Issue: Level 7, Semester 5 and Level 7, Semester 6 were missing from the levels table
-- This causes the student form dropdown to skip those semesters when selecting a level

-- Step 1: Check current Level 7 entries before insert
SELECT id, name FROM `levels`
WHERE name LIKE 'Level 7%'
ORDER BY id;

-- Step 2: Insert missing Level 7, Semester 5 & 6
INSERT IGNORE INTO `levels` (name) VALUES
('Level 7, Semester 5'),
('Level 7, Semester 6');

-- Step 3: Verify the new entries were added
SELECT id, name FROM `levels`
WHERE name LIKE 'Level 7%'
ORDER BY id;

-- Step 4: Show all semesters for quick reference
SELECT id, name FROM `levels`
ORDER BY id;

-- =============================================================================
-- STANDARDIZE STUDENT STATE TO LOWERCASE
-- Date: 2026-09-06
-- Purpose: Fix case sensitivity issues causing student count discrepancies
-- =============================================================================

-- The issue: Some queries use case-sensitive comparisons while others use LOWER()
-- This causes different student counts between dashboard and students list
-- Solution: Convert all student_state values to lowercase 'active', 'inactive', etc.

-- =============================================================================
-- 1. Update student states to lowercase
-- =============================================================================

UPDATE `student`
SET `student_state` = LOWER(`student_state`)
WHERE `student_state` IS NOT NULL AND `student_state` != '';

-- =============================================================================
-- 2. Verify the fix
-- =============================================================================

SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN LOWER(student_state) = 'active' THEN 1 ELSE 0 END) AS active_count,
  SUM(CASE WHEN LOWER(student_state) = 'inactive' THEN 1 ELSE 0 END) AS inactive_count,
  SUM(CASE WHEN LOWER(student_state) = 'graduated' THEN 1 ELSE 0 END) AS graduated_count,
  SUM(CASE WHEN LOWER(student_state) = 'suspended' THEN 1 ELSE 0 END) AS suspended_count,
  SUM(CASE WHEN LOWER(student_state) = 'dismissed' THEN 1 ELSE 0 END) AS dismissed_count
FROM `student`;

-- Show distinct values (should only show lowercase)
SELECT DISTINCT `student_state` FROM `student` WHERE `student_state` IS NOT NULL ORDER BY `student_state`;

-- =============================================================================
-- 3. Also standardize in graduation_audit table if it exists
-- =============================================================================

UPDATE IF EXISTS `graduation_audit`
SET `student_state` = LOWER(`student_state`)
WHERE `student_state` IS NOT NULL AND `student_state` != '';

-- =============================================================================
-- 4. Verify both tables
-- =============================================================================

SELECT 'Migration completed' as status;
SELECT 'All student_state values are now lowercase' as result;

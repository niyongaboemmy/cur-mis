-- =============================================================================
-- DEDUPLICATE EMPLOYEES TABLE
-- Date: 2026-09-06
-- Purpose: Remove duplicate employee records, keeping the most complete data
-- =============================================================================

-- =============================================================================
-- STEP 1: Identify duplicates
-- =============================================================================
-- SELECT
--   LOWER(CONCAT(first_name, ' ', last_name)) as full_name,
--   COUNT(*) as duplicate_count,
--   GROUP_CONCAT(id) as duplicate_ids
-- FROM employees
-- GROUP BY LOWER(CONCAT(first_name, ' ', last_name))
-- HAVING COUNT(*) > 1;

-- =============================================================================
-- STEP 2: Create temporary table with deduplicated data
-- Keep the record with most complete information (most non-null fields)
-- =============================================================================
CREATE TEMPORARY TABLE temp_deduplicated_employees AS
SELECT
  id,
  ROW_NUMBER() OVER (
    PARTITION BY LOWER(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, '')))
    ORDER BY
      -- Prioritize records with more complete data (more non-null fields)
      (CASE WHEN employee_code IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN email IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN phone IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN department_id IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN position_id IS NOT NULL THEN 1 ELSE 0 END) +
      (CASE WHEN gender IS NOT NULL AND gender != '' THEN 1 ELSE 0 END) +
      (CASE WHEN date_of_birth IS NOT NULL THEN 1 ELSE 0 END) DESC,
      -- Then prioritize by status (active over inactive)
      (CASE WHEN status = 'active' THEN 1 ELSE 0 END) DESC,
      -- Then by most recent hire date
      hire_date DESC,
      -- Finally by ID (to ensure deterministic ordering)
      id DESC
  ) as rn
FROM employees
WHERE first_name IS NOT NULL AND last_name IS NOT NULL;

-- =============================================================================
-- STEP 3: Delete all duplicate records (keep rn=1 for each person)
-- =============================================================================
DELETE FROM employees
WHERE id IN (
  SELECT id FROM temp_deduplicated_employees WHERE rn > 1
);

-- =============================================================================
-- STEP 4: Verify results
-- =============================================================================
SELECT
  'Total unique employees' as check_name,
  COUNT(*) as result_count
FROM employees
UNION ALL
SELECT
  'Employees with null first name (should be 0)',
  COUNT(*) FROM employees WHERE first_name IS NULL
UNION ALL
SELECT
  'Employees with null last name (should be 0)',
  COUNT(*) FROM employees WHERE last_name IS NULL
UNION ALL
SELECT
  'Duplicate name combinations (should be 0)',
  COUNT(*) FROM (
    SELECT LOWER(CONCAT(first_name, ' ', last_name)) as full_name
    FROM employees
    GROUP BY LOWER(CONCAT(first_name, ' ', last_name))
    HAVING COUNT(*) > 1
  ) as duplicates;

-- =============================================================================
-- STEP 5: Cleanup
-- =============================================================================
DROP TEMPORARY TABLE temp_deduplicated_employees;

SELECT 'Employee deduplication completed successfully' as status;

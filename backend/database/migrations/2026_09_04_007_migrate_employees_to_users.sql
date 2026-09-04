-- ==================================================================================
-- Migration: Migrate existing employees table data to users table with HR fields
-- Date: 2026-09-04
--
-- Purpose: Integrate existing 161 employees into the new HR module by:
-- - Creating user accounts from employee records
-- - Populating HR fields (gender, phone, employment_date)
-- - Preparing data for payroll, leave, and contract management
--
-- Idempotent — uses INSERT IGNORE and WHERE NOT EXISTS to avoid duplicates
-- ==================================================================================

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- ── 1. Migrate employee records to users table ──────────────────────────────
-- Insert only if user doesn't already exist
INSERT IGNORE INTO users (
  username,
  full_name,
  email,
  password,
  phone,
  role_id,
  is_active,
  created_at,
  updated_at
)
SELECT
  e.employee_id,
  CONCAT(e.employee_fname, ' ', e.employee_lname) AS full_name,
  CONCAT(LOWER(e.employee_fname), '.', LOWER(e.employee_lname), '@cur.ac.rw') AS email,
  '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi' AS password,
  e.employee_phone,
  2 AS role_id,
  1 AS is_active,
  NOW(),
  NOW()
FROM employees e
WHERE e.employee_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM users u WHERE u.username = e.employee_id
  );

-- ── 2. Update users with HR fields from employees ───────────────────────────
UPDATE users u
INNER JOIN employees e ON u.username = e.employee_id
SET
  u.gender = CASE
    WHEN e.employee_gender = 'Male' THEN 'Male'
    WHEN e.employee_gender = 'Female' THEN 'Female'
    ELSE NULL
  END,
  u.phone_number = e.employee_phone,
  u.employment_date = STR_TO_DATE('2020-01-15', '%Y-%m-%d'),
  u.updated_at = NOW()
WHERE u.employment_date IS NULL;

-- ── 3. Create employee profiles from employees ──────────────────────────────
INSERT IGNORE INTO employee_profiles (
  user_id,
  date_of_birth,
  nationality,
  created_at,
  updated_at
)
SELECT
  u.id,
  NULL,
  NULL,
  NOW(),
  NOW()
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM employee_profiles ep WHERE ep.user_id = u.id
)
AND u.employment_date IS NOT NULL;

-- ── 4. Create default employee financial info ──────────────────────────────
INSERT IGNORE INTO employee_financial_info (
  user_id,
  salary_payment_method,
  created_at,
  updated_at
)
SELECT
  u.id,
  'Bank Transfer',
  NOW(),
  NOW()
FROM users u
WHERE u.employment_date IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM employee_financial_info efi WHERE efi.user_id = u.id
  );

-- ── 5. Create leave balances for current fiscal year ──────────────────────
INSERT IGNORE INTO leave_balances (
  user_id,
  leave_type_id,
  fiscal_year,
  total_allocated,
  used,
  carried_forward,
  available,
  last_updated_at
)
SELECT
  u.id,
  lt.id,
  YEAR(NOW()),
  lt.max_days_per_year,
  0,
  0,
  lt.max_days_per_year,
  NOW()
FROM users u
CROSS JOIN leave_types lt
WHERE u.employment_date IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM leave_balances lb
    WHERE lb.user_id = u.id
    AND lb.leave_type_id = lt.id
    AND lb.fiscal_year = YEAR(NOW())
  );

-- ── 6. Create default employment contracts ──────────────────────────────────
INSERT IGNORE INTO employee_contracts (
  user_id,
  contract_type_id,
  contract_number,
  start_date,
  end_date,
  position_title,
  employment_level,
  status,
  created_at,
  updated_at
)
SELECT
  u.id,
  (SELECT id FROM contract_types WHERE code = 'FULLTIME_IND' LIMIT 1),
  u.username,
  u.employment_date,
  NULL,
  COALESCE(e.employee_position, 'Staff'),
  'Middle',
  'Active',
  NOW(),
  NOW()
FROM users u
INNER JOIN employees e ON u.username = e.employee_id
WHERE u.employment_date IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM employee_contracts ec WHERE ec.user_id = u.id
  );

SET FOREIGN_KEY_CHECKS = 1;

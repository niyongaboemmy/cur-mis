-- ==================================================================================
-- Migration: Migrate existing employees table data to users table with HR fields
-- Date: 2026-09-04
--
-- Purpose: Integrate existing 161 employees into the new HR module by:
-- - Merging employees data into users with HR fields using ON DUPLICATE KEY
-- - Initializing employee profiles, financial info, leave balances, contracts
-- - All operations use JOINs for efficiency
--
-- Idempotent — uses INSERT...ON DUPLICATE KEY UPDATE and LEFT/INNER JOINs
-- ==================================================================================

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- ── 1. Merge employees to users with HR fields (single-pass) ────────────────
-- Updates existing users, inserts new users from employees table
INSERT INTO users (
  username,
  full_name,
  email,
  password,
  phone,
  phone_number,
  gender,
  role_id,
  is_active,
  employment_date,
  created_at,
  updated_at
)
SELECT
  e.employee_id,
  CONCAT(e.employee_fname, ' ', e.employee_lname),
  CONCAT(LOWER(e.employee_fname), '.', LOWER(e.employee_lname), '@cur.ac.rw'),
  COALESCE(u.password, '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'),
  e.employee_phone,
  e.employee_phone,
  CASE WHEN e.employee_gender = 'Male' THEN 'Male' WHEN e.employee_gender = 'Female' THEN 'Female' ELSE NULL END,
  COALESCE(u.role_id, 2),
  1,
  STR_TO_DATE('2020-01-15', '%Y-%m-%d'),
  COALESCE(u.created_at, NOW()),
  NOW()
FROM employees e
LEFT JOIN users u ON u.username = e.employee_id
WHERE e.employee_id IS NOT NULL
ON DUPLICATE KEY UPDATE
  full_name = VALUES(full_name),
  email = VALUES(email),
  phone = VALUES(phone),
  phone_number = VALUES(phone_number),
  gender = VALUES(gender),
  employment_date = VALUES(employment_date),
  updated_at = NOW();

-- ── 2. Create employee profiles (JOIN with users and employees) ────────────
INSERT IGNORE INTO employee_profiles (
  user_id,
  created_at,
  updated_at
)
SELECT
  u.id,
  NOW(),
  NOW()
FROM users u
INNER JOIN employees e ON u.username = e.employee_id
WHERE u.employment_date IS NOT NULL;

-- ── 3. Create employee financial info (JOIN with users and employees) ──────
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
INNER JOIN employees e ON u.username = e.employee_id;

-- ── 4. Create leave balances (JOIN all users with leave types) ─────────────
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
INNER JOIN employees e ON u.username = e.employee_id
CROSS JOIN leave_types lt
WHERE u.employment_date IS NOT NULL;

-- ── 5. Create employment contracts (JOIN users, employees, contract types) ─
INSERT IGNORE INTO employee_contracts (
  user_id,
  contract_type_id,
  contract_number,
  start_date,
  position_title,
  employment_level,
  status,
  created_at,
  updated_at
)
SELECT
  u.id,
  ct.id,
  u.username,
  u.employment_date,
  COALESCE(e.employee_position, 'Staff'),
  'Middle',
  'Active',
  NOW(),
  NOW()
FROM users u
INNER JOIN employees e ON u.username = e.employee_id
INNER JOIN contract_types ct ON ct.code = 'FULLTIME_IND'
WHERE u.employment_date IS NOT NULL;

SET FOREIGN_KEY_CHECKS = 1;

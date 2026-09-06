-- ==================================================================================
-- Migration: Populate HR module data from hr_employees
-- Date: 2026-09-04
--
-- Purpose: Ensure all HR tables are properly populated with data from hr_employees
-- - Verify hr_employees exist and have user_id
-- - Populate leave_balances for all employees
-- - Populate employee_profiles
-- - Populate employee_contracts
-- - Populate employee_financial_info
--
-- This is a data-population fix for migrations 007 & 008
-- ==================================================================================

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- ── 1. Verify hr_employees table and user_id mapping ──────────────────────
-- First, check if hr_employees has user_id values
SELECT 'HR Employees count:', COUNT(*) FROM hr_employees;
SELECT 'HR Employees with user_id:', COUNT(*) FROM hr_employees WHERE user_id IS NOT NULL;

-- ── 2. Populate leave_balances from hr_employees ──────────────────────────
-- Create leave balances for all hr_employees across all leave types
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
  he.user_id,
  lt.id,
  YEAR(NOW()),
  lt.max_days_per_year,
  0,
  0,
  lt.max_days_per_year,
  NOW()
FROM hr_employees he
CROSS JOIN leave_types lt
WHERE he.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM leave_balances lb
    WHERE lb.user_id = he.user_id
    AND lb.leave_type_id = lt.id
    AND lb.fiscal_year = YEAR(NOW())
  );

-- ── 3. Populate employee_profiles from hr_employees ──────────────────────
INSERT IGNORE INTO employee_profiles (
  user_id,
  date_of_birth,
  nationality,
  created_at,
  updated_at
)
SELECT
  he.user_id,
  he.dob,
  NULL,
  NOW(),
  NOW()
FROM hr_employees he
WHERE he.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM employee_profiles ep WHERE ep.user_id = he.user_id
  );

-- ── 4. Populate employee_financial_info from hr_employees ──────────────────
INSERT IGNORE INTO employee_financial_info (
  user_id,
  rssb_number,
  tax_number,
  bank_name,
  bank_account_number,
  salary_payment_method,
  created_at,
  updated_at
)
SELECT
  he.user_id,
  he.rssb_no,
  he.tin_no,
  he.bank_name,
  he.bank_account,
  'Bank Transfer',
  NOW(),
  NOW()
FROM hr_employees he
WHERE he.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM employee_financial_info efi WHERE efi.user_id = he.user_id
  );

-- ── 5. Populate employee_contracts from hr_employees ──────────────────────
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
  he.user_id,
  ct.id,
  CONCAT('FULLTIME_', he.user_id),
  COALESCE(he.employment_date, DATE_SUB(NOW(), INTERVAL 1 YEAR)),
  COALESCE(he.position, 'Staff'),
  'Middle',
  'Active',
  NOW(),
  NOW()
FROM hr_employees he
INNER JOIN contract_types ct ON ct.code = 'FULLTIME_IND'
WHERE he.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM employee_contracts ec WHERE ec.user_id = he.user_id
  );

-- ── 6. Verify data was populated ─────────────────────────────────────────
SELECT 'VERIFICATION AFTER POPULATION:' as status;
SELECT 'leave_balances populated:', COUNT(*) FROM leave_balances;
SELECT 'employee_profiles populated:', COUNT(*) FROM employee_profiles;
SELECT 'employee_financial_info populated:', COUNT(*) FROM employee_financial_info;
SELECT 'employee_contracts populated:', COUNT(*) FROM employee_contracts;

SET FOREIGN_KEY_CHECKS = 1;

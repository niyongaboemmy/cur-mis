-- ==================================================================================
-- Migration: Integrate HR Module with existing hr_employees table
-- Date: 2026-09-04
--
-- Purpose: Connect existing hr_employees data to new HR module by:
-- - Populating employee_profiles, financial_info, qualifications from hr_employees
-- - Creating leave_balances for all leave types
-- - Creating default employment contracts
-- - All operations use JOINs with hr_employees table
--
-- Idempotent — uses INSERT IGNORE and INNER JOINs
-- ==================================================================================

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- ── 1. Create employee profiles from hr_employees ───────────────────────────
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

-- ── 2. Create employee financial info from hr_employees ─────────────────────
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
WHERE he.user_id IS NOT NULL;

-- ── 3. Create employee identifiers from hr_employees ───────────────────────
INSERT IGNORE INTO employee_identifiers (
  user_id,
  identifier_type,
  identifier_value,
  created_at,
  updated_at
)
SELECT
  he.user_id,
  'RSSB',
  he.rssb_no,
  NOW(),
  NOW()
FROM hr_employees he
WHERE he.user_id IS NOT NULL
  AND he.rssb_no IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM employee_identifiers ei
    WHERE ei.user_id = he.user_id
    AND ei.identifier_type = 'RSSB'
  );

-- ── 4. Add identifiers for TIN numbers ────────────────────────────────────
INSERT IGNORE INTO employee_identifiers (
  user_id,
  identifier_type,
  identifier_value,
  created_at,
  updated_at
)
SELECT
  he.user_id,
  'TAX_NUMBER',
  he.tin_no,
  NOW(),
  NOW()
FROM hr_employees he
WHERE he.user_id IS NOT NULL
  AND he.tin_no IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM employee_identifiers ei
    WHERE ei.user_id = he.user_id
    AND ei.identifier_type = 'TAX_NUMBER'
  );

-- ── 5. Create leave balances for all employees (all leave types) ────────────
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

-- ── 6. Create default employment contracts ────────────────────────────────
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
  (SELECT id FROM contract_types WHERE code = 'FULLTIME_IND' LIMIT 1),
  CONCAT('EMP_', he.user_id),
  COALESCE(he.employment_date, DATE_SUB(NOW(), INTERVAL 1 YEAR)),
  COALESCE(he.position, 'Staff'),
  'Middle',
  'Active',
  NOW(),
  NOW()
FROM hr_employees he
WHERE he.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM employee_contracts ec WHERE ec.user_id = he.user_id
  );

-- ── 7. Update users table with HR fields from hr_employees ──────────────────
UPDATE users u
INNER JOIN hr_employees he ON u.id = he.user_id
SET
  u.phone_number = he.mobile_no,
  u.employment_date = he.employment_date,
  u.updated_at = NOW()
WHERE u.employment_date IS NULL
  AND he.user_id IS NOT NULL;

SET FOREIGN_KEY_CHECKS = 1;

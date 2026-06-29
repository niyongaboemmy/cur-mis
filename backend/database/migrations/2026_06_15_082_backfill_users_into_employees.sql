-- Migration 082: make sure EVERY non-student/applicant user has a linked
-- `employees` record, so HR can assign lessons / payroll / leave to them.
--
-- Depends on migration 081 (employees.user_id).
-- Two safe, idempotent steps:
--   A. LINK existing employees to a user when they share an email (no new row).
--   B. CREATE an employees row for every remaining staff user not yet present.
-- Re-running is a no-op (guards on user_id link + email match).

-- ── A. Link an existing employee to its user account by email ────────────────
UPDATE `employees` e
JOIN `users` u ON u.email = e.employee_username
SET e.user_id = u.id
WHERE (e.user_id IS NULL OR e.user_id = 0)
  AND u.email IS NOT NULL AND u.email <> '';

-- ── B. Create a linked employee for every staff user still missing one ───────
INSERT INTO `employees`
  (`user_id`, `employee_fname`, `employee_lname`, `employee_gender`, `employee_age`,
   `employee_phone`, `employee_post`, `employee_position`, `additional_duty`, `faculty`,
   `employee_photo`, `employee_address`, `employee_status`, `employe_qr`, `employee_idcard`,
   `employee_bank`, `employee_account`, `employee_username`, `employee_password`,
   `employee_author`, `employee_reg_date`, `school_id`, `account_status`, `salary`)
SELECT
  u.id,
  -- Derive first/last from full_name only (portable across users-table variants).
  SUBSTRING_INDEX(u.full_name, ' ', 1),
  TRIM(SUBSTRING(u.full_name, LENGTH(SUBSTRING_INDEX(u.full_name, ' ', 1)) + 1)),
  '', '',
  COALESCE(u.phone, ''),
  '',                       -- employee_post (department) — fill in later
  r.name,                   -- employee_position = role label (sensible default)
  '', 0,
  '', '', 'Permanent', '', '',
  '', '',
  u.email,
  '',                       -- no employee password — login is via the user account
  'system-backfill',
  CURDATE(),
  0,
  CASE WHEN u.is_active = 1 THEN 'Active' ELSE 'Inactive' END,
  0.00
FROM `users` u
JOIN `roles` r ON r.id = u.role_id
-- The `employees` subqueries are wrapped in derived tables so MySQL materialises
-- them first — otherwise referencing the INSERT target table in the SELECT
-- raises error 1093 ("table specified twice").
WHERE r.name NOT IN ('student', 'applicant')
  AND u.id NOT IN (
        SELECT user_id FROM (SELECT user_id FROM `employees` WHERE user_id IS NOT NULL) z
      )
  AND (u.email IS NULL OR u.email = '' OR u.email NOT IN (
        SELECT employee_username FROM (
          SELECT employee_username FROM `employees` WHERE employee_username IS NOT NULL AND employee_username <> ''
        ) y
      ));

-- Migration 053: Add MY_INVOICE permission + wire up VIEW_MOBILE_PAYMENTS
--
-- Changes:
--   1. Add MY_INVOICE permission (Finance category, id=12)
--   2. Add VIEW_MOBILE_PAYMENTS to permissions table (was missing from DB)
--   3. Assign MY_INVOICE to the `student` role
--   4. Assign VIEW_MOBILE_PAYMENTS + VIEW_ONLINE_PAYMENTS_HISTORY to `finance_officer`
--   5. Remove VIEW_FINANCE from `student` role if it was ever accidentally added

-- 1. MY_INVOICE permission
INSERT IGNORE INTO permissions (category_id, name, slug, description, created_at, updated_at)
VALUES (
    12,
    'View My Invoices',
    'MY_INVOICE',
    'Students can view their own invoices, payment history and outstanding balance.',
    NOW(), NOW()
);

-- 2. VIEW_MOBILE_PAYMENTS (was in Permissions.php but missing from DB)
INSERT IGNORE INTO permissions (category_id, name, slug, description, created_at, updated_at)
VALUES (
    12,
    'View Mobile Payments',
    'VIEW_MOBILE_PAYMENTS',
    'View mobile money payment records (UrubutoPay / USSD).',
    NOW(), NOW()
);

-- 3. Assign MY_INVOICE to student role
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.slug = 'MY_INVOICE'
WHERE r.name = 'student';

-- 4. Assign VIEW_MOBILE_PAYMENTS and VIEW_ONLINE_PAYMENTS_HISTORY to finance_officer
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.slug IN ('VIEW_MOBILE_PAYMENTS', 'VIEW_ONLINE_PAYMENTS_HISTORY')
WHERE r.name = 'finance_officer';

-- 5. Safety: ensure student role does NOT have VIEW_FINANCE
DELETE rp FROM role_permissions rp
JOIN roles r       ON r.id = rp.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE r.name = 'student'
  AND p.slug = 'VIEW_FINANCE';

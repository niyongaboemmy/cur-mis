-- 2026_05_16_062_add_fine_grained_finance_permissions.sql
-- Adds granular permissions for each tab in the Finance module and grants them to Superadmin.

SET @cat_finance = (SELECT id FROM permission_categories WHERE name = 'Finance & Accounts' LIMIT 1);

INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
  (@cat_finance, 'View Finance Overview',  'VIEW_FINANCE_OVERVIEW',  'Access the finance overview dashboard.'),
  (@cat_finance, 'View Finance Billing',   'VIEW_FINANCE_BILLING',   'Access the finance billing ledger and invoices.'),
  (@cat_finance, 'View Finance Approvals', 'VIEW_FINANCE_APPROVALS', 'Access the finance pending approvals tab.'),
  (@cat_finance, 'View Finance Structures','VIEW_FINANCE_STRUCTURES','Access the fee rates and structures configuration.'),
  (@cat_finance, 'View Finance Bursaries', 'VIEW_FINANCE_BURSARIES', 'Access the student bursaries management tab.'),
  (@cat_finance, 'View Finance Sponsors',  'VIEW_FINANCE_SPONSORS',  'Access the sponsors and scholarships tab.'),
  (@cat_finance, 'View Finance Expenses',  'VIEW_FINANCE_EXPENSES',  'Access the finance expenses management tab.'),
  (@cat_finance, 'View Finance Refunds',   'VIEW_FINANCE_REFUNDS',   'Access the finance refunds processing tab.'),
  (@cat_finance, 'View Finance Balance',   'VIEW_FINANCE_BALANCE',   'Access the student balances tab.'),
  (@cat_finance, 'View Finance Clearance', 'VIEW_FINANCE_CLEARANCE', 'Access the financial clearance tab.'),
  (@cat_finance, 'View Finance Reports',   'VIEW_FINANCE_REPORTS',   'Access the financial reports and analytics tab.');

-- Grant all new finance permissions to Superadmin (role id = 1)
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 1, id FROM `permissions`
WHERE `slug` IN (
  'VIEW_FINANCE_OVERVIEW',
  'VIEW_FINANCE_BILLING',
  'VIEW_FINANCE_APPROVALS',
  'VIEW_FINANCE_STRUCTURES',
  'VIEW_FINANCE_BURSARIES',
  'VIEW_FINANCE_SPONSORS',
  'VIEW_FINANCE_EXPENSES',
  'VIEW_FINANCE_REFUNDS',
  'VIEW_FINANCE_BALANCE',
  'VIEW_FINANCE_CLEARANCE',
  'VIEW_FINANCE_REPORTS'
);

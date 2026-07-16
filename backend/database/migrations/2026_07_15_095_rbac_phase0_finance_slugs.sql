-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 095: RBAC Phase 0 — seed permission slugs for the not-yet-built
-- Finance modules (Budget Execution, Payment Calendar, Student Directory
-- finance view) called for in MIS_REVISION_REQUEST_IMPLEMENTATION_PLAN.md
-- §2.6 / Phase 0. These slugs exist so `Permissions::all()` (the single
-- source of truth) and the permissions-management UI stay ahead of Phase
-- 2-4 development; the routes/controllers that will enforce them land in
-- those later phases.
--
-- Deliberately Finance-only grants: Registrar/HR are excluded by omission,
-- matching the client's Cannot-Access matrix (Registrar cannot see budget
-- data). superadmin/admin are included for parity with every other
-- Finance permission in this catalog even though PermissionMiddleware
-- already bypasses the check for those two roles.
-- ══════════════════════════════════════════════════════════════════════════════

SET @cat_finance := (SELECT id FROM permission_categories WHERE name = 'Finance' LIMIT 1);
SET @cat_finance := COALESCE(@cat_finance, (SELECT id FROM permission_categories WHERE name = 'Finance & Accounts' LIMIT 1));
SET @cat_finance := COALESCE(@cat_finance, (SELECT id FROM permission_categories ORDER BY id LIMIT 1));

INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
  (@cat_finance, 'View Budget Execution',       'VIEW_BUDGET_EXECUTION',          'View budget execution report (planned/spent/balance/variance)'),
  (@cat_finance, 'Manage Budget Execution',     'MANAGE_BUDGET_EXECUTION',        'Create/edit budget execution entries and export reports'),
  (@cat_finance, 'View Payment Calendar',       'VIEW_PAYMENT_CALENDAR',          'View configured fee installment / registration deadline calendar'),
  (@cat_finance, 'Manage Payment Calendar',     'MANAGE_PAYMENT_CALENDAR',        'Create/edit/delete payment calendar events'),
  (@cat_finance, 'View Student Directory (Finance)', 'VIEW_STUDENT_DIRECTORY_FINANCE', 'Read-only student directory with fee/payment status, scoped to Finance');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` IN (
  'VIEW_BUDGET_EXECUTION', 'MANAGE_BUDGET_EXECUTION',
  'VIEW_PAYMENT_CALENDAR', 'MANAGE_PAYMENT_CALENDAR',
  'VIEW_STUDENT_DIRECTORY_FINANCE'
)
WHERE r.`name` IN ('superadmin', 'admin', 'finance_officer');

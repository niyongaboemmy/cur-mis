-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 096: Revoke two cross-department role_permissions grants that
-- violate the client's Cannot-Access matrix (RBAC Audit §6.2 in
-- MIS_REVISION_REQUEST_IMPLEMENTATION_PLAN.md), found by the Phase 0
-- automated regression suite (backend/scripts/rbac_regression_test.php):
--
--   1. `registrar` had VIEW_FINANCE — could read /api/finance/* (structures,
--      billing, budgets, refunds, sponsors, reports). Violates
--      "Registrar ⛔ budget."
--   2. `finance_officer` had VIEW_STUDENTS — could read the full
--      /api/students registrar record. Violates "Finance ⛔ registrar
--      academic non-financial data." Finance's own finance-scoped student
--      view is VIEW_STUDENT_DIRECTORY_FINANCE (migration 095), which this
--      migration does NOT touch.
--
-- Idempotent: DELETE ... is a no-op if the grant is already gone.
-- ══════════════════════════════════════════════════════════════════════════════

DELETE rp FROM `role_permissions` rp
JOIN `roles` r ON r.`id` = rp.`role_id`
JOIN `permissions` p ON p.`id` = rp.`permission_id`
WHERE r.`name` = 'registrar' AND p.`slug` = 'VIEW_FINANCE';

DELETE rp FROM `role_permissions` rp
JOIN `roles` r ON r.`id` = rp.`role_id`
JOIN `permissions` p ON p.`id` = rp.`permission_id`
WHERE r.`name` = 'finance_officer' AND p.`slug` = 'VIEW_STUDENTS';

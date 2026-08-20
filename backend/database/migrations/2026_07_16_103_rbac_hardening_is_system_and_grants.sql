-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 103: RBAC hardening — protect system roles + close permission
-- grant gaps found in RBAC_PERMISSIONS_AUDIT.md (2026-07-16).
--
-- This migration is purely additive/idempotent:
--   §1  Add `is_system` flag to `roles` so PermissionMiddleware/RoleController
--       can stop matching on the role NAME string (Finding A — a role named
--       exactly "admin"/"superadmin" currently bypasses every permission
--       check no matter what is actually in its role_permissions rows).
--       The 8 canonical roles are flagged is_system = 1; everything else
--       (custom roles created via the UI) stays 0.
--   §2  Grant the "dead" finance sub-permissions (VIEW_FINANCE_OVERVIEW,
--       _BILLING, _APPROVALS, _STRUCTURES, _BURSARIES, _SPONSORS, _EXPENSES,
--       _REFUNDS, _BALANCE, _CLEARANCE, _REPORTS — Finding B) to the roles
--       that already hold the coarse VIEW_FINANCE/MANAGE_FINANCE grant, so
--       that once routes/finance.php is updated to check the granular slug
--       (a follow-up code change — see RBAC_IMPLEMENTATION_PLAN.md Phase 3)
--       existing finance users are not locked out.
--   §3  No DELETE / no DROP — safe to run against production.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── §1  Protect canonical system roles from rename/delete ───────────────────

-- Guarded via INFORMATION_SCHEMA rather than `ADD COLUMN IF NOT EXISTS`, which
-- is MariaDB-only syntax and is a 1064 syntax error on MySQL 8.
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='roles' AND COLUMN_NAME='is_system');
SET @stmt := IF(@col=0,
  'ALTER TABLE `roles` ADD COLUMN `is_system` TINYINT(1) NOT NULL DEFAULT 0 AFTER `description`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

UPDATE `roles`
SET `is_system` = 1
WHERE `name` IN (
    'superadmin', 'admin', 'registrar', 'hr_manager',
    'lecturer', 'finance_officer', 'applicant', 'student'
);

-- ── §2  Close finance sub-permission grant gap (Finding B) ──────────────────
-- Grant every granular VIEW_FINANCE_* slug to any role that already holds
-- the coarse VIEW_FINANCE or MANAGE_FINANCE permission, so tightening
-- finance.php to check the granular slug (Phase 3 of the implementation
-- plan) does not silently 403 existing users.

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT rp.`role_id`, p.`id`
FROM `role_permissions` rp
JOIN `permissions` coarse ON coarse.`id` = rp.`permission_id`
                          AND coarse.`slug` IN ('VIEW_FINANCE', 'MANAGE_FINANCE')
JOIN `permissions` p ON p.`slug` IN (
    'VIEW_FINANCE_OVERVIEW', 'VIEW_FINANCE_BILLING', 'VIEW_FINANCE_APPROVALS',
    'VIEW_FINANCE_STRUCTURES', 'VIEW_FINANCE_BURSARIES', 'VIEW_FINANCE_SPONSORS',
    'VIEW_FINANCE_EXPENSES', 'VIEW_FINANCE_REFUNDS', 'VIEW_FINANCE_BALANCE',
    'VIEW_FINANCE_CLEARANCE', 'VIEW_FINANCE_REPORTS'
);

-- ── §3  Wire up remaining catalogued-but-unassigned slugs ───────────────────
-- VIEW_EXAMS / VIEW_TIMETABLE — extend to lecturer (was only on registrar).
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` IN ('VIEW_EXAMS', 'VIEW_TIMETABLE')
WHERE r.`name` = 'lecturer';

-- VIEW_SETTINGS — extend to lecturer for parity with other read-only system info.
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` = 'VIEW_SETTINGS'
WHERE r.`name` = 'lecturer';

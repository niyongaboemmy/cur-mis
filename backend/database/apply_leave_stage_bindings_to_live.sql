-- ══════════════════════════════════════════════════════════════════════════════
-- PRODUCTION SCRIPT — apply migration 137 to the live cPanel database by hand.
--
-- WHAT IT FIXES
--   A leave request reaches the DAF (or VC) stage and stops there forever. The
--   stage is gated on a permission, and the only roles holding that permission
--   — `daf`, `vice_chancellor` — have no accounts in them, because the real
--   officers were put on roles the institution created under its own names.
--   Nothing errors; the request simply never moves.
--
-- HOW TO RUN
--   cPanel → phpMyAdmin → pick the live database → SQL tab → paste all of this
--   → Go. Alternatively let the GitHub Actions migrate workflow apply
--   migration 137; this file is the same statements, for applying by hand.
--
--   Idempotent — safe to re-run. It writes only role→permission grants. No
--   student, staff, leave or mark data is touched, and nothing is dropped.
--
-- READ §4 BEFORE RUNNING
--   §4 binds the role literally named 'Director of finance and administration'
--   to the DAF signing stage. If the live site spells that office differently,
--   change the name there to match. Nothing else needs editing.
--
-- AFTER RUNNING
--   The last query prints every stage permission with the roles that can sign
--   it and how many active accounts each has. A stage showing 0 accounts still
--   needs a person attached in Settings → Users — no SQL can decide who that
--   is.
-- ══════════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 137: Bind the leave approval stages to the roles that actually
-- exist, and make that binding durable.
-- Date: 2026-08-17
--
-- THE BUG
-- ───────
-- A leave stage does not name a role. It names a permission:
--
--   leave_approval_stages.required_permission_slug
--        └─> permissions.slug
--              └─> role_permissions.permission_id
--                    └─> roles.id  ──> users.role_id
--
-- Migration 135 supplied that middle link for four office roles it created
-- itself — vice_chancellor, hr_manager, daf, HOD. But live sites do not staff
-- those roles. Administrators create offices through Settings → Roles with the
-- names the institution actually uses ("Director of finance and administration",
-- "Academic Secretary", "vrac", …) and put the real accounts there. Those roles
-- hold no APPROVE_LEAVE_* permission, so the chain editor reports
-- "vice_chancellor (0)" / "daf (0)" and a request that reaches that stage
-- queues at an empty office forever. Nothing errors; it simply never moves.
--
-- Worse, migration 135 §4 enforced separation of duties with a hard-coded
-- whitelist of those same four names. An administrator who fixed the problem by
-- granting APPROVE_LEAVE_DAF to their real DAF role through the Roles screen
-- had that grant silently deleted the next time the sweep ran on a fresh
-- environment — the manual fix could not survive a deploy.
--
-- THE FIX
-- ───────
-- The whitelist stops being a literal in a migration and becomes a table:
-- `leave_stage_role_bindings`. It is the record of which office signs which
-- stage. Grants are derived from it, the separation-of-duties sweep is driven
-- by it, and `RoleController::assignPermissions` writes to it whenever an
-- administrator grants or revokes a stage permission in the UI — so a fix made
-- through the screen is now a first-class fact rather than something the next
-- migration undoes.
--
-- This migration takes the CURRENT live grants as the starting truth (§2)
-- before adding any defaults, so no existing approver anywhere loses the
-- ability to sign.
--
-- Idempotent — safe to re-run.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. The bindings table ────────────────────────────────────────────────────
-- role_name rather than role_id: roles are created and deleted by hand on live
-- sites, and a binding for a role that does not exist yet is a harmless no-op
-- rather than a foreign-key failure. `name` is UNIQUE on `roles`, so the join
-- back is exact.
CREATE TABLE IF NOT EXISTS `leave_stage_role_bindings` (
  `id`              INT(11)      NOT NULL AUTO_INCREMENT,
  `role_name`       VARCHAR(50)  NOT NULL,
  `permission_slug` VARCHAR(100) NOT NULL,
  `note`            VARCHAR(190) NULL,
  `created_at`      TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_leave_stage_binding` (`role_name`, `permission_slug`),
  KEY `idx_leave_stage_binding_perm` (`permission_slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 2. Adopt the current live state, ONCE ───────────────────────────────────
-- Whatever holds a stage permission at the moment this migration first runs —
-- whether migration 135 granted it or an administrator did through the Roles
-- screen — is recorded before any default is added. That is what makes §6 safe
-- on the first pass: the sweep cannot strip an approver who was already
-- signing.
--
-- The @adopt guard matters. Without it the adoption would re-run every time,
-- quietly legitimising any stage grant that had appeared since — and the
-- separation-of-duties sweep in §6 would become a permanent no-op, because
-- everything it exists to catch would have been adopted a few statements
-- earlier. After the first run this table is the authority, and a grant has to
-- be registered through it: by a migration, or by Settings → Roles, which
-- writes the binding via RoleController::syncLeaveStageBindings().
SET @adopt := (SELECT COUNT(*) = 0 FROM `leave_stage_role_bindings`);

INSERT IGNORE INTO `leave_stage_role_bindings` (`role_name`, `permission_slug`, `note`)
SELECT r.`name`, p.`slug`, 'Adopted from the live grants at migration 137'
FROM `role_permissions` rp
JOIN `roles` r       ON r.`id` = rp.`role_id`
JOIN `permissions` p ON p.`id` = rp.`permission_id`
WHERE @adopt = 1
  AND p.`slug` LIKE 'APPROVE\_LEAVE\_%'
  AND r.`name` <> 'superadmin';

-- ── 3. The default offices ──────────────────────────────────────────────────
-- Mirrors migration 135. Only takes effect where the role exists; on a site
-- that never staffed these, they stay as zero-holder rows the chain editor
-- reports honestly.
INSERT IGNORE INTO `leave_stage_role_bindings` (`role_name`, `permission_slug`, `note`) VALUES
  ('vice_chancellor', 'APPROVE_LEAVE_VC',    'Step 2 — Vice Chancellor review'),
  ('vice_chancellor', 'APPROVE_LEAVE_FINAL', 'Step 5 — final authorisation; grants the leave'),
  ('hr_manager',      'APPROVE_LEAVE_HR',    'Step 3 — HR recommendation'),
  ('daf',             'APPROVE_LEAVE_DAF',   'Step 4 — Director of Administration & Finance'),
  ('HOD',             'APPROVE_LEAVE_L1',    'Generic stage 1, for leave types on the short chain');

-- ── 4. Institutional aliases ────────────────────────────────────────────────
-- The same office under the name this institution gave it. Each row is a
-- deliberate statement that the named role signs that stage — add to this list
-- rather than editing roles when a site names its offices differently.
--
-- 'Director of finance and administration' is the DAF office on the live site;
-- `daf` exists there but has never had an account attached to it. Binding the
-- staffed role is preferred over moving the account, because moving a user
-- between roles silently changes every other permission they hold.
--
-- vrac (Vice Rector Academic) is deliberately NOT bound to APPROVE_LEAVE_VC —
-- it is a different office from the Vice Chancellor, and guessing there would
-- hand leave authorisation to the wrong person.
INSERT IGNORE INTO `leave_stage_role_bindings` (`role_name`, `permission_slug`, `note`)
SELECT r.`name`, 'APPROVE_LEAVE_DAF', 'Step 4 — the DAF office under its institutional name'
FROM `roles` r
WHERE r.`name` = 'Director of finance and administration';

-- ── 5. Apply the bindings ───────────────────────────────────────────────────
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `leave_stage_role_bindings` b
JOIN `roles` r       ON r.`name` = b.`role_name`
JOIN `permissions` p ON p.`slug` = b.`permission_slug`;

-- A role that can sign but cannot open the register or reach a landing page
-- after signing in is not a working approver. Re-asserted for every bound role,
-- including ones bound by hand since 135.
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT DISTINCT r.`id`, p.`id`
FROM `leave_stage_role_bindings` b
JOIN `roles` r       ON r.`name` = b.`role_name`
JOIN `permissions` p ON p.`slug` IN ('VIEW_LEAVE_REQUESTS', 'VIEW_DASHBOARD', 'REQUEST_LEAVE');

-- ── 6. Separation of duties, driven by the table ────────────────────────────
-- Still guarantees no account walks a request through two consecutive stages
-- single-handed, but it now removes only grants that were never registered as a
-- binding. §2 adopted everything that already existed, so on the first run this
-- deletes nothing.
DELETE rp FROM `role_permissions` rp
JOIN `roles` r       ON r.`id` = rp.`role_id`
JOIN `permissions` p ON p.`id` = rp.`permission_id`
LEFT JOIN `leave_stage_role_bindings` b
       ON b.`role_name` = r.`name` AND b.`permission_slug` = p.`slug`
WHERE p.`slug` LIKE 'APPROVE\_LEAVE\_%'
  AND b.`id` IS NULL
  AND r.`name` <> 'superadmin';

-- ── 7. Mark the migration as applied ────────────────────────────────────────
-- So the deploy runner does not run it a second time. Harmless if it already
-- ran through the runner, and harmless if the ledger does not exist yet.
INSERT IGNORE INTO `schema_migrations` (`filename`, `status`)
VALUES ('2026_08_17_137_leave_stage_role_bindings.sql', 'applied');

-- ── 8. Verify ───────────────────────────────────────────────────────────────
-- One row per signing stage. `signatories` is the number of active accounts
-- that can actually decide it. Any stage reading 0 will still stall a request.
SELECT p.`slug`                                        AS stage_permission,
       COALESCE(GROUP_CONCAT(r.`name` ORDER BY r.`name` SEPARATOR ', '),
                '(nobody — this stage will stall)')    AS roles_bound,
       COALESCE(SUM((SELECT COUNT(*) FROM `users` u
                      WHERE u.`role_id` = r.`id` AND u.`is_active` = 1)), 0) AS signatories
FROM `permissions` p
LEFT JOIN `role_permissions` rp ON rp.`permission_id` = p.`id`
LEFT JOIN `roles` r             ON r.`id` = rp.`role_id` AND r.`name` <> 'superadmin'
WHERE p.`slug` LIKE 'APPROVE\_LEAVE\_%'
GROUP BY p.`slug`
ORDER BY p.`slug`;

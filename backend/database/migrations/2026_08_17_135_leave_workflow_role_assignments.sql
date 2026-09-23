-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 135: Roles for each step of the leave approval flow, and the
-- permissions each of those roles needs to actually do the job.
-- Date: 2026-08-17
--
-- HOW A STEP IS BOUND TO A ROLE
-- ─────────────────────────────
-- A stage never names a role directly. It names a PERMISSION, and roles hold
-- permissions:
--
--   leave_approval_stages.required_permission_slug
--        └─> permissions.slug
--              └─> role_permissions.permission_id
--                    └─> roles.id  ──> users.role_id
--
-- The indirection is deliberate: more than one role can sign the same step (a
-- deputy, an acting officer, a second HR account) without editing the chain, and
-- reassigning an office is a role grant rather than a schema change. This
-- migration supplies the middle link — which role holds which stage permission.
--
--   Step 1  Prepared by (Responsible Officer)  REQUEST_LEAVE        every staff role
--   Step 2  Vice Chancellor                    APPROVE_LEAVE_VC     vice_chancellor
--   Step 3  HR — Recommendation                APPROVE_LEAVE_HR     hr_manager
--   Step 4  DAF — Director of Admin & Finance  APPROVE_LEAVE_DAF    daf
--   Step 5  Vice Chancellor — Final Auth.      APPROVE_LEAVE_FINAL  vice_chancellor
--
-- Migration 134 created the office roles and gave each its stage permission, but
-- left them otherwise bare — hr_manager held exactly one permission, so an HR
-- manager could sign a stage and yet not open the leave register or the
-- dashboard. This migration completes each role into a usable account.
--
-- Idempotent — safe to re-run.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. The offices exist (no-op after 134; stated here so this file stands alone)
INSERT IGNORE INTO `roles` (`name`, `description`) VALUES
  ('vice_chancellor', 'Vice Chancellor — signs the VC review and the final authorisation of staff leave.'),
  ('daf',             'Director of Administration & Finance — signs the DAF stage of staff leave.'),
  ('hr_manager',      'Human Resources — recommends staff leave and administers leave types, balances and the approval chain.');

-- ── 2. The grant matrix ─────────────────────────────────────────────────────
-- One row per (role, permission). Everything an office needs to sign its step
-- and to work the module, and nothing more.
--
-- Baseline for every reviewer: reach the dashboard after signing in, read the
-- leave register they are deciding on, and file their own leave.
DROP TEMPORARY TABLE IF EXISTS `tmp_leave_role_grants`;
CREATE TEMPORARY TABLE `tmp_leave_role_grants` (
  `role_name`       VARCHAR(80)  NOT NULL,
  `permission_slug` VARCHAR(100) NOT NULL,
  `note`            VARCHAR(160) NULL,
  PRIMARY KEY (`role_name`, `permission_slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `tmp_leave_role_grants` (`role_name`, `permission_slug`, `note`) VALUES
  -- ── Vice Chancellor: steps 2 and 5 ──
  ('vice_chancellor', 'APPROVE_LEAVE_VC',      'Step 2 — Vice Chancellor review'),
  ('vice_chancellor', 'APPROVE_LEAVE_FINAL',   'Step 5 — final authorisation; grants the leave'),
  ('vice_chancellor', 'VIEW_LEAVE_REQUESTS',   'Read the register being decided on'),
  ('vice_chancellor', 'VIEW_DASHBOARD',        'Land somewhere after signing in'),
  ('vice_chancellor', 'REQUEST_LEAVE',         'File their own leave'),

  -- ── HR: step 3, plus the module administration HR owns ──
  ('hr_manager',      'APPROVE_LEAVE_HR',      'Step 3 — HR recommendation'),
  ('hr_manager',      'VIEW_LEAVE_REQUESTS',   'Read the register'),
  ('hr_manager',      'MANAGE_LEAVE_REQUESTS', 'Cancel a request outside the chain; edit balances'),
  ('hr_manager',      'MANAGE_LEAVE_TYPES',    'Maintain leave types and their approval chains'),
  ('hr_manager',      'VIEW_HR_EMPLOYEES',     'File leave on an employee''s behalf'),
  ('hr_manager',      'VIEW_DASHBOARD',        'Land somewhere after signing in'),
  ('hr_manager',      'REQUEST_LEAVE',         'File their own leave'),

  -- ── DAF: step 4 ──
  ('daf',             'APPROVE_LEAVE_DAF',     'Step 4 — Director of Administration & Finance'),
  ('daf',             'VIEW_LEAVE_REQUESTS',   'Read the register being decided on'),
  ('daf',             'VIEW_DASHBOARD',        'Land somewhere after signing in'),
  ('daf',             'REQUEST_LEAVE',         'File their own leave');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `tmp_leave_role_grants` g
JOIN `roles` r       ON r.`name` = g.`role_name`
JOIN `permissions` p ON p.`slug` = g.`permission_slug`;

DROP TEMPORARY TABLE IF EXISTS `tmp_leave_role_grants`;

-- ── 3. Step 1 — "Prepared by (Responsible Officer)" ─────────────────────────
-- Not an approval stage: it is the submission, so its "role" is simply anyone who
-- may file leave. Migration 080 granted REQUEST_LEAVE to every staff role; this
-- re-asserts it for roles created since.
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` = 'REQUEST_LEAVE'
WHERE r.`name` NOT IN ('applicant', 'student', 'guest');

-- ── 4. Separation of duties ─────────────────────────────────────────────────
-- No office may hold a stage permission that is not its own step. Without this,
-- one account could sign two consecutive stages and walk a request through the
-- chain single-handed. (Superadmin is excluded from explicit stage grants
-- entirely — see migration 133 on notification fan-out.)
DELETE rp FROM `role_permissions` rp
JOIN `roles` r       ON r.`id` = rp.`role_id`
JOIN `permissions` p ON p.`id` = rp.`permission_id`
WHERE p.`slug` LIKE 'APPROVE_LEAVE_%'
  AND NOT (
        (r.`name` = 'vice_chancellor' AND p.`slug` IN ('APPROVE_LEAVE_VC', 'APPROVE_LEAVE_FINAL'))
     OR (r.`name` = 'hr_manager'      AND p.`slug` = 'APPROVE_LEAVE_HR')
     OR (r.`name` = 'daf'             AND p.`slug` = 'APPROVE_LEAVE_DAF')
        -- HOD keeps the generic stage-1 slug for any leave type configured with
        -- the shorter L1/L2 chain instead of the institutional one.
     OR (r.`name` = 'HOD'             AND p.`slug` = 'APPROVE_LEAVE_L1')
  );

-- ──────────────────────────────────────────────────────────────────────────────
-- ASSIGNING PEOPLE TO THESE OFFICES
-- ──────────────────────────────────────────────────────────────────────────────
-- The roles are created and permissioned, but a role with no accounts cannot
-- sign anything — a request will simply queue at that step. Attach the real
-- accounts either in Settings → Users, or with SQL like the following (left
-- commented because only you know who holds each office):
--
--   UPDATE `users` SET `role_id` = (SELECT `id` FROM `roles` WHERE `name` = 'vice_chancellor')
--    WHERE `email` = 'vc@cur.ac.rw';
--
--   UPDATE `users` SET `role_id` = (SELECT `id` FROM `roles` WHERE `name` = 'daf')
--    WHERE `email` = 'daf@cur.ac.rw';
--
--   UPDATE `users` SET `role_id` = (SELECT `id` FROM `roles` WHERE `name` = 'hr_manager')
--    WHERE `email` = 'hr@cur.ac.rw';
--
-- To check the flow is fully staffed afterwards:
--
--   SELECT s.stage_order, s.stage_label, s.required_permission_slug,
--          GROUP_CONCAT(DISTINCT r.name)              AS roles,
--          COUNT(DISTINCT u.id)                       AS signatories
--     FROM leave_approval_stages s
--     LEFT JOIN permissions      p  ON p.slug = s.required_permission_slug
--     LEFT JOIN role_permissions rp ON rp.permission_id = p.id
--     LEFT JOIN roles            r  ON r.id = rp.role_id AND r.name <> 'superadmin'
--     LEFT JOIN users            u  ON u.role_id = r.id AND u.is_active = 1
--    WHERE s.leave_type_id = 1
--    GROUP BY s.stage_order, s.stage_label, s.required_permission_slug
--    ORDER BY s.stage_order;
--
-- Any row with signatories = 0 is a step nobody can sign. The chain editor
-- (Leave Management → Approval Chain) flags the same thing in the UI.
-- ──────────────────────────────────────────────────────────────────────────────

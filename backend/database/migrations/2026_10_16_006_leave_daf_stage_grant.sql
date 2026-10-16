-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 006 (2026-10-16): Let the DAF sign the DAF stage of leave requests.
--
-- THE PROBLEM
-- ───────────
-- The DAF stage of a leave request is gated on APPROVE_LEAVE_DAF. Only roles
-- that hold that permission can sign it. On the live site the DAF office is
-- staffed under the institutional name "Director of finance and administration"
-- and the seeded `daf` role has no accounts, so no one who can sign the stage is
-- reachable from the DAF's own login.
--
-- WHAT THIS DOES
-- ──────────────
--   1. Makes sure the permission exists.
--   2. Registers the DAF office's binding to that permission, under both names
--      the office may carry (`daf` and the institutional name), so the grant
--      survives Settings → Roles syncs and later migration sweeps.
--   3. Grants those roles the permission, and the minimum needed to open the
--      leave register and land somewhere after signing in.
--
-- WHAT THIS DOES NOT DO
-- ─────────────────────
--   • It does not decide any leave request. A request already sitting at the DAF
--     stage is signed by the DAF from the Leave Approvals queue, not by this file.
--   • It does not grant APPROVE_LEAVE_FINAL, and it does not move any user account
--     between roles. Attaching the DAF's account to the role is still a separate,
--     explicit step (see the commented example at the bottom).
--   • It does not touch superadmin grants.
--
-- Idempotent — safe to re-run.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. The permission ───────────────────────────────────────────────────────
SET @cat_hr = (SELECT `id` FROM `permission_categories` WHERE `name` = 'HR Management' LIMIT 1);

INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
  (@cat_hr, 'Approve Leave — DAF', 'APPROVE_LEAVE_DAF',
   'Sign the Director of Administration & Finance stage of a leave request.');

-- ── 2. Bindings: which office signs the DAF stage ───────────────────────────
INSERT IGNORE INTO `leave_stage_role_bindings` (`role_name`, `permission_slug`, `note`) VALUES
  ('daf', 'APPROVE_LEAVE_DAF',
   'Step 4 — Director of Administration & Finance (migration 2026_10_16_006)'),
  ('Director of finance and administration', 'APPROVE_LEAVE_DAF',
   'Step 4 — DAF office under its institutional name (migration 2026_10_16_006)');

-- ── 3. Create the DAF roles if the site has never created them ──────────────
-- Only the bound names are created here; an existing role is left untouched.
INSERT IGNORE INTO `roles` (`name`, `description`) VALUES
  ('daf', 'Director of Administration & Finance — signs the DAF stage of staff leave.');

-- ── 4. Apply the grants to every bound role that exists ─────────────────────
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `leave_stage_role_bindings` b
JOIN `roles` r       ON r.`name` = b.`role_name`
JOIN `permissions` p ON p.`slug` = b.`permission_slug`
WHERE b.`permission_slug` = 'APPROVE_LEAVE_DAF';

-- A signer who cannot open the register or land somewhere after sign-in is not a
-- working approver.
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT DISTINCT r.`id`, p.`id`
FROM `leave_stage_role_bindings` b
JOIN `roles` r       ON r.`name` = b.`role_name`
JOIN `permissions` p ON p.`slug` IN ('VIEW_LEAVE_REQUESTS', 'VIEW_DASHBOARD', 'REQUEST_LEAVE')
WHERE b.`permission_slug` = 'APPROVE_LEAVE_DAF';

-- ── 5. Attaching the DAF's account (run by hand; only you know who it is) ───
-- Either give the DAF's login one of the roles above in Settings → Users, or:
--
--   UPDATE `users`
--      SET `role_id` = (SELECT `id` FROM `roles` WHERE `name` = 'daf')
--    WHERE `email` = 'daf@cur.ac.rw';
--
-- Moving an account changes every permission it holds, so check the role first.

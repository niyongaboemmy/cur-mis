-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 134: Replace the placeholder leave chain with the institution's own
-- signature sequence.
-- Date: 2026-08-17
--
-- Migration 132 seeded a generic two-stage chain (Supervisor / HOD Review → HR
-- Approval) as a stand-in. The actual sequence, matching the mission
-- authorisation form's approval flow, is five steps:
--
--   1. Prepared by (Responsible Officer)   ← the requester; the submission itself
--   2. Vice Chancellor
--   3. HR — Recommendation
--   4. DAF — Director of Administration & Finance
--   5. Vice Chancellor — Final Authorization
--
-- Step 1 is the submission, already recorded as the 'submission' audit event, so
-- only steps 2-5 are approval stages in `leave_approval_stages`.
--
-- The Vice Chancellor signs twice (steps 2 and 5). Those are two distinct
-- permission slugs, not one, so a chain can put a different office in the final
-- position without also handing it the first review.
--
-- Idempotent — safe to re-run.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. Role-named stage permissions ─────────────────────────────────────────
SET @cat_hr = (SELECT `id` FROM `permission_categories` WHERE `name` = 'HR Management' LIMIT 1);

INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
  (@cat_hr, 'Approve Leave — Vice Chancellor', 'APPROVE_LEAVE_VC',  'Sign the Vice Chancellor review stage of a leave request.'),
  (@cat_hr, 'Approve Leave — HR',              'APPROVE_LEAVE_HR',  'Sign the HR recommendation stage of a leave request.'),
  (@cat_hr, 'Approve Leave — DAF',             'APPROVE_LEAVE_DAF', 'Sign the Director of Administration & Finance stage of a leave request.');

-- Keep the description of the final stage accurate now that it is named.
UPDATE `permissions`
   SET `name` = 'Approve Leave — Final Authorization',
       `description` = 'Give a leave request its final authorisation. This grants the leave and debits the balance.'
 WHERE `slug` = 'APPROVE_LEAVE_FINAL';

-- ── 2. The offices that sign ────────────────────────────────────────────────
-- The Vice Chancellor and DAF had no roles at all, so the chain could not be
-- assigned to anyone. Created here (idempotent on the unique name) and left for
-- an administrator to attach real user accounts to.
INSERT IGNORE INTO `roles` (`name`, `description`) VALUES
  ('vice_chancellor', 'Vice Chancellor — signs the VC review and the final authorisation of staff leave.'),
  ('daf',             'Director of Administration & Finance — signs the DAF stage of staff leave.');

-- NOTE FOR WHOEVER RUNS THIS: both roles are created empty. Until an
-- administrator assigns real accounts to 'vice_chancellor' and 'daf', those
-- stages have no one who can sign them, and requests will queue there. The
-- chain editor flags any stage whose permission nobody holds.
--
-- Vice Chancellor: both of their stages, plus the ability to see the register.
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` IN ('APPROVE_LEAVE_VC', 'APPROVE_LEAVE_FINAL', 'VIEW_LEAVE_REQUESTS', 'REQUEST_LEAVE')
WHERE r.`name` = 'vice_chancellor';

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` IN ('APPROVE_LEAVE_DAF', 'VIEW_LEAVE_REQUESTS', 'REQUEST_LEAVE')
WHERE r.`name` = 'daf';

-- HR signs the recommendation stage.
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` = 'APPROVE_LEAVE_HR'
WHERE r.`name` = 'hr_manager';

-- ...and only that stage. Migration 132's placeholder chain made HR the final
-- approver, so hr_manager was granted APPROVE_LEAVE_FINAL. Under the real flow
-- HR only recommends: leaving that grant in place would let HR authorise leave
-- outright, skipping DAF and the Vice Chancellor. Revoked here.
DELETE rp FROM `role_permissions` rp
JOIN `roles` r       ON r.`id` = rp.`role_id`
JOIN `permissions` p ON p.`id` = rp.`permission_id`
WHERE r.`name` = 'hr_manager'
  AND p.`slug` IN ('APPROVE_LEAVE_FINAL', 'APPROVE_LEAVE_L1', 'APPROVE_LEAVE_L2');

-- Superadmin is deliberately NOT granted these explicitly — it bypasses
-- permission checks anyway, and an explicit grant would make every superadmin a
-- routine recipient of every leave notification (see migration 133).
DELETE rp FROM `role_permissions` rp
JOIN `roles` r       ON r.`id` = rp.`role_id`
JOIN `permissions` p ON p.`id` = rp.`permission_id`
WHERE r.`name` = 'superadmin'
  AND p.`slug` IN ('APPROVE_LEAVE_VC', 'APPROVE_LEAVE_HR', 'APPROVE_LEAVE_DAF',
                   'APPROVE_LEAVE_L1', 'APPROVE_LEAVE_L2', 'APPROVE_LEAVE_FINAL');

-- ── 3. Re-seed the chain, but only where it is still 132's placeholder ──────
-- A leave type whose chain an administrator has since customised is left alone:
-- the placeholder is recognised by its exact stage keys.
CREATE TEMPORARY TABLE IF NOT EXISTS `tmp_default_chain_types` AS
SELECT lt.`id`
FROM `leave_types` lt
WHERE (
        SELECT GROUP_CONCAT(s.`stage_key` ORDER BY s.`stage_order`)
        FROM `leave_approval_stages` s
        WHERE s.`leave_type_id` = lt.`id`
      ) = 'supervisor_review,hr_approval'
   OR NOT EXISTS (SELECT 1 FROM `leave_approval_stages` s2 WHERE s2.`leave_type_id` = lt.`id`);

DELETE FROM `leave_approval_stages`
WHERE `leave_type_id` IN (SELECT `id` FROM `tmp_default_chain_types`);

INSERT INTO `leave_approval_stages`
  (`leave_type_id`, `stage_order`, `stage_key`, `stage_label`, `required_permission_slug`, `is_final_approval`, `sla_hours`)
SELECT t.`id`, 1, 'vice_chancellor', 'Vice Chancellor', 'APPROVE_LEAVE_VC', 0, 48
FROM `tmp_default_chain_types` t;

INSERT INTO `leave_approval_stages`
  (`leave_type_id`, `stage_order`, `stage_key`, `stage_label`, `required_permission_slug`, `is_final_approval`, `sla_hours`)
SELECT t.`id`, 2, 'hr_recommendation', 'HR — Recommendation', 'APPROVE_LEAVE_HR', 0, 48
FROM `tmp_default_chain_types` t;

INSERT INTO `leave_approval_stages`
  (`leave_type_id`, `stage_order`, `stage_key`, `stage_label`, `required_permission_slug`, `is_final_approval`, `sla_hours`)
SELECT t.`id`, 3, 'daf_review', 'DAF — Director of Administration & Finance', 'APPROVE_LEAVE_DAF', 0, 48
FROM `tmp_default_chain_types` t;

INSERT INTO `leave_approval_stages`
  (`leave_type_id`, `stage_order`, `stage_key`, `stage_label`, `required_permission_slug`, `is_final_approval`, `sla_hours`)
SELECT t.`id`, 4, 'vc_final_authorization', 'Vice Chancellor — Final Authorization', 'APPROVE_LEAVE_FINAL', 1, 48
FROM `tmp_default_chain_types` t;

DROP TEMPORARY TABLE IF EXISTS `tmp_default_chain_types`;

-- ── 4a. Retire action prompts the chain change invalidated ─────────────────
-- A request already in flight keeps its `current_stage_order`, but the office
-- that owns that position has changed (stage 1 was the supervisor/HOD, it is now
-- the Vice Chancellor). Anyone told "this needs your decision" under the old
-- chain can no longer act on it, so that prompt is now misleading: retire it.
UPDATE `notifications` n
   SET n.`is_read` = 1, n.`read_at` = NOW()
 WHERE n.`type` = 'LEAVE_AWAITING_DECISION'
   AND n.`is_read` = 0
   AND n.`entity_type` = 'leave_request'
   AND n.`entity_id` IN (SELECT lr.`id` FROM `leave_requests` lr WHERE lr.`status` = 'Pending');

-- ── 4b. Tell the office that now owns each in-flight request ───────────────
-- Same fan-out NotificationService::pushToPermissionHolders performs: whoever
-- holds the stage's permission, excluding the requester and excluding
-- superadmins (who hold everything implicitly and would otherwise all be
-- notified about every request).
INSERT INTO `notifications`
  (`user_id`, `type`, `title`, `message`, `link`, `entity_type`, `entity_id`, `severity`, `is_read`, `created_at`)
SELECT DISTINCT
       u.`id`,
       'LEAVE_AWAITING_DECISION',
       'Leave request needs your decision',
       CONCAT(
         COALESCE(CONCAT(e.`employee_fname`, ' ', e.`employee_lname`), ru.`full_name`, 'A staff member'),
         ' · ', lt.`name`,
         ' · ', DATE_FORMAT(lr.`start_date`, '%e %b %Y'), ' → ', DATE_FORMAT(lr.`end_date`, '%e %b %Y'),
         ' is waiting at "', s.`stage_label`, '".'
       ),
       '/hr/leave/approvals',
       'leave_request',
       lr.`id`,
       'warning',
       0,
       NOW()
FROM `leave_requests` lr
JOIN `leave_approval_stages` s
     ON s.`leave_type_id` = lr.`leave_type_id`
    AND s.`stage_order`   = lr.`current_stage_order`
JOIN `leave_types` lt ON lt.`id` = lr.`leave_type_id`
LEFT JOIN `employees` e ON e.`employee_id` = lr.`employee_id`
LEFT JOIN `users` ru    ON ru.`id` = lr.`user_id`
JOIN `permissions` p    ON p.`slug` = s.`required_permission_slug`
JOIN `roles` r
     -- Whoever holds the stage explicitly; failing that, superadmins, so a
     -- request is never left in flight with nobody told about it. Same fallback
     -- NotificationService::pushToPermissionHolders applies.
     ON (
          EXISTS (SELECT 1 FROM `role_permissions` rp
                   WHERE rp.`role_id` = r.`id` AND rp.`permission_id` = p.`id`)
          AND r.`name` <> 'superadmin'
        )
        OR (
          r.`name` = 'superadmin'
          AND NOT EXISTS (
                SELECT 1
                FROM `role_permissions` rp2
                JOIN `roles` r2 ON r2.`id` = rp2.`role_id` AND r2.`name` <> 'superadmin'
                JOIN `users` u2 ON u2.`role_id` = r2.`id` AND u2.`is_active` = 1
                WHERE rp2.`permission_id` = p.`id`
              )
        )
JOIN `users` u          ON u.`role_id` = r.`id` AND u.`is_active` = 1
WHERE lr.`status` = 'Pending'
  AND u.`id` <> COALESCE(lr.`user_id`, 0)
  AND u.`id` <> COALESCE(e.`user_id`, 0)
  -- Never duplicate a prompt this migration (or the app) already delivered.
  -- Deliberately regardless of read state: step 4a above marks the outstanding
  -- ones read, so an `is_read = 0` guard here would let every re-run of this
  -- migration retire its own previous batch and then insert a fresh copy.
  AND NOT EXISTS (
        SELECT 1 FROM `notifications` n2
        WHERE n2.`user_id` = u.`id`
          AND n2.`type` = 'LEAVE_AWAITING_DECISION'
          AND n2.`entity_type` = 'leave_request'
          AND n2.`entity_id` = lr.`id`
      );

-- ── 4c. Re-home requests that were mid-flight on the old 2-stage chain ─────
-- The old stage 2 (HR Approval, final) maps onto the new stage 2 (HR —
-- Recommendation), which is no longer final: those requests now continue to DAF
-- and the VC rather than being granted at HR. Nothing needs moving for stage 1.
-- This is a no-op on a fresh install; it exists so an upgrade cannot leave a
-- request pointing past the end of its own chain.
UPDATE `leave_requests` lr
   SET lr.`current_stage_order` = (
         SELECT MAX(s.`stage_order`) FROM `leave_approval_stages` s
         WHERE s.`leave_type_id` = lr.`leave_type_id`
       )
 WHERE lr.`status` = 'Pending'
   AND lr.`current_stage_order` > (
         SELECT COALESCE(MAX(s.`stage_order`), 1) FROM `leave_approval_stages` s
         WHERE s.`leave_type_id` = lr.`leave_type_id`
       );

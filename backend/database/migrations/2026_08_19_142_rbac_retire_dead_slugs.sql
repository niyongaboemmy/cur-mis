-- ══════════════════════════════════════════════════════════════════════════════
-- RBAC clean-up: make three permissions real, retire three that never were.
--
-- Follows the August 2026 permission-coverage audit, which found slugs that an
-- administrator could grant on the Roles screen while nothing in the system
-- read them. Each is resolved here in the direction the evidence supported.
--
-- Idempotent: every statement is guarded or naturally re-runnable.
-- ══════════════════════════════════════════════════════════════════════════════


-- ── 1. SUBMIT_SERVICE_REQUEST — grant before enforcing ───────────────────────
-- The API now enforces this slug on POST /api/service-requests. Until this
-- migration only `admin`, `student` and `superadmin` held it, while ANY
-- authenticated account could submit. Granting it to every role that could
-- already submit makes the new gate a no-op on day one: nobody loses access,
-- and the permission becomes revocable per role from here on.
--
-- Applicants are excluded deliberately — they use the public catalogue at
-- /services and have their own portal.
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
  FROM `roles` r
  CROSS JOIN `permissions` p
 WHERE p.`slug` = 'SUBMIT_SERVICE_REQUEST'
   AND r.`name` NOT IN ('applicant', 'guest')
   AND NOT EXISTS (
        SELECT 1 FROM `role_permissions` rp
         WHERE rp.`role_id` = r.`id` AND rp.`permission_id` = p.`id`
   );


-- ── 2. VIEW_CLEARANCE / MANAGE_CLEARANCE — consolidate ───────────────────────
-- Three slugs guarded one read-only capability. The clearance endpoints are
-- four GETs with no write counterpart anywhere, so MANAGE_CLEARANCE guarded
-- nothing that VIEW_ did not, and VIEW_CLEARANCE duplicated
-- VIEW_FINANCE_CLEARANCE — the slug the Finance hub and every other
-- VIEW_FINANCE_* sibling already use.
--
-- Anyone holding either retired slug inherits VIEW_FINANCE_CLEARANCE first, so
-- no clearance viewer loses sight of the data.
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT DISTINCT rp.`role_id`, keep.`id`
  FROM `role_permissions` rp
  JOIN `permissions` old  ON old.`id` = rp.`permission_id`
  JOIN `permissions` keep ON keep.`slug` = 'VIEW_FINANCE_CLEARANCE'
 WHERE old.`slug` IN ('VIEW_CLEARANCE', 'MANAGE_CLEARANCE')
   AND NOT EXISTS (
        SELECT 1 FROM `role_permissions` x
         WHERE x.`role_id` = rp.`role_id` AND x.`permission_id` = keep.`id`
   );

DELETE rp FROM `role_permissions` rp
  JOIN `permissions` p ON p.`id` = rp.`permission_id`
 WHERE p.`slug` IN ('VIEW_CLEARANCE', 'MANAGE_CLEARANCE');

DELETE FROM `permissions` WHERE `slug` IN ('VIEW_CLEARANCE', 'MANAGE_CLEARANCE');


-- ── 3. MANAGE_OWN_PROFILE — retire ───────────────────────────────────────────
-- Zero references in the entire codebase, front or back. Editing your own
-- profile (`/profile`, PUT /api/auth/me) is open to every authenticated
-- account by design and should stay that way: a permission here could only
-- ever lock someone out of their own record.
DELETE rp FROM `role_permissions` rp
  JOIN `permissions` p ON p.`id` = rp.`permission_id`
 WHERE p.`slug` = 'MANAGE_OWN_PROFILE';

DELETE FROM `permissions` WHERE `slug` = 'MANAGE_OWN_PROFILE';


-- ── Note on the legacy `timetable` table ─────────────────────────────────────
-- The application no longer reads it: /api/system/basics used to attach up to
-- 100 rows to every call and no client ever consumed the field. The reader and
-- its model are removed in this release; the table itself is left in place on
-- purpose. Dropping it is irreversible and it costs nothing to keep, so
-- archiving it is a separate, deliberate decision.

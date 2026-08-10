-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 120: ACCESS_TEACHER_PORTAL permission + lecturer grants.
-- Date: 2026-08-09
--
-- Gates the /api/teacher/* surface and the teacher dashboard UI.
--
-- Why a NEW slug rather than reusing VIEW_MY_MODULES: the `student` role holds
-- VIEW_MY_MODULES as well (it is what lets a student browse the catalogue and
-- see their own registrations), so gating the teacher portal on it would hand
-- every student a teacher dashboard. Verified against the live grants:
--   student → ACCESS_STUDENT_PORTAL, MY_INVOICE, VIEW_ATTENDANCE, VIEW_MODULE_MARKS,
--             VIEW_MY_MODULES, VIEW_TIMETABLE, ...
--
-- Granted to `lecturer` and `HOD` (a head of department teaches too). Admin and
-- superadmin are intentionally NOT granted it here: superadmin bypasses every
-- permission check in AuthService::isSuperadmin, and the portal is a personal
-- workspace keyed to the logged-in lecturer's own assignments rather than an
-- administrative surface.
--
-- Also grants the lecturer role the two slugs its dashboard needs but lacked:
--   VIEW_MY_MODULES  — already held, listed for completeness in the grant join
--   MANAGE_ATTENDANCE is deliberately NOT granted: it is the admin-wide bypass
--   in AttendanceController::teachableModuleIds (null = full scope), and giving
--   it to lecturers would defeat the per-lecturer scoping this feature adds.
--
-- Idempotent: INSERT IGNORE against the UNIQUE key on `permissions.slug` and on
-- `role_permissions (role_id, permission_id)`.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── §1  Catalogue the slug, under the External Portals category ───────────────
INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`)
SELECT
    (SELECT `id` FROM `permission_categories` WHERE `name` = 'External Portals' LIMIT 1),
    'Access Teacher Portal',
    'ACCESS_TEACHER_PORTAL',
    'Self-service teaching workspace: my courses, my students, attendance, marks, exams.';

-- Fall back to any category if 'External Portals' does not exist on this database
-- (category_id is NOT NULL, so a missing category would otherwise insert nothing).
UPDATE `permissions`
SET `category_id` = (SELECT `id` FROM `permission_categories` ORDER BY `id` ASC LIMIT 1)
WHERE `slug` = 'ACCESS_TEACHER_PORTAL' AND (`category_id` IS NULL OR `category_id` = 0);


-- ── §2  Grant to the teaching roles ───────────────────────────────────────────
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
CROSS JOIN `permissions` p
WHERE p.`slug` = 'ACCESS_TEACHER_PORTAL'
  AND r.`name` IN ('lecturer', 'HOD');


-- ── §3  Round out the HOD role, which teaches but held no teaching slugs ──────
-- HOD currently holds only APPROVE_SERVICE_REQUEST_L2, MANAGE_REVALUATIONS,
-- MODERATE_FORUMS, REQUEST_LEAVE, VIEW_ANNOUNCEMENTS, VIEW_DASHBOARD, VIEW_FORUMS
-- — so a head of department cannot open a class list, mark attendance or enter
-- marks for the modules they personally teach.
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
CROSS JOIN `permissions` p
WHERE r.`name` = 'HOD'
  AND p.`slug` IN (
      'VIEW_MY_MODULES',
      'VIEW_ATTENDANCE',
      'RECORD_ATTENDANCE',
      'VIEW_MODULE_MARKS',
      'RECORD_MODULE_MARKS',
      'VIEW_EXAMS',
      'VIEW_TIMETABLE',
      'VIEW_STUDENTS',
      'VIEW_SYSTEM_BASICS'
  );

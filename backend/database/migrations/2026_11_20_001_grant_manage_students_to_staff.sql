-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: grant MANAGE_STUDENTS to every staff role.
--
-- Student details page (Personal, Contact, Residency, Programme) saves through
-- POST /api/students/{id}, which requires MANAGE_STUDENTS. Staff accounts saw
-- the Edit buttons but the server refused the save. This grants the permission
-- to every role except the portal roles (applicant, student) and guest.
--
-- Note: MANAGE_STUDENTS also covers creating and deleting student records and
-- uploading photos, not only editing.
--
-- Purely additive and idempotent (INSERT IGNORE on the (role_id, permission_id)
-- primary key). Safe to re-run.
-- ══════════════════════════════════════════════════════════════════════════════

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` = 'MANAGE_STUDENTS'
WHERE r.`name` NOT IN ('applicant', 'student', 'guest');

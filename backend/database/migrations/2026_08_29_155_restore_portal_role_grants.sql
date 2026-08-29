-- ─────────────────────────────────────────────────────────────────────────────
-- Restore the portal grants for the applicant and student roles.
--
-- Both roles are granted their portal permission by 015 / 017 / 028 / 087, but
-- any database where those migrations were BASELINED (marked applied without
-- running — see schema_migrations.status) never received the rows. The symptom
-- is an applicant who can complete the whole wizard (the /api/applicant routes
-- gate on is_applicant, not on RBAC) yet is bounced back to "/" the moment they
-- open /applicant, because the frontend route guard requires
-- ACCESS_APPLICANT_PORTAL.
--
-- Idempotent: resolves the roles by name and inserts only what is missing.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
  FROM `roles` r
  JOIN `permissions` p
    ON p.`slug` = 'ACCESS_APPLICANT_PORTAL'
 WHERE r.`name` = 'applicant';

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
  FROM `roles` r
  JOIN `permissions` p
    ON p.`slug` = 'ACCESS_STUDENT_PORTAL'
 WHERE r.`name` = 'student';

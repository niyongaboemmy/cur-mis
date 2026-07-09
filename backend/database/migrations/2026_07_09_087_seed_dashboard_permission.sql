-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: Dashboard permission
-- Date: 2026-07-09
-- `GET /api/admin/dashboard` previously had no permission check (AuthMiddleware
-- only). This registers VIEW_DASHBOARD and grants it to every role that could
-- already reach the dashboard (i.e. everyone except student/applicant, which
-- is how the sidebar already hides the link today) — additive only, so no
-- existing role_permissions row is touched.
-- ──────────────────────────────────────────────────────────────────────────────

SET @admin_cat_id = (SELECT `id` FROM `permission_categories` WHERE `name` = 'Administration' LIMIT 1);

INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`)
VALUES
    (@admin_cat_id, 'View Dashboard', 'VIEW_DASHBOARD', 'View the institution-wide analytics/overview dashboard');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` = 'VIEW_DASHBOARD'
WHERE r.`name` NOT IN ('student', 'applicant');

-- =============================================================================
-- 044  Grant VIEW_MY_MODULES to the student role.
--
--      Powers the student-only sidebar entries added in this iteration:
--          Academics → My modules
--          Exam      → My exams / My results
--      Without this row the /my-modules route + /api/modules/my/* endpoints
--      would 403 the student even though those features are designed for
--      them. Idempotent — safe to re-run.
-- =============================================================================
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `roles` r
JOIN `permissions` p ON p.slug = 'VIEW_MY_MODULES'
WHERE r.name = 'student';

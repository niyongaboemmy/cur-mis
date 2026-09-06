-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: Assign Supervisors Based on Organizational Hierarchy
-- Date: 2026-09-04
--
-- Assigns supervisors to staff based on the CUR organizational structure:
--
-- Organizational Hierarchy (from organigram):
-- - Rector (top level - no supervisor)
-- - Deputy Vice Chancellor (reports to Rector)
-- - Deans (report to Rector)
-- - Department Heads / HODs (report to their Dean or Deputy VC)
-- - Faculty/Staff (report to their HOD)
--
-- This migration:
-- 1. Identifies departments and their HODs
-- 2. Identifies faculties and their Deans
-- 3. Assigns staff to HODs as supervisors
-- 4. Assigns HODs to Deans as supervisors
--
-- Idempotent — safe to re-run (won't overwrite existing supervisor assignments).
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. Assign staff to their HOD as supervisor ──────────────────────────────
-- Match based on department_id in users table
UPDATE `users` u
SET u.`supervisor_id` = (
  SELECT user_hod.`id`
  FROM `users` user_hod
  WHERE user_hod.`department_id` = u.`department_id`
    AND (user_hod.`role_id` IN (
      SELECT `id` FROM `roles`
      WHERE `name` IN ('hod', 'head_of_department', 'department_head')
    ) OR user_hod.`role_name` LIKE '%HOD%'
       OR user_hod.`role_name` LIKE '%Head of Department%')
  LIMIT 1
)
WHERE u.`department_id` IS NOT NULL
  AND u.`supervisor_id` IS NULL
  AND u.`id` NOT IN (
    SELECT DISTINCT `role_id` FROM `role_permissions`
    JOIN `permissions` USING (`permission_id`)
    WHERE `slug` IN ('MANAGE_DEPARTMENTS', 'MANAGE_FACULTY')
  );

-- Log these assignments
INSERT INTO `user_supervisor_assignments` (`user_id`, `supervisor_id`, `assignment_reason`, `valid_from`)
SELECT u.`id`, u.`supervisor_id`, 'department_hierarchy', CURDATE()
FROM `users` u
WHERE u.`supervisor_id` IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `user_supervisor_assignments` usa
    WHERE usa.`user_id` = u.`id`
      AND usa.`valid_until` IS NULL
  );

-- ── 2. Assign HODs to their Dean as supervisor ──────────────────────────────
-- Match based on faculty_id relationship
UPDATE `users` u_hod
SET u_hod.`supervisor_id` = (
  SELECT u_dean.`id`
  FROM `users` u_dean
  WHERE u_dean.`faculty_id` = (
    SELECT `faculty_id` FROM `departments`
    WHERE `id` = u_hod.`department_id` LIMIT 1
  )
    AND (u_dean.`role_id` IN (
      SELECT `id` FROM `roles` WHERE `name` IN ('dean', 'associate_dean')
    ) OR u_dean.`role_name` LIKE '%Dean%')
  LIMIT 1
)
WHERE (u_hod.`role_id` IN (
  SELECT `id` FROM `roles`
  WHERE `name` IN ('hod', 'head_of_department', 'department_head')
) OR u_hod.`role_name` LIKE '%HOD%'
   OR u_hod.`role_name` LIKE '%Head of Department%')
  AND u_hod.`supervisor_id` IS NULL;

-- Log these assignments
INSERT INTO `user_supervisor_assignments` (`user_id`, `supervisor_id`, `assignment_reason`, `valid_from`)
SELECT u.`id`, u.`supervisor_id`, 'faculty_hierarchy', CURDATE()
FROM `users` u
WHERE u.`supervisor_id` IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `user_supervisor_assignments` usa
    WHERE usa.`user_id` = u.`id`
      AND usa.`valid_until` IS NULL
  );

-- ── 3. Ensure Deans report to Rector (or Deputy VC if exists) ──────────────
-- Find Rector
SET @rector_id = (
  SELECT u.`id` FROM `users` u
  JOIN `roles` r ON r.`id` = u.`role_id`
  WHERE r.`name` IN ('rector', 'vice_chancellor', 'principal')
  ORDER BY r.`name` = 'rector' DESC
  LIMIT 1
);

-- If rector exists, assign all deans to report to rector
IF @rector_id IS NOT NULL THEN
  UPDATE `users` u
  SET u.`supervisor_id` = @rector_id
  WHERE (u.`role_id` IN (
    SELECT `id` FROM `roles` WHERE `name` IN ('dean', 'associate_dean')
  ) OR u.`role_name` LIKE '%Dean%')
    AND u.`supervisor_id` IS NULL;

  INSERT INTO `user_supervisor_assignments` (`user_id`, `supervisor_id`, `assignment_reason`, `valid_from`)
  SELECT u.`id`, u.`supervisor_id`, 'institutional_hierarchy', CURDATE()
  FROM `users` u
  WHERE u.`supervisor_id` = @rector_id
    AND NOT EXISTS (
      SELECT 1 FROM `user_supervisor_assignments` usa
      WHERE usa.`user_id` = u.`id`
        AND usa.`valid_until` IS NULL
    );
END IF;

-- ── 4. Create a view for easy supervisor lookup ──────────────────────────────
DROP VIEW IF EXISTS `v_user_with_supervisor`;
CREATE VIEW `v_user_with_supervisor` AS
SELECT
  u.`id`,
  u.`username`,
  u.`full_name`,
  u.`email`,
  u.`supervisor_id`,
  sup.`full_name` AS supervisor_name,
  sup.`email` AS supervisor_email,
  sup.`id` AS supervisor_id_check,
  CASE WHEN u.`supervisor_id` IS NULL THEN 'No supervisor assigned'
       WHEN sup.`id` IS NULL THEN 'Supervisor not found'
       ELSE CONCAT('Supervised by ', sup.`full_name`)
  END AS supervisor_status
FROM `users` u
LEFT JOIN `users` sup ON sup.`id` = u.`supervisor_id`;

-- ── 5. Verification query (run manually to check coverage) ──────────────────
-- SELECT
--   COUNT(*) as total_users,
--   SUM(CASE WHEN supervisor_id IS NOT NULL THEN 1 ELSE 0 END) as with_supervisor,
--   SUM(CASE WHEN supervisor_id IS NULL THEN 1 ELSE 0 END) as without_supervisor,
--   ROUND(100.0 * SUM(CASE WHEN supervisor_id IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*), 1) as coverage_percent
-- FROM `users`
-- WHERE role_name NOT IN ('Rector', 'Vice Chancellor', 'Principal');

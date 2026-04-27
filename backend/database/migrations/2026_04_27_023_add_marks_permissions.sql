-- 2026_04_27_023_add_marks_permissions.sql
-- Adds missing RECORD_MODULE_MARKS, MANAGE_MODULE_MARKS, and VIEW_MODULE_MARKS permissions.

SET @cat_id = (SELECT id FROM permission_categories WHERE name = 'Modules Management' LIMIT 1);

-- Ensure category exists if it was somehow missing (unlikely given previous runs)
INSERT IGNORE INTO `permission_categories` (`name`, `description`) 
VALUES ('Modules Management', 'Management of module schedules, assignments, and registrations.');

SET @cat_id = (SELECT id FROM permission_categories WHERE name = 'Modules Management' LIMIT 1);

INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(@cat_id, 'View Module Marks', 'VIEW_MODULE_MARKS', 'Allows users to view student marks for assigned modules.'),
(@cat_id, 'Record Module Marks', 'RECORD_MODULE_MARKS', 'Allows instructors to record and update student marks.'),
(@cat_id, 'Manage Module Marks', 'MANAGE_MODULE_MARKS', 'Allows administrators to override and finalize module marks.');

-- Auto-assign to Superadmin (role_id = 1)
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 1, id FROM `permissions` WHERE slug IN ('VIEW_MODULE_MARKS', 'RECORD_MODULE_MARKS', 'MANAGE_MODULE_MARKS');

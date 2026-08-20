-- 2026_04_24_015_add_applicant_and_student_roles.sql
-- Ensures the `applicant` and `student` roles exist and that each has the
-- correct portal-access permission. Resolves role ids by name (NOT hardcoded)
-- so this works whether the roles were seeded earlier with different ids.

-- 1. Ensure the roles exist (name, not id, is the authoritative identifier —
--    role id may already be claimed by earlier seeds on a given DB)
INSERT IGNORE INTO `roles` (`name`, `description`)
    VALUES ('applicant', 'Applicant Role - External account for prospective students');

INSERT IGNORE INTO `roles` (`name`, `description`)
    VALUES ('student',   'Student Role - Internal account for enrolled students');

-- 2. Ensure the "External Portal" permission category exists
INSERT IGNORE INTO `permission_categories` (`name`, `description`)
    VALUES ('External Portal', 'Permissions for applicant and student self-service portals.');

-- 3. Create the two portal-access permissions under that category
SET @ext_cat = (SELECT `id` FROM `permission_categories` WHERE `name` = 'External Portal' LIMIT 1);

INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`)
    VALUES (@ext_cat, 'Access Applicant Portal', 'ACCESS_APPLICANT_PORTAL',
            'Allows prospective students to manage their applications and profile.');

INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`)
    VALUES (@ext_cat, 'Access Student Portal',   'ACCESS_STUDENT_PORTAL',
            'Allows enrolled students to access their academic and financial records.');

-- 4. Link each role to its portal permission (resolve ids by name/slug)
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `roles` r CROSS JOIN `permissions` p
WHERE r.name = 'applicant' AND p.slug = 'ACCESS_APPLICANT_PORTAL';

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `roles` r CROSS JOIN `permissions` p
WHERE r.name = 'student' AND p.slug = 'ACCESS_STUDENT_PORTAL';

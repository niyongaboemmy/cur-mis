-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 095: Add MANAGE_ACADEMIC_SETTINGS permission for System Documents
--
-- New permission required to manage system documents (institutional documents like
-- fee structures, policies, and other files). Used by system-documents routes.
-- ══════════════════════════════════════════════════════════════════════════════

SET @cat_system := (SELECT id FROM permission_categories WHERE name = 'System Settings' LIMIT 1);
SET @cat_fallback := (SELECT id FROM permission_categories ORDER BY id LIMIT 1);
SET @cat_system := COALESCE(@cat_system, @cat_fallback);

-- Add the permission to the catalog
INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`)
VALUES (@cat_system, 'Manage Academic Settings', 'MANAGE_ACADEMIC_SETTINGS', 'Manage institutional documents and academic settings.');

-- Grant to superadmin and admin roles
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` = 'MANAGE_ACADEMIC_SETTINGS'
WHERE r.`name` IN ('superadmin', 'admin');

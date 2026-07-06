-- ══════════════════════════════════════════════════════════════════════════════
-- PRODUCTION MIGRATION — 2026-07-02
-- 2026_07_02_088_enable_registrar_document_generation.sql
--
-- PURPOSE: Enable the Registrar role to access the "Generate Documents" feature
--
-- WHAT THIS DOES:
--   1. Ensures GENERATE_DOCUMENTS permission exists in the permissions table
--   2. Assigns GENERATE_DOCUMENTS permission to registrar, admin, and superadmin roles
--   3. Idempotent — safe to re-run on already-patched databases
--
-- CONTEXT:
--   The DocumentGenerationPage.tsx frontend component requires GENERATE_DOCUMENTS
--   permission to display the "Generate Documents" menu item in the sidebar under
--   Students → Generate Documents. The permission is defined in backend PHP but
--   may not have been seeded in the database during initial deployment.
--
-- ══════════════════════════════════════════════════════════════════════════════

SET FOREIGN_KEY_CHECKS = 0;

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §1  Ensure the "Document Generation" permission category exists             ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

INSERT IGNORE INTO `permission_categories` (`name`, `description`)
VALUES ('Document Generation', 'Template-based document preview, generation, and download.');


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §2  Seed GENERATE_DOCUMENTS permission                                      ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

-- Get the category ID
SET @cat_docgen = (
    SELECT `id` FROM `permission_categories`
    WHERE `name` = 'Document Generation' LIMIT 1
);

-- Insert or ignore the permission (UNIQUE constraint on slug)
INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`)
VALUES (
    @cat_docgen,
    'Generate Documents',
    'GENERATE_DOCUMENTS',
    'Preview and generate official documents (transcripts, letters, certificates, degree awards, etc.).'
);


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §3  Assign GENERATE_DOCUMENTS to superadmin, admin, and registrar roles     ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles`       r
JOIN `permissions` p ON p.`slug` = 'GENERATE_DOCUMENTS'
WHERE r.`name` IN ('superadmin', 'admin', 'registrar');


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §4  Log the seeding for audit trail                                         ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

-- Optional: You can add system logs here if you have a migration audit table
-- INSERT INTO migration_logs (file, status, executed_at)
-- VALUES ('2026_07_02_088_enable_registrar_document_generation.sql', 'success', NOW());


SET FOREIGN_KEY_CHECKS = 1;

-- ══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES (run after migration to verify success)
-- ══════════════════════════════════════════════════════════════════════════════
--
-- 1. Check if GENERATE_DOCUMENTS permission exists:
--    SELECT id, slug, name FROM permissions WHERE slug = 'GENERATE_DOCUMENTS';
--
-- 2. Check if registrar has GENERATE_DOCUMENTS permission:
--    SELECT rp.* FROM role_permissions rp
--    JOIN roles r ON r.id = rp.role_id
--    JOIN permissions p ON p.id = rp.permission_id
--    WHERE r.name = 'registrar' AND p.slug = 'GENERATE_DOCUMENTS';
--
-- 3. List all registrar permissions:
--    SELECT p.slug, p.name FROM role_permissions rp
--    JOIN roles r ON r.id = rp.role_id
--    JOIN permissions p ON p.id = rp.permission_id
--    WHERE r.name = 'registrar'
--    ORDER BY p.slug;
--
-- ══════════════════════════════════════════════════════════════════════════════

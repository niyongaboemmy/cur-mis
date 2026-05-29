-- =============================================================================
-- Migration 046: Fix permissions sync
-- Date: 2026-05-11
--
-- Fixes:
--   1. Seeds GENERATE_DOCUMENTS permission (defined in Permissions.php and used
--      by /api/documents/* routes, but never inserted into the permissions table)
--   2. Assigns GENERATE_DOCUMENTS to superadmin, admin, registrar roles
--   3. Assigns messaging permissions (seeded in 036) to appropriate roles —
--      migration 036 created the rows but never assigned them to any role
--   4. Assigns MANAGE_CAMPUSES to admin and registrar — migration 032 only
--      granted it to role_id = 1 (superadmin via hardcoded ID)
--
-- Fully idempotent: all INSERTs use INSERT IGNORE or slug-based JOINs.
-- Safe to re-run on an already-patched database.
-- =============================================================================

-- ── §1  Seed GENERATE_DOCUMENTS permission ───────────────────────────────────

-- Find existing "Document Generation" category (if any)
SET @cat_docgen = (
    SELECT `id` FROM `permission_categories`
    WHERE `name` = 'Document Generation' LIMIT 1
);

-- Create the category only if it doesn't exist yet
INSERT IGNORE INTO `permission_categories` (`name`, `description`)
SELECT 'Document Generation', 'Template-based document preview and download.'
WHERE @cat_docgen IS NULL;

-- Re-resolve after the potential INSERT above
SET @cat_docgen = (
    SELECT `id` FROM `permission_categories`
    WHERE `name` = 'Document Generation' LIMIT 1
);

-- Insert the permission row (slug has a UNIQUE index — INSERT IGNORE is safe)
INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`)
VALUES (
    @cat_docgen,
    'Generate Documents',
    'GENERATE_DOCUMENTS',
    'Preview and download generated documents (transcripts, letters, certificates, etc.).'
);

-- ── §2  Assign GENERATE_DOCUMENTS to superadmin, admin, registrar ────────────
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles`       r
JOIN `permissions` p ON p.`slug` = 'GENERATE_DOCUMENTS'
WHERE r.`name` IN ('superadmin', 'admin', 'registrar');

-- ── §3  Assign messaging permissions to appropriate roles ─────────────────────
-- Migration 036 seeded SEND_MESSAGES, MANAGE_MESSAGES, BROADCAST_MESSAGES but
-- did not assign them to any role. Fix that here.

-- SEND_MESSAGES → all staff roles (they already can receive; now they can send)
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles`       r
JOIN `permissions` p ON p.`slug` = 'SEND_MESSAGES'
WHERE r.`name` IN ('superadmin', 'admin', 'registrar', 'hr_manager', 'finance_officer', 'lecturer');

-- MANAGE_MESSAGES + BROADCAST_MESSAGES → admin and superadmin only
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles`       r
JOIN `permissions` p ON p.`slug` IN ('MANAGE_MESSAGES', 'BROADCAST_MESSAGES')
WHERE r.`name` IN ('superadmin', 'admin');

-- ── §4  Assign MANAGE_CAMPUSES to admin and registrar ────────────────────────
-- Migration 032 used: INSERT INTO role_permissions SELECT 1, id FROM permissions WHERE slug = 'MANAGE_CAMPUSES'
-- role_id = 1 is superadmin, so admin and registrar were never granted this permission.
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles`       r
JOIN `permissions` p ON p.`slug` = 'MANAGE_CAMPUSES'
WHERE r.`name` IN ('admin', 'registrar');

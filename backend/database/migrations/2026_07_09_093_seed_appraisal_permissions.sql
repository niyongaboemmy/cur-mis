-- Migration 093: Seed Employee Appraisal permissions
--
-- Migration 070 (2026_06_01_070_employee_appraisals.sql) added the appraisal
-- tables but never seeded VIEW_APPRAISALS / MANAGE_APPRAISALS into the
-- `permissions` table, even though `App\Constants\Permissions` and the
-- frontend `PERMISSIONS` constant both already define them and
-- `AppraisalController` already gates its routes on them. Result: these two
-- permissions exist in code but are invisible/unassignable in the Roles &
-- Permissions admin UI. Additive only (INSERT IGNORE) — does not touch any
-- existing role_permissions grants.

INSERT IGNORE INTO `permission_categories` (`name`, `description`)
SELECT 'HR Management', 'Human resources, payroll, leave, and appraisal management'
WHERE NOT EXISTS (SELECT 1 FROM `permission_categories` WHERE name = 'HR Management');

INSERT IGNORE INTO `permissions` (`slug`, `name`, `description`, `category_id`, `created_at`)
SELECT slug, name, description,
       (SELECT id FROM `permission_categories` WHERE name = 'HR Management' LIMIT 1),
       NOW()
FROM (
    SELECT 'VIEW_APPRAISALS'   AS slug, 'View Appraisals'   AS name, 'View employee appraisal periods, criteria, and records.' AS description
    UNION ALL
    SELECT 'MANAGE_APPRAISALS',        'Manage Appraisals',          'Create appraisal periods/criteria and manage appraisal reviews.'
) p
WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE slug = p.slug);


-- ── Self-heal GENERATE_DOCUMENTS category linkage ────────────────────────────
-- Migrations 046 and 088 both seed GENERATE_DOCUMENTS via `INSERT IGNORE`
-- after resolving @cat_docgen through a session variable — if either run left
-- the permission row in place with a NULL or stale category_id (e.g. from an
-- earlier partial/aborted run before the category existed), later
-- `INSERT IGNORE`s are silent no-ops that can never fix it, since the slug's
-- UNIQUE constraint blocks re-insertion. Production's Roles & Permissions UI
-- shows "Document Generation: 0 permissions", confirming GENERATE_DOCUMENTS
-- is not currently linked to that category. Ensure the category exists, then
-- (re)point the permission at it directly — safe/idempotent either way.

INSERT IGNORE INTO `permission_categories` (`name`, `description`)
SELECT 'Document Generation', 'Template-based document preview, generation, and download.'
WHERE NOT EXISTS (SELECT 1 FROM `permission_categories` WHERE name = 'Document Generation');

-- Belt-and-suspenders: insert the row if it's somehow missing entirely too.
INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`)
SELECT (SELECT id FROM `permission_categories` WHERE name = 'Document Generation' LIMIT 1),
       'Generate Documents',
       'GENERATE_DOCUMENTS',
       'Preview and generate official documents (transcripts, letters, certificates, degree awards, etc.).'
WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE slug = 'GENERATE_DOCUMENTS');

UPDATE `permissions`
SET `category_id` = (SELECT id FROM `permission_categories` WHERE name = 'Document Generation' LIMIT 1)
WHERE `slug` = 'GENERATE_DOCUMENTS'
  AND NOT (`category_id` <=> (SELECT id FROM `permission_categories` WHERE name = 'Document Generation' LIMIT 1));

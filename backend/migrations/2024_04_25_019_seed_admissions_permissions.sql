-- 2024_04_25_019_seed_admissions_permissions.sql
-- Seeds the Admissions module permissions that were missing from the initial setup.
-- Covers: application management, document verification, merit list, offers, letters, manual admission.

SET @superadmin_id = 1;
SET @admin_id      = 2;
SET @registrar_id  = 3;

-- ── 1. Add "Admissions" permission category ────────────────────────────────────
INSERT INTO `permission_categories` (`id`, `name`, `description`) VALUES
(8, 'Admissions', 'Permissions for the student admissions module: applications, merit lists, offers, and letters.')
ON DUPLICATE KEY UPDATE
    `name`        = VALUES(`name`),
    `description` = VALUES(`description`);

-- ── 2. Seed admission permissions ─────────────────────────────────────────────
INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(8, 'Manage Admission Requirements',  'MANAGE_ADMISSION_REQUIREMENTS',
    'Create, update, and delete document requirement checklists for admission.'),
(8, 'Manage Student Applications',    'MANAGE_STUDENT_APPLICATIONS',
    'View and manage student admission applications, add notes, and update status.'),
(8, 'Verify Documents',               'VERIFY_DOCUMENTS',
    'Approve or reject submitted application documents and request re-submissions.'),
(8, 'Manage Admissions',              'MANAGE_ADMISSIONS',
    'Run merit algorithms, manage offers, send admission letters, and manually admit applicants.')
ON DUPLICATE KEY UPDATE
    `category_id` = VALUES(`category_id`),
    `name`        = VALUES(`name`),
    `description` = VALUES(`description`);

-- ── 3. Grant all admission permissions to superadmin ──────────────────────────
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT @superadmin_id, `id`
FROM `permissions`
WHERE `slug` IN (
    'MANAGE_ADMISSION_REQUIREMENTS',
    'MANAGE_STUDENT_APPLICATIONS',
    'VERIFY_DOCUMENTS',
    'MANAGE_ADMISSIONS'
);

-- ── 4. Grant admission permissions to admin ───────────────────────────────────
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT @admin_id, `id`
FROM `permissions`
WHERE `slug` IN (
    'MANAGE_ADMISSION_REQUIREMENTS',
    'MANAGE_STUDENT_APPLICATIONS',
    'VERIFY_DOCUMENTS',
    'MANAGE_ADMISSIONS'
);

-- ── 5. Grant admission permissions to registrar ───────────────────────────────
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT @registrar_id, `id`
FROM `permissions`
WHERE `slug` IN (
    'MANAGE_ADMISSION_REQUIREMENTS',
    'MANAGE_STUDENT_APPLICATIONS',
    'VERIFY_DOCUMENTS',
    'MANAGE_ADMISSIONS'
);

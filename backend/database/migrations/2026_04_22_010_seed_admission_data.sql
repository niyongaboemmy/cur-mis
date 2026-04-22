-- Migration: 2026_04_22_010_seed_admission_data
-- Seeds:
--   1. Default document type catalogue
--   2. "Admissions" permission category
--   3. Four new permissions
--   4. Assigns all new permissions to the superadmin role (id=1)
--
-- Uses ON DUPLICATE KEY UPDATE for idempotency (safe to re-run).

SET @superadmin_role_id = 1;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Default document types (global catalogue; not faculty-specific yet)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO `document_types` (`name`, `slug`, `description`, `is_active`, `sort_order`) VALUES
('National ID / Passport',   'id_card',        'Valid government-issued identification document.',              1, 1),
('High School Diploma',       'diploma',        'Diploma or certificate from the last attended institution.',   1, 2),
('Academic Transcript',       'transcript',     'Official transcript showing subjects and grades.',             1, 3),
('Passport Photo',            'passport_photo', 'Recent passport-sized photograph on white background.',       1, 4),
('Birth Certificate',         'birth_cert',     'Certified copy of birth certificate.',                        1, 5),
('Medical Certificate',       'medical_cert',   'Medical fitness certificate (required by some programmes).',  0, 6),
('Recommendation Letter',     'recommendation', 'Letter of recommendation from previous institution.',         0, 7)
ON DUPLICATE KEY UPDATE
    `name`        = VALUES(`name`),
    `description` = VALUES(`description`),
    `sort_order`  = VALUES(`sort_order`);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Permission category: Admissions
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO `permission_categories` (`name`, `description`) VALUES
('Admissions', 'Permissions for managing student applications, document verification, merit lists, and admission offers.')
ON DUPLICATE KEY UPDATE
    `description` = VALUES(`description`);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. New permissions (in the Admissions category)
--    Slugs MUST match App\Constants\Permissions.php constants exactly.
-- ─────────────────────────────────────────────────────────────────────────────
SET @admissions_cat_id = (
    SELECT `id` FROM `permission_categories` WHERE `name` = 'Admissions' LIMIT 1
);

INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(@admissions_cat_id, 'Manage Admission Requirements', 'MANAGE_ADMISSION_REQUIREMENTS',
    'Configure which documents each faculty requires per academic year.'),
(@admissions_cat_id, 'Manage Student Applications',   'MANAGE_STUDENT_APPLICATIONS',
    'View, filter, update status, and add notes to student applications.'),
(@admissions_cat_id, 'Verify Applicant Documents',    'VERIFY_DOCUMENTS',
    'Review, accept, or reject documents submitted by applicants.'),
(@admissions_cat_id, 'Manage Admissions',             'MANAGE_ADMISSIONS',
    'Configure merit criteria, generate merit lists, create admission offers, and initiate enrollment.')
ON DUPLICATE KEY UPDATE
    `category_id` = VALUES(`category_id`),
    `name`        = VALUES(`name`),
    `description` = VALUES(`description`);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Assign all four new permissions to superadmin
-- ─────────────────────────────────────────────────────────────────────────────
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT @superadmin_role_id, `id`
FROM `permissions`
WHERE `slug` IN (
    'MANAGE_ADMISSION_REQUIREMENTS',
    'MANAGE_STUDENT_APPLICATIONS',
    'VERIFY_DOCUMENTS',
    'MANAGE_ADMISSIONS'
);

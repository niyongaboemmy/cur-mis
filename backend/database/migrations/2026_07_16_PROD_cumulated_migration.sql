-- ══════════════════════════════════════════════════════════════════════════════
-- PRODUCTION CUMULATED MIGRATION — 2026-07-16
--
-- Combines every individual migration dated 2026_07_14 through 2026_07_15
-- (Finance revision request: Fees Structure completion, Student Directory,
-- Budget Execution, Postgraduate/International Fees, Payment Calendar, plus
-- the RBAC Phase 0 cross-department fixes and System Documents feature) into
-- a single guarded, re-runnable batch — same pattern as
-- 2026_06_16_PROD_cumulated_migration.sql.
--
-- MIGRATIONS COVERED (idempotent / guarded):
--   2026_07_14_090_fee_types_cur_schedule.sql
--   2026_07_14_092_add_module_order_to_module_programs.sql
--   2026_07_14_093_create_per_credit_rate_departments.sql
--   2026_07_14_094_create_system_documents_table.sql
--   2026_07_15_091_fee_structures_add_department_level_label.sql
--   2026_07_15_092_fee_structures_add_campus_option.sql
--   2026_07_15_093_fee_types_add_application.sql
--   2026_07_15_095_add_manage_academic_settings_permission.sql
--   2026_07_15_095_rbac_phase0_finance_slugs.sql
--   2026_07_15_096_reset_superadmin_passwords.sql   ⚠ see note below
--   2026_07_15_096_revoke_rbac_cross_department_grants.sql
--   2026_07_15_097_seed_official_fee_schedule_document.sql
--   2026_07_15_098_fee_structures_add_category_currency.sql
--   2026_07_15_099_student_add_guardian_contact.sql
--   2026_07_15_100_create_payment_calendar_events.sql
--   2026_07_15_101_expense_budgets_add_department.sql
--   2026_07_15_102_create_postgraduate_international_fee_structures.sql
--
-- ⚠ NOTE ON §10 (reset_superadmin_passwords): this section unconditionally
--   overwrites the password for faustinganzasheila@gmail.com back to a fixed
--   known hash every time this file is run. It is reproduced here faithfully
--   because it falls inside the requested date range, but if that account's
--   password has since been changed on purpose, re-running this file will
--   silently revert it. Delete §10 before running if that is not wanted.
--
-- DESIGN:
--   • Additive + idempotent. Every DDL/DML statement is guarded via
--     INFORMATION_SCHEMA, IF NOT EXISTS, INSERT IGNORE, or WHERE NOT EXISTS —
--     safe to re-run.
--   • Non-destructive: no DROP of live data.
--
-- Run order matters: apply top-to-bottom as a single transaction-free batch.
-- ══════════════════════════════════════════════════════════════════════════════

SET FOREIGN_KEY_CHECKS = 0;

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §1  Fee Types — CUR schedule + per-credit rates (migration 090, 07-14)      ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
INSERT IGNORE INTO `fee_types` (`code`, `label`, `sort_order`) VALUES
  ('CURSU',               'CURSU Fee',              11),
  ('INTERNSHIP',          'Internship Fee',         12),
  ('FINAL_PROJECT',       'Final Project Fee',      13),
  ('GRADUATION',          'Graduation Fee',         14),
  ('TRANSCRIPT',          'Transcript Fee',         15),
  ('ENGLISH_CERTIFICATE', 'English Certificate Fee',16),
  ('REINTEGRATION',       'Reintegration Fee',      17),
  ('UNIFORM',             'Uniform Fee',             18),
  ('TO_WHOM',             'To Whom It May Concern',  19);

CREATE TABLE IF NOT EXISTS `fee_per_credit_rates` (
  `id`               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `academic_year_id` INT UNSIGNED  NOT NULL,
  `faculty_id`       INT            NOT NULL,
  `amount_per_credit` DECIMAL(10,2) NOT NULL,
  `is_active`        TINYINT(1)    NOT NULL DEFAULT 1,
  `created_by`       INT UNSIGNED  NOT NULL,
  `created_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fpcr_year_faculty` (`academic_year_id`, `faculty_id`),
  INDEX `idx_fpcr_faculty` (`faculty_id`),
  CONSTRAINT `fk_fpcr_academic_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fpcr_faculty` FOREIGN KEY (`faculty_id`) REFERENCES `faculty` (`fac_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §2  module_programs.module_order (migration 092, 07-14)                     ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
ALTER TABLE `module_programs` ADD COLUMN IF NOT EXISTS `module_order` INT UNSIGNED NULL DEFAULT NULL AFTER `option_id`;

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §3  fee_per_credit_rate_departments (migration 093, 07-14)                  ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS `fee_per_credit_rate_departments` (
  `id`                    INT AUTO_INCREMENT PRIMARY KEY,
  `fee_per_credit_rate_id` INT UNSIGNED NOT NULL,
  `department_id`         INT NOT NULL,
  `created_at`            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_rate_dept` (`fee_per_credit_rate_id`, `department_id`),
  KEY `idx_rate_id` (`fee_per_credit_rate_id`),
  KEY `idx_dept_id` (`department_id`),
  CONSTRAINT `fk_pcrd_rate`
    FOREIGN KEY (`fee_per_credit_rate_id`)
    REFERENCES `fee_per_credit_rates` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §4  system_documents table (migration 094, 07-14)                           ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS `system_documents` (
  `id`            INT AUTO_INCREMENT PRIMARY KEY,
  `name`          VARCHAR(255) NOT NULL,
  `description`   TEXT NULL,
  `file_path`     VARCHAR(500) NOT NULL,
  `file_name`     VARCHAR(255) NOT NULL,
  `file_size`     INT UNSIGNED DEFAULT 0,
  `file_type`     VARCHAR(100) NOT NULL,
  `category`      VARCHAR(50) NOT NULL,
  `uploaded_by`   INT UNSIGNED NULL,
  `uploaded_at`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `is_active`     TINYINT(1) DEFAULT 1,
  `created_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_category` (`category`),
  KEY `idx_is_active` (`is_active`),
  KEY `idx_uploaded_by` (`uploaded_by`),
  FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §5  fee_structures.department_id / level_id / label (migration 091, 07-15) ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
ALTER TABLE `fee_structures` ADD COLUMN IF NOT EXISTS `department_id` INT UNSIGNED NULL DEFAULT NULL AFTER `academic_year_id`;
ALTER TABLE `fee_structures` ADD COLUMN IF NOT EXISTS `level_id`      INT UNSIGNED NULL DEFAULT NULL AFTER `department_id`;
ALTER TABLE `fee_structures` ADD COLUMN IF NOT EXISTS `label`         VARCHAR(120)   NULL DEFAULT NULL AFTER `fee_type`;

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §6  fee_structures.campus_id + fee_structure_options (migration 092, 07-15) ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
ALTER TABLE `fee_structures` ADD COLUMN IF NOT EXISTS `campus_id` INT UNSIGNED NULL DEFAULT NULL AFTER `level_id`;

CREATE TABLE IF NOT EXISTS `fee_structure_options` (
  `fee_structure_id` INT UNSIGNED NOT NULL,
  `option_id`        INT UNSIGNED NOT NULL,
  PRIMARY KEY (`fee_structure_id`, `option_id`),
  KEY `idx_fso_option` (`option_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §7  fee_types — APPLICATION (migration 093, 07-15)                          ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
INSERT IGNORE INTO `fee_types` (`code`, `label`, `sort_order`) VALUES
  ('APPLICATION', 'Application Fee', 10);

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §8  MANAGE_ACADEMIC_SETTINGS permission (migration 095a, 07-15)             ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
SET @cat_system   := (SELECT id FROM permission_categories WHERE name = 'System Settings' LIMIT 1);
SET @cat_fallback := (SELECT id FROM permission_categories ORDER BY id LIMIT 1);
SET @cat_system   := COALESCE(@cat_system, @cat_fallback);

INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`)
VALUES (@cat_system, 'Manage Academic Settings', 'MANAGE_ACADEMIC_SETTINGS', 'Manage institutional documents and academic settings.');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` = 'MANAGE_ACADEMIC_SETTINGS'
WHERE r.`name` IN ('superadmin', 'admin');

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §9  RBAC Phase 0 — Finance-only permission slugs (migration 095b, 07-15)    ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
SET @cat_finance := (SELECT id FROM permission_categories WHERE name = 'Finance' LIMIT 1);
SET @cat_finance := COALESCE(@cat_finance, (SELECT id FROM permission_categories WHERE name = 'Finance & Accounts' LIMIT 1));
SET @cat_finance := COALESCE(@cat_finance, (SELECT id FROM permission_categories ORDER BY id LIMIT 1));

INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
  (@cat_finance, 'View Budget Execution',       'VIEW_BUDGET_EXECUTION',          'View budget execution report (planned/spent/balance/variance)'),
  (@cat_finance, 'Manage Budget Execution',     'MANAGE_BUDGET_EXECUTION',        'Create/edit budget execution entries and export reports'),
  (@cat_finance, 'View Payment Calendar',       'VIEW_PAYMENT_CALENDAR',          'View configured fee installment / registration deadline calendar'),
  (@cat_finance, 'Manage Payment Calendar',     'MANAGE_PAYMENT_CALENDAR',        'Create/edit/delete payment calendar events'),
  (@cat_finance, 'View Student Directory (Finance)', 'VIEW_STUDENT_DIRECTORY_FINANCE', 'Read-only student directory with fee/payment status, scoped to Finance');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` IN (
  'VIEW_BUDGET_EXECUTION', 'MANAGE_BUDGET_EXECUTION',
  'VIEW_PAYMENT_CALENDAR', 'MANAGE_PAYMENT_CALENDAR',
  'VIEW_STUDENT_DIRECTORY_FINANCE'
)
WHERE r.`name` IN ('superadmin', 'admin', 'finance_officer');

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §10 Reset superadmin password (migration 096a, 07-15)  ⚠ see header note   ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
-- Reset password for faustinganzasheila@gmail.com to: admin123456
-- Hash: $2y$10$TAnIgxtPFsUKeQjWRIoJqODEW45xk1pqYEV3bh3QWSpftgTReuinu
UPDATE `users`
SET `password` = '$2y$10$TAnIgxtPFsUKeQjWRIoJqODEW45xk1pqYEV3bh3QWSpftgTReuinu',
    `updated_at` = NOW()
WHERE `email` = 'faustinganzasheila@gmail.com';

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §11 Revoke cross-department RBAC grants (migration 096b, 07-15)             ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
DELETE rp FROM `role_permissions` rp
JOIN `roles` r ON r.`id` = rp.`role_id`
JOIN `permissions` p ON p.`id` = rp.`permission_id`
WHERE r.`name` = 'registrar' AND p.`slug` = 'VIEW_FINANCE';

DELETE rp FROM `role_permissions` rp
JOIN `roles` r ON r.`id` = rp.`role_id`
JOIN `permissions` p ON p.`id` = rp.`permission_id`
WHERE r.`name` = 'finance_officer' AND p.`slug` = 'VIEW_STUDENTS';

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §12 Seed official fee schedule document (migration 097, 07-15)              ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
-- Original migration used `ON DUPLICATE KEY UPDATE` but `system_documents` has
-- no unique key on `name`, so that guard was a no-op — reproduced here as a
-- genuine WHERE NOT EXISTS guard so this section is actually idempotent.
INSERT INTO `system_documents`
  (`name`, `description`, `file_name`, `file_size`, `file_type`, `category`, `uploaded_by`, `is_active`)
SELECT
  'CUR Academic Fees Structure 2025-2026 (Official)',
  'Official signed fee schedule for Academic Year 2025-2026. Contains complete fee structure by faculty and program including: Application Fee, Registration Fee, CURSU Fee, Total Tuition, Internship Fee, Final Project Fee, and Graduation Fee.',
  'Fee-Structure-2025-2026-Official.pdf',
  0,
  'application/pdf',
  'Fee Structure',
  1,
  1
WHERE NOT EXISTS (
  SELECT 1 FROM `system_documents` WHERE `name` = 'CUR Academic Fees Structure 2025-2026 (Official)'
);

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §13 fee_structures.student_category / currency (migration 098, 07-15)       ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
ALTER TABLE `fee_structures`
  ADD COLUMN IF NOT EXISTS `student_category` ENUM('local','international','sponsored','self_sponsored') NULL DEFAULT NULL AFTER `level_id`;

ALTER TABLE `fee_structures`
  ADD COLUMN IF NOT EXISTS `currency` VARCHAR(10) NOT NULL DEFAULT 'RWF' AFTER `amount`;

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §14 student guardian contact columns (migration 099, 07-15)                 ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
ALTER TABLE `student` ADD COLUMN IF NOT EXISTS `guardian_name`         VARCHAR(150) NULL DEFAULT NULL AFTER `mother`;
ALTER TABLE `student` ADD COLUMN IF NOT EXISTS `guardian_phone`        VARCHAR(30)  NULL DEFAULT NULL AFTER `guardian_name`;
ALTER TABLE `student` ADD COLUMN IF NOT EXISTS `guardian_email`        VARCHAR(150) NULL DEFAULT NULL AFTER `guardian_phone`;
ALTER TABLE `student` ADD COLUMN IF NOT EXISTS `guardian_relationship` VARCHAR(50)  NULL DEFAULT NULL AFTER `guardian_email`;

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §15 payment_calendar_events table (migration 100, 07-15)                    ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS `payment_calendar_events` (
  `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `academic_year_id` INT UNSIGNED NOT NULL,
  `event_type`       ENUM('registration_deadline','installment_due','penalty_start','semester_start','semester_end') NOT NULL,
  `label`            VARCHAR(150) NOT NULL,
  `event_date`       DATE NOT NULL,
  `fee_structure_id` INT UNSIGNED NULL DEFAULT NULL COMMENT 'Installment-specific date; NULL applies to the whole academic year',
  `is_active`        TINYINT(1) NOT NULL DEFAULT 1,
  `created_by`       INT UNSIGNED NULL DEFAULT NULL,
  `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_academic_year` (`academic_year_id`),
  KEY `idx_event_type` (`event_type`),
  KEY `idx_event_date` (`event_date`),
  KEY `idx_fee_structure` (`fee_structure_id`),
  KEY `idx_is_active` (`is_active`),
  CONSTRAINT `fk_pce_academic_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pce_fee_structure` FOREIGN KEY (`fee_structure_id`) REFERENCES `fee_structures` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pce_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §16 expense_budgets.department_id (migration 101, 07-15)                    ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
-- Original migration used plain ALTER TABLE with no guards — reproduced here
-- with INFORMATION_SCHEMA-guarded dynamic SQL so it is safely re-runnable.

-- 16a. department_id column.
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'expense_budgets'
               AND COLUMN_NAME = 'department_id');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `expense_budgets` ADD COLUMN `department_id` INT NULL AFTER `category_id`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 16b. FK to departements.dep_id.
SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'expense_budgets'
              AND CONSTRAINT_NAME = 'fk_expense_budgets_department');
SET @stmt := IF(@fk = 0,
  'ALTER TABLE `expense_budgets` ADD CONSTRAINT `fk_expense_budgets_department` FOREIGN KEY (`department_id`) REFERENCES `departements`(`dep_id`) ON DELETE CASCADE',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 16c. Index on department_id.
SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'expense_budgets'
               AND INDEX_NAME = 'idx_expense_budgets_department');
SET @stmt := IF(@idx = 0,
  'ALTER TABLE `expense_budgets` ADD INDEX `idx_expense_budgets_department` (`department_id`)',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 16d. Drop the old 2-column unique key (year+category), if still present.
SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'expense_budgets'
               AND INDEX_NAME = 'uk_budget_year_cat');
SET @stmt := IF(@idx > 0,
  'ALTER TABLE `expense_budgets` DROP INDEX `uk_budget_year_cat`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 16e. Add the replacement 3-column unique key (year+category+department).
SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'expense_budgets'
               AND INDEX_NAME = 'uk_budget_year_cat_dept');
SET @stmt := IF(@idx = 0,
  'ALTER TABLE `expense_budgets` ADD UNIQUE KEY `uk_budget_year_cat_dept` (`academic_year_id`, `category_id`, `department_id`)',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §17 postgraduate_international_fee_structures table (migration 102, 07-15) ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS `postgraduate_international_fee_structures` (
  `id`                 INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  `academic_year_id`   INT UNSIGNED     NOT NULL,
  `department_id`      INT              NULL DEFAULT NULL COMMENT 'departements.program_level = postgraduate; NULL = all postgraduate departments; type matches departements.dep_id (signed)',
  `level_id`           INT              NULL DEFAULT NULL COMMENT 'Type matches levels.id (signed)',
  `fee_type`           VARCHAR(50)      NOT NULL COMMENT 'References fee_types.code, same convention as fee_structures.fee_type',
  `label`              VARCHAR(120)     NOT NULL,
  `amount`             DECIMAL(12,2)    NOT NULL,
  `currency`           VARCHAR(10)      NOT NULL DEFAULT 'USD',
  `semester`           TINYINT UNSIGNED NULL DEFAULT NULL,
  `payment_plan`       ENUM('full_year','per_semester','per_installment') NOT NULL DEFAULT 'full_year',
  `installment_count`  INT UNSIGNED     NULL DEFAULT NULL,
  `nationality_region` VARCHAR(100)     NULL DEFAULT NULL COMMENT 'NULL = applies to all nationalities/regions',
  `surcharge_type`     ENUM('visa','insurance','other','none') NOT NULL DEFAULT 'none',
  `is_active`          TINYINT(1)       NOT NULL DEFAULT 1,
  `created_by`         INT UNSIGNED     NULL DEFAULT NULL,
  `created_at`         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pgifs_year_dept_level` (`academic_year_id`, `department_id`, `level_id`),
  KEY `idx_pgifs_fee_type` (`fee_type`),
  KEY `idx_pgifs_is_active` (`is_active`),
  CONSTRAINT `fk_pgifs_academic_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`),
  CONSTRAINT `fk_pgifs_department`    FOREIGN KEY (`department_id`)    REFERENCES `departements` (`dep_id`),
  CONSTRAINT `fk_pgifs_level`         FOREIGN KEY (`level_id`)         REFERENCES `levels` (`id`),
  CONSTRAINT `fk_pgifs_created_by`    FOREIGN KEY (`created_by`)       REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ══════════════════════════════════════════════════════════════════════════════
-- END OF CUMULATED MIGRATION
-- ══════════════════════════════════════════════════════════════════════════════

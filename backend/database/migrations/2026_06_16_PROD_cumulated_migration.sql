-- ══════════════════════════════════════════════════════════════════════════════
-- PRODUCTION CUMULATED MIGRATION — 2026-06-16
--
-- Applies all structural changes that are missing from production, based on the
-- error log of 2026-06-16 and the gap between the deployed state and the current
-- codebase (emmy branch).
--
-- ERRORS FIXED:
--   1267  Illegal mix of collations (utf8mb4_general_ci vs utf8mb4_unicode_ci)
--   1364  Field 'employee_age' doesn't have a default value
--   1054  Unknown column 'qual_type' in 'SELECT'
--   1054  Unknown column 'sc.semester' in 'WHERE'
--   1364  Field 'academic_year_id' doesn't have a default value  (student_clearances)
--
-- MIGRATIONS COVERED (idempotent / guarded):
--   069  gate_management
--   069  staff_qualifications (with qual_type fix over the legacy `type` schema)
--   070  employee_appraisals
--   071  forum_post_attachments
--   072  align_revaluations_schema
--   074  api_authorization token_expires_at
--   083  consolidated_session_schema (employees.user_id, leave, backfill, etc.)
--   084  fix_student_id_collations
--   085  create_finance_clearances_table
--
-- DATA MIGRATIONS EXCLUDED (run separately and carefully):
--   073  import_legacy_marks_to_module_marks
--   075  migrate_legacy_modules_and_programs
--   077  import_legacy_marks_remapped
--   078  fresh_rebuild_modules_and_marks
--
-- DESIGN:
--   • Additive + idempotent. Every DDL statement is guarded via
--     INFORMATION_SCHEMA or uses IF NOT EXISTS — safe to re-run.
--   • Non-destructive: no DROP of live data.
--
-- Run order matters: apply top-to-bottom as a single transaction-free batch.
-- ══════════════════════════════════════════════════════════════════════════════

SET FOREIGN_KEY_CHECKS = 0;

-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §1  Gate Management (migration 069)                                         ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
ALTER TABLE `gate_logs`
    ADD COLUMN IF NOT EXISTS `notes`     VARCHAR(500) DEFAULT NULL AFTER `reason`,
    ADD COLUMN IF NOT EXISTS `photo_url` VARCHAR(255) DEFAULT NULL AFTER `notes`;

CREATE INDEX IF NOT EXISTS `idx_gate_logs_student_id` ON `gate_logs` (`student_id`);
CREATE INDEX IF NOT EXISTS `idx_gate_logs_created_at` ON `gate_logs` (`created_at`);
CREATE INDEX IF NOT EXISTS `idx_gate_logs_result`     ON `gate_logs` (`result`);
CREATE INDEX IF NOT EXISTS `idx_gate_logs_scan_type`  ON `gate_logs` (`scan_type`);

CREATE TABLE IF NOT EXISTS `gate_sessions` (
  `id`         INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `officer_id` INT(10) UNSIGNED NOT NULL,
  `gate`       VARCHAR(40)      NOT NULL DEFAULT 'Main Gate',
  `opened_at`  DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `closed_at`  DATETIME         DEFAULT NULL,
  `notes`      VARCHAR(500)     DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_gate_sessions_officer` (`officer_id`),
  KEY `idx_gate_sessions_opened`  (`opened_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO `permission_categories` (`name`, `created_at`)
SELECT 'Gate Management', NOW()
WHERE NOT EXISTS (SELECT 1 FROM `permission_categories` WHERE name = 'Gate Management');

INSERT IGNORE INTO `permissions` (`slug`, `name`, `category_id`, `created_at`)
SELECT slug, name,
       (SELECT id FROM `permission_categories` WHERE name = 'Gate Management' LIMIT 1),
       NOW()
FROM (
    SELECT 'VIEW_GATE_LOGS' AS slug, 'View Gate Logs'            AS name UNION ALL
    SELECT 'MANAGE_GATE',           'Manage Gate'                         UNION ALL
    SELECT 'ACCESS_GATE',           'Access Gate Verification'
) p
WHERE NOT EXISTS (SELECT 1 FROM `permissions` WHERE slug = p.slug);


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §2  Employee Appraisals (migration 070)                                     ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS `appraisal_periods` (
    `id`                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `title`               VARCHAR(255) NOT NULL,
    `period_type`         ENUM('Annual','Semi-Annual','Quarterly','Custom') NOT NULL DEFAULT 'Annual',
    `year`                YEAR NOT NULL,
    `start_date`          DATE NOT NULL,
    `end_date`            DATE NOT NULL,
    `submission_deadline` DATE DEFAULT NULL,
    `status`              ENUM('Draft','Active','Closed') NOT NULL DEFAULT 'Draft',
    `description`         TEXT DEFAULT NULL,
    `created_at`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_ap_year_status` (`year`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `appraisal_criteria` (
    `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `period_id`   INT UNSIGNED NOT NULL,
    `name`        VARCHAR(255) NOT NULL,
    `description` TEXT DEFAULT NULL,
    `weight`      DECIMAL(5,2) NOT NULL DEFAULT 1.00,
    `max_score`   TINYINT UNSIGNED NOT NULL DEFAULT 5,
    `sort_order`  TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_ac_period` (`period_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `appraisals` (
    `id`                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `period_id`              INT UNSIGNED NOT NULL,
    `employee_id`            INT UNSIGNED NOT NULL,
    `status`                 ENUM('Draft','Self-Review','Supervisor-Review','HR-Review','Completed') NOT NULL DEFAULT 'Draft',
    `self_comment`           TEXT DEFAULT NULL,
    `supervisor_comment`     TEXT DEFAULT NULL,
    `hr_comment`             TEXT DEFAULT NULL,
    `self_total_score`       DECIMAL(6,2) DEFAULT NULL,
    `supervisor_total_score` DECIMAL(6,2) DEFAULT NULL,
    `final_score`            DECIMAL(6,2) DEFAULT NULL,
    `final_grade`            VARCHAR(50)  DEFAULT NULL,
    `submitted_at`           DATETIME DEFAULT NULL,
    `supervisor_reviewed_at` DATETIME DEFAULT NULL,
    `completed_at`           DATETIME DEFAULT NULL,
    `created_at`             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_appraisal_period_emp` (`period_id`, `employee_id`),
    KEY `idx_a_employee` (`employee_id`),
    KEY `idx_a_period_status` (`period_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `appraisal_ratings` (
    `id`                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `appraisal_id`       INT UNSIGNED NOT NULL,
    `criterion_id`       INT UNSIGNED NOT NULL,
    `self_score`         TINYINT UNSIGNED DEFAULT NULL,
    `supervisor_score`   TINYINT UNSIGNED DEFAULT NULL,
    `self_comment`       TEXT DEFAULT NULL,
    `supervisor_comment` TEXT DEFAULT NULL,
    `created_at`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_rating_appraisal_criterion` (`appraisal_id`, `criterion_id`),
    KEY `idx_ar_appraisal` (`appraisal_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §3  Staff Qualifications — CREATE + qual_type fix (migrations 069 + 071)    ║
-- ║                                                                              ║
-- ║  Migration 069 created this table with column `type` (no `qual_type`).       ║
-- ║  Migration 071 tried CREATE TABLE IF NOT EXISTS with `qual_type` — a no-op  ║
-- ║  since the table already existed. Code queries `qual_type` and errors.       ║
-- ║                                                                              ║
-- ║  Fix: create with correct schema if absent; ADD qual_type + new columns      ║
-- ║  if the legacy `type` schema is present.                                     ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

-- Create with correct schema if the table doesn't exist at all.
CREATE TABLE IF NOT EXISTS `staff_qualifications` (
    `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `employee_id`    INT          NOT NULL,
    `qual_type`      ENUM('Degree','Certification','Other') NOT NULL DEFAULT 'Degree',
    `title`          VARCHAR(200) NOT NULL,
    `field_of_study` VARCHAR(200) DEFAULT NULL,
    `institution`    VARCHAR(200) DEFAULT NULL,
    `year_obtained`  SMALLINT     DEFAULT NULL,
    `grade`          VARCHAR(60)  DEFAULT NULL,
    `reference_no`   VARCHAR(120) DEFAULT NULL,
    `expiry_date`    DATE         DEFAULT NULL,
    `document_url`   VARCHAR(500) DEFAULT NULL,
    `notes`          VARCHAR(500) DEFAULT NULL,
    `created_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_staff_qual_emp` (`employee_id`, `qual_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- If the table was created by migration 069 (with `type` but no `qual_type`),
-- add the `qual_type` column and the newer columns the code expects.
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff_qualifications'
               AND COLUMN_NAME = 'qual_type');
SET @stmt := IF(@col = 0,
  "ALTER TABLE `staff_qualifications`
     ADD COLUMN `qual_type`    ENUM('Degree','Certification','Other') NOT NULL DEFAULT 'Degree' AFTER `employee_id`",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Add columns present in the 071 schema but absent from the 069 schema.
-- IMPORTANT: grade must be added before reference_no (reference_no uses AFTER `grade`).

-- grade (called grade_result in migration 069, grade in 071).
-- Must come first — subsequent columns are placed AFTER it.
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff_qualifications'
               AND COLUMN_NAME = 'grade');
SET @stmt := IF(@col = 0,
  "ALTER TABLE `staff_qualifications` ADD COLUMN `grade` VARCHAR(60) DEFAULT NULL AFTER `year_obtained`",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff_qualifications'
               AND COLUMN_NAME = 'reference_no');
SET @stmt := IF(@col = 0,
  "ALTER TABLE `staff_qualifications` ADD COLUMN `reference_no` VARCHAR(120) DEFAULT NULL AFTER `grade`",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff_qualifications'
               AND COLUMN_NAME = 'expiry_date');
SET @stmt := IF(@col = 0,
  "ALTER TABLE `staff_qualifications` ADD COLUMN `expiry_date` DATE DEFAULT NULL AFTER `reference_no`",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff_qualifications'
               AND COLUMN_NAME = 'document_url');
SET @stmt := IF(@col = 0,
  "ALTER TABLE `staff_qualifications` ADD COLUMN `document_url` VARCHAR(500) DEFAULT NULL AFTER `expiry_date`",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff_qualifications'
               AND COLUMN_NAME = 'notes');
SET @stmt := IF(@col = 0,
  "ALTER TABLE `staff_qualifications` ADD COLUMN `notes` VARCHAR(500) DEFAULT NULL AFTER `document_url`",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Ensure the composite index covers qual_type (re-add if only employee_id indexed).
SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff_qualifications'
               AND INDEX_NAME = 'idx_staff_qual_emp' AND COLUMN_NAME = 'qual_type');
SET @stmt := IF(@idx = 0,
  "ALTER TABLE `staff_qualifications` DROP INDEX IF EXISTS `idx_staff_qual_emp`,
   ADD KEY `idx_staff_qual_emp` (`employee_id`, `qual_type`)",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- staff_subjects table (migration 071).
CREATE TABLE IF NOT EXISTS `staff_subjects` (
    `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `employee_id`      INT          NOT NULL,
    `subject_name`     VARCHAR(200) NOT NULL,
    `proficiency`      ENUM('Beginner','Intermediate','Advanced','Expert') NOT NULL DEFAULT 'Advanced',
    `years_experience` SMALLINT     DEFAULT NULL,
    `is_primary`       TINYINT(1)   NOT NULL DEFAULT 0,
    `notes`            VARCHAR(500) DEFAULT NULL,
    `created_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_staff_subj_emp` (`employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §4  Forum Post Attachments (migration 071)                                  ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'forum_posts'
               AND COLUMN_NAME = 'attachment_id');
SET @stmt := IF(@col = 0,
  "ALTER TABLE `forum_posts`
     ADD COLUMN `attachment_id`   VARCHAR(100) NULL AFTER `body`,
     ADD COLUMN `attachment_name` VARCHAR(255) NULL AFTER `attachment_id`,
     ADD COLUMN `attachment_mime` VARCHAR(120) NULL AFTER `attachment_name`",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §5  Align Revaluations Schema (migration 072)                               ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
SET @db := DATABASE();

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'revaluations' AND COLUMN_NAME = 'exam_id');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `revaluations` ADD COLUMN `exam_id` INT UNSIGNED NOT NULL AFTER `student_id`', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'revaluations' AND COLUMN_NAME = 'fee_paid');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `revaluations` ADD COLUMN `fee_paid` DECIMAL(10,2) NULL DEFAULT NULL AFTER `reason`', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'revaluations' AND COLUMN_NAME = 'new_marks');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `revaluations` ADD COLUMN `new_marks` DECIMAL(5,2) NULL DEFAULT NULL AFTER `status`', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'revaluations' AND COLUMN_NAME = 'reviewed_by');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `revaluations` ADD COLUMN `reviewed_by` INT UNSIGNED NULL DEFAULT NULL AFTER `new_marks`', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'revaluations' AND COLUMN_NAME = 'reviewed_at');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `revaluations` ADD COLUMN `reviewed_at` DATETIME NULL DEFAULT NULL AFTER `reviewed_by`', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Widen status enum, migrate 'completed' -> 'processed', then trim enum.
ALTER TABLE `revaluations`
  MODIFY COLUMN `status` ENUM('pending','approved','processed','rejected','completed')
  NOT NULL DEFAULT 'pending';
UPDATE `revaluations` SET `status` = 'processed' WHERE `status` = 'completed';
ALTER TABLE `revaluations`
  MODIFY COLUMN `status` ENUM('pending','approved','processed','rejected')
  NOT NULL DEFAULT 'pending';

-- Drop legacy module_id if present (blocks inserts — controller never sets it).
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'revaluations' AND COLUMN_NAME = 'module_id');
SET @stmt := IF(@col = 1,
  'ALTER TABLE `revaluations` DROP COLUMN `module_id`', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §6  API Authorization — token_expires_at (migration 074)                    ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'api_authorization'
               AND COLUMN_NAME = 'token_expires_at');
SET @stmt := IF(@col = 0,
  "ALTER TABLE `api_authorization`
     ADD COLUMN `token_expires_at` DATETIME NULL DEFAULT NULL
       COMMENT '2-hour expiry set on each /auth/authenticate call; NULL = never issued via API'",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §7  employees.employee_age — set DEFAULT '' so inserts without it succeed   ║
-- ║                                                                              ║
-- ║  The HR employee creation endpoint omits employee_age (it is a display       ║
-- ║  field the app no longer collects from the form). The column is VARCHAR(21)  ║
-- ║  NOT NULL without a default → error 1364 on every new employee record.       ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
ALTER TABLE `employees`
  MODIFY COLUMN `employee_age` VARCHAR(21) NOT NULL DEFAULT '';


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §8  student_clearances — add semester column, relax academic_term_id        ║
-- ║                                                                              ║
-- ║  The comprehensive schema (027) created student_clearances with              ║
-- ║  academic_term_id NOT NULL and no semester column. The clearance code        ║
-- ║  queries WHERE sc.semester = ? / IS NULL, causing error 1054.               ║
-- ║  academic_term_id NOT NULL blocks inserts from the new code path → 1364.    ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_clearances'
               AND COLUMN_NAME = 'semester');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `student_clearances` ADD COLUMN `semester` TINYINT UNSIGNED NULL DEFAULT NULL AFTER `academic_year_id`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Make academic_term_id nullable — the new clearance code doesn't supply it.
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_clearances'
               AND COLUMN_NAME = 'academic_term_id' AND IS_NULLABLE = 'NO');
SET @stmt := IF(@col > 0,
  'ALTER TABLE `student_clearances` MODIFY COLUMN `academic_term_id` INT(10) UNSIGNED NULL DEFAULT NULL',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §9  Consolidated Session Schema (migration 083)                             ║
-- ║      Covers: student columns, student_ids, modules, module_programs,         ║
-- ║      module_marks, module_assignments.user_id, employees.user_id,            ║
-- ║      leave self-service, leave_types, REQUEST_LEAVE permission, backfill.   ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

-- 9-a. student — columns the current code expects.
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='student' AND COLUMN_NAME='user_id');
SET @stmt := IF(@col=0,
  'ALTER TABLE `student` ADD COLUMN `user_id` INT(10) UNSIGNED DEFAULT NULL AFTER `id`', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='student' AND COLUMN_NAME='parent_student_id');
SET @stmt := IF(@col=0,
  'ALTER TABLE `student` ADD COLUMN `parent_student_id` INT(10) UNSIGNED DEFAULT NULL AFTER `user_id`', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='student' AND INDEX_NAME='idx_student_parent');
SET @stmt := IF(@idx=0,
  'ALTER TABLE `student` ADD INDEX `idx_student_parent` (`parent_student_id`)', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='student' AND COLUMN_NAME='programme_level');
SET @stmt := IF(@col=0,
  "ALTER TABLE `student` ADD COLUMN `programme_level` ENUM('undergraduate','pgde','masters','phd','diploma','certificate') NOT NULL DEFAULT 'undergraduate' AFTER `current_level`",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='student' AND COLUMN_NAME='assigned_registry_user_id');
SET @stmt := IF(@col=0,
  'ALTER TABLE `student` ADD COLUMN `assigned_registry_user_id` INT(10) UNSIGNED NULL DEFAULT NULL', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='student' AND COLUMN_NAME='is_international');
SET @stmt := IF(@col=0,
  'ALTER TABLE `student` ADD COLUMN `is_international` TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='student' AND COLUMN_NAME='updated_at');
SET @stmt := IF(@col=0,
  'ALTER TABLE `student` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 9-b. student_ids.
CREATE TABLE IF NOT EXISTS `student_ids` (
  `id`          INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`  INT(10) UNSIGNED NOT NULL,
  `issue_date`  DATE             NOT NULL,
  `expiry_date` DATE             NOT NULL,
  `barcode`     VARCHAR(60)      DEFAULT NULL,
  `is_active`   TINYINT(1)       NOT NULL DEFAULT 1,
  `created_at`  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sid_student_active` (`student_id`, `is_active`),
  KEY `idx_sid_barcode` (`barcode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE `student_ids` MODIFY `id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT;

-- 9-c. modules — structure only.
CREATE TABLE IF NOT EXISTS `modules` (
  `module_id`        int(11)      NOT NULL AUTO_INCREMENT,
  `module_name`      varchar(100) NOT NULL,
  `module_code`      varchar(20)  NOT NULL,
  `module_credits`   int(11)      NOT NULL,
  `department`       int(11)      DEFAULT NULL,
  `d_option`         varchar(40)  DEFAULT NULL,
  `level`            int(11)      NOT NULL,
  `hours`            int(11)      DEFAULT NULL,
  `price`            int(11)      DEFAULT NULL,
  `author`           int(11)      DEFAULT NULL,
  `school_id`        int(11)      DEFAULT NULL,
  `fee_structure_id` int(10) UNSIGNED DEFAULT NULL,
  `status`           enum('draft','active','archived') NOT NULL DEFAULT 'active',
  PRIMARY KEY (`module_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='modules' AND COLUMN_NAME='fee_structure_id');
SET @stmt := IF(@col=0,
  'ALTER TABLE `modules` ADD COLUMN `fee_structure_id` INT(10) UNSIGNED DEFAULT NULL AFTER `school_id`', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='modules' AND COLUMN_NAME='status');
SET @stmt := IF(@col=0,
  "ALTER TABLE `modules` ADD COLUMN `status` ENUM('draft','active','archived') NOT NULL DEFAULT 'active' AFTER `fee_structure_id`",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

ALTER TABLE `modules` MODIFY `department` INT(11) DEFAULT NULL;
ALTER TABLE `modules` AUTO_INCREMENT = 1906;

SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='modules' AND CONSTRAINT_NAME='fk_mod_fs_v30');
SET @feeTbl := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='fee_structures');
SET @stmt := IF(@fk=0 AND @feeTbl=1,
  'ALTER TABLE `modules` ADD CONSTRAINT `fk_mod_fs_v30` FOREIGN KEY (`fee_structure_id`) REFERENCES `fee_structures` (`id`) ON DELETE SET NULL',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 9-d. module_programs.
CREATE TABLE IF NOT EXISTS `module_programs` (
  `id`           INT(11)   NOT NULL AUTO_INCREMENT,
  `module_id`    INT(11)   NOT NULL,
  `option_id`    INT(11)   NOT NULL,
  `module_order` INT(11)   DEFAULT NULL,
  `created_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_module_program` (`module_id`, `option_id`),
  KEY `idx_mp_module` (`module_id`),
  KEY `idx_mp_option` (`option_id`),
  CONSTRAINT `fk_mp_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mp_option` FOREIGN KEY (`option_id`) REFERENCES `options` (`id`)        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 9-e. module_marks — structure only.
CREATE TABLE IF NOT EXISTS `module_marks` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `module_id` int(11) NOT NULL,
  `student_regnumber` varchar(250) NOT NULL,
  `academic_term_id` int(10) UNSIGNED NOT NULL,
  `cat_marks` decimal(6,2) DEFAULT NULL,
  `assignment_marks` decimal(6,2) DEFAULT NULL,
  `cat1` decimal(6,2) DEFAULT NULL,
  `cat2` decimal(6,2) DEFAULT NULL,
  `cat3` decimal(6,2) DEFAULT NULL,
  `partial_exam` decimal(6,2) DEFAULT NULL,
  `exam_marks` decimal(6,2) DEFAULT NULL,
  `exam_1st_sitting` decimal(6,2) DEFAULT NULL,
  `exam_2nd_sitting` decimal(6,2) DEFAULT NULL,
  `cat_max` decimal(6,2) NOT NULL DEFAULT 20.00,
  `assignment_max` decimal(6,2) NOT NULL DEFAULT 10.00,
  `cat1_max` decimal(6,2) NOT NULL DEFAULT 15.00,
  `cat2_max` decimal(6,2) NOT NULL DEFAULT 15.00,
  `cat3_max` decimal(6,2) NOT NULL DEFAULT 15.00,
  `partial_exam_max` decimal(6,2) NOT NULL DEFAULT 15.00,
  `cats_max` decimal(6,2) NOT NULL DEFAULT 60.00,
  `exam_max` decimal(6,2) NOT NULL DEFAULT 70.00,
  `final_exam_max` decimal(6,2) NOT NULL DEFAULT 40.00,
  `total` decimal(6,2) DEFAULT NULL,
  `percentage` decimal(5,2) DEFAULT NULL,
  `grade` varchar(4) DEFAULT NULL,
  `decision` varchar(8) DEFAULT NULL,
  `is_exempted` tinyint(1) NOT NULL DEFAULT 0,
  `exemption_reason` varchar(500) DEFAULT NULL,
  `status` enum('draft','claims_open','submitted','confirmed') NOT NULL DEFAULT 'draft',
  `claims_opened_at` timestamp NULL DEFAULT NULL,
  `submitted_at` timestamp NULL DEFAULT NULL,
  `confirmed_at` timestamp NULL DEFAULT NULL,
  `teaching_started_on` date DEFAULT NULL,
  `teaching_ended_on` date DEFAULT NULL,
  `remarks` text DEFAULT NULL,
  `recorded_by` int(10) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_marks` (`module_id`,`student_regnumber`(40),`academic_term_id`),
  KEY `idx_marks_student_term` (`student_regnumber`(40),`academic_term_id`),
  KEY `idx_marks_module_term` (`module_id`,`academic_term_id`),
  KEY `idx_marks_term` (`academic_term_id`),
  CONSTRAINT `fk_marks_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_marks_term` FOREIGN KEY (`academic_term_id`) REFERENCES `academic_terms` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 9-f. module_assignments.user_id.
SET @tbl := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='module_assignments');
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='module_assignments' AND COLUMN_NAME='user_id');
SET @stmt := IF(@tbl=1 AND @col=0,
  'ALTER TABLE `module_assignments` ADD COLUMN `user_id` INT(10) UNSIGNED NULL DEFAULT NULL AFTER `staff_id`', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='module_assignments' AND INDEX_NAME='idx_ma_user');
SET @stmt := IF(@tbl=1 AND @idx=0,
  'ALTER TABLE `module_assignments` ADD INDEX `idx_ma_user` (`user_id`)', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 9-g. employees.user_id.
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='employees' AND COLUMN_NAME='user_id');
SET @stmt := IF(@col=0,
  'ALTER TABLE `employees` ADD COLUMN `user_id` INT(10) UNSIGNED NULL DEFAULT NULL AFTER `employee_id`', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='employees' AND INDEX_NAME='idx_emp_user');
SET @stmt := IF(@idx=0,
  'ALTER TABLE `employees` ADD INDEX `idx_emp_user` (`user_id`)', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 9-h. leave_requests — user_id + key repair + relax legacy NOT NULL columns.
SET @has_lr := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='leave_requests');

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='leave_requests' AND COLUMN_NAME='user_id');
SET @stmt := IF(@has_lr=1 AND @col=0,
  "ALTER TABLE `leave_requests` ADD COLUMN `user_id` INT(10) UNSIGNED DEFAULT NULL AFTER `staff_id`", 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='leave_requests' AND INDEX_NAME='idx_lr_user');
SET @stmt := IF(@has_lr=1 AND @idx=0,
  'ALTER TABLE `leave_requests` ADD INDEX `idx_lr_user` (`user_id`)', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @has_pk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
                WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='leave_requests' AND INDEX_NAME='PRIMARY');
SET @stmt := IF(@has_lr=1 AND @has_pk=0,
  'ALTER TABLE `leave_requests` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @is_ai := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='leave_requests'
                 AND COLUMN_NAME='id' AND EXTRA LIKE '%auto_increment%');
SET @stmt := IF(@has_lr=1 AND @is_ai=0,
  'ALTER TABLE `leave_requests` MODIFY `id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @nn := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='leave_requests'
              AND COLUMN_NAME='staff_id' AND IS_NULLABLE='NO');
SET @stmt := IF(@has_lr=1 AND @nn=1,
  'ALTER TABLE `leave_requests` MODIFY `staff_id` INT(10) UNSIGNED NULL DEFAULT NULL', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @nn := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='leave_requests'
              AND COLUMN_NAME='leave_type' AND IS_NULLABLE='NO');
SET @stmt := IF(@has_lr=1 AND @nn=1,
  "ALTER TABLE `leave_requests` MODIFY `leave_type` ENUM('Annual','Sick','Mission','Short Absence','Training') NULL DEFAULT NULL",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 9-i. leave_types — PK + AUTO_INCREMENT + seed.
SET @has_lt := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='leave_types');

SET @has_pk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
                WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='leave_types' AND INDEX_NAME='PRIMARY');
SET @stmt := IF(@has_lt=1 AND @has_pk=0,
  'ALTER TABLE `leave_types` ADD PRIMARY KEY (`id`)', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @is_ai := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='leave_types'
                 AND COLUMN_NAME='id' AND EXTRA LIKE '%auto_increment%');
SET @stmt := IF(@has_lt=1 AND @is_ai=0,
  'ALTER TABLE `leave_types` MODIFY `id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @lt_rows := IF(@has_lt=1, (SELECT COUNT(*) FROM `leave_types`), 1);
SET @stmt := IF(@has_lt=1 AND @lt_rows=0,
  "INSERT INTO `leave_types` (`name`,`description`,`days_allowed`,`is_paid`,`color`,`is_active`) VALUES
     ('Annual Leave',    'Paid annual vacation leave.',            21, 1, '#22C55E', 1),
     ('Sick Leave',      'Paid leave for illness or injury.',      15, 1, '#F97316', 1),
     ('Maternity Leave', 'Paid maternity leave.',                  84, 1, '#EC4899', 1),
     ('Paternity Leave', 'Paid paternity leave.',                   4, 1, '#6366F1', 1),
     ('Compassionate',   'Paid compassionate / bereavement leave.', 5, 1, '#A855F7', 1),
     ('Study Leave',     'Paid leave for study or examinations.',   10, 1, '#0EA5E9', 1),
     ('Unpaid Leave',    'Leave without pay.',                      30, 0, '#6B7280', 1)",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 9-j. REQUEST_LEAVE permission.
SET @cat_hr := (SELECT `id` FROM `permission_categories` WHERE `name`='HR Management' LIMIT 1);
INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`)
VALUES (@cat_hr, 'Request Leave', 'REQUEST_LEAVE', 'Submit your own leave requests and view their status.');
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug`='REQUEST_LEAVE'
WHERE r.`name` NOT IN ('applicant', 'student');

-- 9-k. Backfill employees ↔ users.
-- A. Link existing employees to user accounts by matching email.
UPDATE `employees` e
JOIN `users` u ON u.email COLLATE utf8mb4_unicode_ci = e.employee_username COLLATE utf8mb4_unicode_ci
SET e.user_id = u.id
WHERE (e.user_id IS NULL OR e.user_id = 0)
  AND u.email IS NOT NULL AND u.email <> '';

-- B. Create a linked employees row for every staff user still missing one.
INSERT INTO `employees`
  (`user_id`, `employee_fname`, `employee_lname`, `employee_gender`, `employee_age`,
   `employee_phone`, `employee_post`, `employee_position`, `additional_duty`, `faculty`,
   `employee_photo`, `employee_address`, `employee_status`, `employe_qr`, `employee_idcard`,
   `employee_bank`, `employee_account`, `employee_username`, `employee_password`,
   `employee_author`, `employee_reg_date`, `school_id`, `account_status`, `salary`)
SELECT
  u.id,
  SUBSTRING_INDEX(u.full_name, ' ', 1),
  TRIM(SUBSTRING(u.full_name, LENGTH(SUBSTRING_INDEX(u.full_name, ' ', 1)) + 1)),
  '', '',
  COALESCE(u.phone, ''),
  '', r.name, '', 0, '', '', 'Permanent', '', '', '', '',
  u.email, '', 'system-backfill', CURDATE(), 0,
  CASE WHEN u.is_active = 1 THEN 'Active' ELSE 'Inactive' END,
  0.00
FROM `users` u
JOIN `roles` r ON r.id = u.role_id
WHERE r.name NOT IN ('student', 'applicant')
  AND u.id NOT IN (
    SELECT user_id FROM (SELECT user_id FROM `employees` WHERE user_id IS NOT NULL) z
  )
  AND (u.email IS NULL OR u.email = '' OR u.email COLLATE utf8mb4_unicode_ci NOT IN (
    SELECT employee_username COLLATE utf8mb4_unicode_ci FROM (
      SELECT employee_username FROM `employees`
       WHERE employee_username IS NOT NULL AND employee_username <> ''
    ) y
  ));


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §10  Fix Student-ID Collations (migration 084)                              ║
-- ║                                                                              ║
-- ║  Fixes error 1267 "Illegal mix of collations": student.regnumber is          ║
-- ║  utf8mb4_unicode_ci but the finance/clearance tables' student_id columns     ║
-- ║  defaulted to the database-level utf8mb4_general_ci.                         ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
ALTER TABLE `fee_payments`
  MODIFY `student_id` VARCHAR(20) NOT NULL COLLATE utf8mb4_unicode_ci;

ALTER TABLE `fee_invoices`
  MODIFY `student_id` VARCHAR(20) NOT NULL COLLATE utf8mb4_unicode_ci;

ALTER TABLE `fee_bursaries`
  MODIFY `student_id` VARCHAR(20) NOT NULL COLLATE utf8mb4_unicode_ci;

ALTER TABLE `student_clearances`
  MODIFY `student_id` VARCHAR(20) NOT NULL COLLATE utf8mb4_unicode_ci;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='student_fee_overrides'
               AND COLUMN_NAME='student_id');
SET @stmt := IF(@col > 0,
  "ALTER TABLE `student_fee_overrides` MODIFY `student_id` VARCHAR(20) NOT NULL COLLATE utf8mb4_unicode_ci",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='fee_refunds'
               AND COLUMN_NAME='student_id');
SET @stmt := IF(@col > 0,
  "ALTER TABLE `fee_refunds` MODIFY `student_id` VARCHAR(20) NOT NULL COLLATE utf8mb4_unicode_ci",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='fee_fines'
               AND COLUMN_NAME='student_id');
SET @stmt := IF(@col > 0,
  "ALTER TABLE `fee_fines` MODIFY `student_id` VARCHAR(20) NOT NULL COLLATE utf8mb4_unicode_ci",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='overdue_alerts'
               AND COLUMN_NAME='student_id');
SET @stmt := IF(@col > 0,
  "ALTER TABLE `overdue_alerts` MODIFY `student_id` VARCHAR(20) NOT NULL COLLATE utf8mb4_unicode_ci",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §11  Finance Clearances Table (migration 085)                               ║
-- ║                                                                              ║
-- ║  New dedicated table for fee/balance-based financial clearance.              ║
-- ║  ClearanceModel.php now uses `finance_clearances` (not student_clearances). ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
CREATE TABLE IF NOT EXISTS `finance_clearances` (
  `id`                   INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  `student_id`           VARCHAR(20)    NOT NULL COLLATE utf8mb4_unicode_ci,
  `academic_year_id`     INT UNSIGNED   NOT NULL,
  `semester`             TINYINT UNSIGNED NULL DEFAULT NULL,
  `status`               ENUM('cleared','not_cleared','conditional') NOT NULL DEFAULT 'not_cleared',
  `balance_at_clearance` DECIMAL(12,2)  NULL DEFAULT NULL,
  `notes`                TEXT           NULL DEFAULT NULL,
  `cleared_by`           INT UNSIGNED   NULL DEFAULT NULL,
  `cleared_at`           DATETIME       NULL DEFAULT NULL,
  `auto_cleared`         TINYINT(1)     NOT NULL DEFAULT 0,
  `created_at`           DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fin_clr_student_year_sem` (`student_id`, `academic_year_id`, `semester`),
  INDEX `idx_fin_clr_year_status` (`academic_year_id`, `status`),
  CONSTRAINT `fk_fin_clr_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`),
  CONSTRAINT `fk_fin_clr_user` FOREIGN KEY (`cleared_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §12  student_applications — payment columns (migration 036)                 ║
-- ║                                                                              ║
-- ║  Error: Unknown column 'transaction_id' in 'SET'                            ║
-- ║  ApplicantProfileController::uploadPaymentSlip() updates student_applications ║
-- ║  with transaction_id, payment_slip_file_id, payment_slip_mime, etc.         ║
-- ║  Migration 036 adds these columns; if it was never run they are absent.     ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
SET @db = DATABASE();

SET @q = IF(EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='student_applications' AND COLUMN_NAME='transaction_id'),
  'SELECT 1',
  "ALTER TABLE `student_applications` ADD COLUMN `transaction_id` VARCHAR(100) NULL AFTER `sponsor_name`");
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

SET @q = IF(EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='student_applications' AND COLUMN_NAME='payment_slip_file_id'),
  'SELECT 1',
  "ALTER TABLE `student_applications` ADD COLUMN `payment_slip_file_id` VARCHAR(100) NULL AFTER `transaction_id`");
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

SET @q = IF(EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='student_applications' AND COLUMN_NAME='payment_slip_mime'),
  'SELECT 1',
  "ALTER TABLE `student_applications` ADD COLUMN `payment_slip_mime` VARCHAR(100) NULL AFTER `payment_slip_file_id`");
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

SET @q = IF(EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='student_applications' AND COLUMN_NAME='payment_amount'),
  'SELECT 1',
  "ALTER TABLE `student_applications` ADD COLUMN `payment_amount` DECIMAL(12,2) NULL AFTER `payment_slip_mime`");
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

SET @q = IF(EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='student_applications' AND COLUMN_NAME='payment_currency'),
  'SELECT 1',
  "ALTER TABLE `student_applications` ADD COLUMN `payment_currency` VARCHAR(10) NULL DEFAULT 'RWF' AFTER `payment_amount`");
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

SET @q = IF(EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='student_applications' AND COLUMN_NAME='paid_at'),
  'SELECT 1',
  "ALTER TABLE `student_applications` ADD COLUMN `paid_at` TIMESTAMP NULL DEFAULT NULL AFTER `payment_currency`");
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §13  fee_payments — fee_type, academic_year_id, semester (migrations 061+064) ║
-- ║                                                                              ║
-- ║  Error: Field 'academic_year_id' doesn't have a default value               ║
-- ║  UrubutoPayService::recordMobilePayment() passes fee_type and               ║
-- ║  academic_year_id to FeePaymentModel::create(). Both are in $fillable so   ║
-- ║  they are included in the INSERT, but the columns did not exist in the      ║
-- ║  comprehensive schema (027) or in the rebuild migration (051).              ║
-- ║                                                                              ║
-- ║  Also: make fee_invoices.academic_year_id nullable so that auto-invoice     ║
-- ║  creation in UrubutoPayService survives when no academic year can be        ║
-- ║  resolved for the student (resolveAcademicYearId returns null).             ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

-- fee_payments.fee_type (migration 061)
SET @q = IF(EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='fee_payments' AND COLUMN_NAME='fee_type'),
  'SELECT 1',
  "ALTER TABLE `fee_payments` ADD COLUMN `fee_type` VARCHAR(60) NULL DEFAULT NULL AFTER `amount`");
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- fee_payments.academic_year_id (migration 061)
SET @q = IF(EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='fee_payments' AND COLUMN_NAME='academic_year_id'),
  'SELECT 1',
  "ALTER TABLE `fee_payments` ADD COLUMN `academic_year_id` INT UNSIGNED NULL DEFAULT NULL AFTER `fee_type`");
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- fee_payments.semester (migration 064)
SET @q = IF(EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='fee_payments' AND COLUMN_NAME='semester'),
  'ALTER TABLE `fee_payments` MODIFY COLUMN `semester` TINYINT UNSIGNED NULL DEFAULT NULL',
  "ALTER TABLE `fee_payments` ADD COLUMN `semester` TINYINT UNSIGNED NULL DEFAULT NULL AFTER `academic_year_id`");
PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- Ensure fee_type and academic_year_id on fee_payments are always nullable
-- (safe no-op if they were just added above as nullable).
ALTER TABLE `fee_payments`
  MODIFY COLUMN `fee_type`        VARCHAR(60)   NULL DEFAULT NULL,
  MODIFY COLUMN `academic_year_id` INT UNSIGNED  NULL DEFAULT NULL;

-- fee_structures.semester — nullable so full-year structures work (migration 064).
ALTER TABLE `fee_structures`
  MODIFY COLUMN `semester` TINYINT UNSIGNED NULL DEFAULT NULL;

-- fee_invoices.semester — nullable so full-year invoices work (migration 064).
ALTER TABLE `fee_invoices`
  MODIFY COLUMN `semester` TINYINT UNSIGNED NULL DEFAULT NULL;

-- fee_invoices.academic_year_id — make nullable so that UrubutoPayService
-- auto-invoice creation succeeds even when no academic year can be resolved
-- for the student (resolveAcademicYearId returns null → INSERT would fail
-- with error 1364 on NOT NULL without DEFAULT).
ALTER TABLE `fee_invoices`
  MODIFY COLUMN `academic_year_id` INT UNSIGNED NULL DEFAULT NULL;

-- fee_payments.recorded_by — nullable for system/webhook payments that have
-- no human actor (migration 051 already set this, but guard for older schemas).
ALTER TABLE `fee_payments`
  MODIFY COLUMN `recorded_by` INT UNSIGNED NULL DEFAULT NULL;


SET FOREIGN_KEY_CHECKS = 1;

-- ══════════════════════════════════════════════════════════════════════════════
-- END OF CUMULATED MIGRATION
-- ══════════════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 083: Consolidated schema for the current work cycle.
-- Date: 2026-06-16
--
-- This single file rolls up every STRUCTURAL change made across migrations
-- 074, 076, 079, 080, 081 (employees link), 081 (leave repair) and 082, plus the
-- table definitions introduced by the module/marks rebuild (075/078). It is the
-- one file to apply to bring a database up to the shape the current code expects.
--
-- Design rules:
--   • Additive + idempotent. Every statement is guarded by INFORMATION_SCHEMA or
--     uses CREATE TABLE IF NOT EXISTS / INSERT IGNORE, so it is safe to re-run and
--     safe on environments that already have some of the changes.
--   • NON-destructive. It contains no DROP / TRUNCATE of live data and none of the
--     ~270 KB of legacy module/marks DATA. Loading that legacy data is a separate
--     one-time job (see migrations 075/077/078) — bundling it here would risk
--     wiping the modules/marks tables on any re-run.
--
-- Sections:
--   1. student            — columns the current code expects                  (was 074)
--   2. student_ids         — table + AUTO_INCREMENT repair                     (was 076)
--   3. modules             — new-shape table definition + guarded upgrades     (was 075/078)
--   4. module_programs      — module↔programme join table                      (was 075/078)
--   5. module_marks         — new marks table definition                       (was 078)
--   6. module_assignments   — user_id (assign any user as lecturer)            (was 079)
--   7. employees            — user_id link to the login account                (was 081)
--   8. leave_requests       — user_id (self-service requester)                 (was 080)
--   9. leave_requests/types — primary-key / AUTO_INCREMENT repair + seed       (was 081)
--  10. permissions          — REQUEST_LEAVE + grant to staff roles             (was 080)
--  11. backfill             — link + create an employees row for every staff user (was 082)
-- ══════════════════════════════════════════════════════════════════════════════


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ 1. student — columns the current code expects (legacy snapshots lack them)  ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
-- Fixes GET /api/students?...&std_option=9 -> 500 (Unknown column 'user_id'),
-- plus parent_student_id, programme_level, assigned_registry_user_id,
-- is_international and updated_at relied on by other student endpoints.

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='student' AND COLUMN_NAME='user_id');
SET @stmt := IF(@col=0,
  'ALTER TABLE `student` ADD COLUMN `user_id` INT(10) UNSIGNED DEFAULT NULL AFTER `id`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='student' AND COLUMN_NAME='parent_student_id');
SET @stmt := IF(@col=0,
  'ALTER TABLE `student` ADD COLUMN `parent_student_id` INT(10) UNSIGNED DEFAULT NULL AFTER `user_id`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='student' AND INDEX_NAME='idx_student_parent');
SET @stmt := IF(@idx=0,
  'ALTER TABLE `student` ADD INDEX `idx_student_parent` (`parent_student_id`)',
  'SELECT 1');
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
  'ALTER TABLE `student` ADD COLUMN `assigned_registry_user_id` INT(10) UNSIGNED NULL DEFAULT NULL',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='student' AND COLUMN_NAME='is_international');
SET @stmt := IF(@col=0,
  'ALTER TABLE `student` ADD COLUMN `is_international` TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='student' AND COLUMN_NAME='updated_at');
SET @stmt := IF(@col=0,
  'ALTER TABLE `student` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ 2. student_ids — ensure the table exists with a working AUTO_INCREMENT key  ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
-- Fixes POST /api/student-ids/issue -> 500 on deployments where the table was
-- never created or imported without AUTO_INCREMENT on `id`.

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


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ 3. modules — new-shape table definition + guarded upgrade of legacy tables  ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
-- Structure only — NO data. Loading the deduped legacy modules is the separate
-- one-time job in migrations 075 / 078.

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

-- Bring a pre-existing legacy-shaped `modules` up to the new shape.
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='modules' AND COLUMN_NAME='fee_structure_id');
SET @stmt := IF(@col=0,
  'ALTER TABLE `modules` ADD COLUMN `fee_structure_id` INT(10) UNSIGNED DEFAULT NULL AFTER `school_id`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='modules' AND COLUMN_NAME='status');
SET @stmt := IF(@col=0,
  "ALTER TABLE `modules` ADD COLUMN `status` ENUM('draft','active','archived') NOT NULL DEFAULT 'active' AFTER `fee_structure_id`",
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- department holds an option/department id (no FK) — relax any legacy NOT NULL.
ALTER TABLE `modules` MODIFY `department` INT(11) DEFAULT NULL;

-- Keep new module ids above the legacy id range (no-op once max(id) >= 1906).
ALTER TABLE `modules` AUTO_INCREMENT = 1906;

-- Optional FK to fee_structures, only if that table exists and the FK is absent.
SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='modules' AND CONSTRAINT_NAME='fk_mod_fs_v30');
SET @feeTbl := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='fee_structures');
SET @stmt := IF(@fk=0 AND @feeTbl=1,
  'ALTER TABLE `modules` ADD CONSTRAINT `fk_mod_fs_v30` FOREIGN KEY (`fee_structure_id`) REFERENCES `fee_structures` (`id`) ON DELETE SET NULL',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ 4. module_programs — a module can belong to several programmes (options)     ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
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


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ 5. module_marks — new marks structure (CAT / exam components, workflow)      ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
-- Structure only — NO data. Importing legacy marks is migration 077 / 078.
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


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ 6. module_assignments.user_id — assign ANY non-student user as a lecturer    ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
SET @tbl := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='module_assignments');
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='module_assignments' AND COLUMN_NAME='user_id');
SET @stmt := IF(@tbl=1 AND @col=0,
  'ALTER TABLE `module_assignments` ADD COLUMN `user_id` INT(10) UNSIGNED NULL DEFAULT NULL AFTER `staff_id`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='module_assignments' AND INDEX_NAME='idx_ma_user');
SET @stmt := IF(@tbl=1 AND @idx=0,
  'ALTER TABLE `module_assignments` ADD INDEX `idx_ma_user` (`user_id`)',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ 7. employees.user_id — 1:1 link to the login account (users)                 ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='employees' AND COLUMN_NAME='user_id');
SET @stmt := IF(@col=0,
  'ALTER TABLE `employees` ADD COLUMN `user_id` INT(10) UNSIGNED NULL DEFAULT NULL AFTER `employee_id`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='employees' AND INDEX_NAME='idx_emp_user');
SET @stmt := IF(@idx=0,
  'ALTER TABLE `employees` ADD INDEX `idx_emp_user` (`user_id`)',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ 8 & 9. leave_requests / leave_types — self-service column + key repair       ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
-- All leave_requests work is gated on the table existing so the file is safe on
-- environments where the HR leave module was never installed.
SET @has_lr := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='leave_requests');

-- 8. leave_requests.user_id (self-service requester) --------------------------
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='leave_requests' AND COLUMN_NAME='user_id');
SET @stmt := IF(@has_lr=1 AND @col=0,
  'ALTER TABLE `leave_requests` ADD COLUMN `user_id` INT(10) UNSIGNED DEFAULT NULL COMMENT ''FK -> users.id (self-service requester)'' AFTER `staff_id`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='leave_requests' AND INDEX_NAME='idx_lr_user');
SET @stmt := IF(@has_lr=1 AND @idx=0,
  'ALTER TABLE `leave_requests` ADD INDEX `idx_lr_user` (`user_id`)',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 9a. leave_requests: ensure PRIMARY KEY + AUTO_INCREMENT on id ----------------
SET @has_pk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
                WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='leave_requests' AND INDEX_NAME='PRIMARY');
SET @stmt := IF(@has_lr=1 AND @has_pk=0,
  'ALTER TABLE `leave_requests` ADD PRIMARY KEY (`id`)',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @is_ai := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='leave_requests' AND COLUMN_NAME='id' AND EXTRA LIKE '%auto_increment%');
SET @stmt := IF(@has_lr=1 AND @is_ai=0,
  'ALTER TABLE `leave_requests` MODIFY `id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Legacy columns the app never populates must be nullable (else error 1364).
SET @nn := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='leave_requests' AND COLUMN_NAME='staff_id' AND IS_NULLABLE='NO');
SET @stmt := IF(@has_lr=1 AND @nn=1,
  'ALTER TABLE `leave_requests` MODIFY `staff_id` INT(10) UNSIGNED NULL DEFAULT NULL',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @nn := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='leave_requests' AND COLUMN_NAME='leave_type' AND IS_NULLABLE='NO');
SET @stmt := IF(@has_lr=1 AND @nn=1,
  'ALTER TABLE `leave_requests` MODIFY `leave_type` ENUM(''Annual'',''Sick'',''Mission'',''Short Absence'',''Training'') NULL DEFAULT NULL',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 9b. leave_types: ensure PRIMARY KEY + AUTO_INCREMENT, then seed if empty -----
SET @has_lt := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='leave_types');

SET @has_pk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
                WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='leave_types' AND INDEX_NAME='PRIMARY');
SET @stmt := IF(@has_lt=1 AND @has_pk=0,
  'ALTER TABLE `leave_types` ADD PRIMARY KEY (`id`)',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @is_ai := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='leave_types' AND COLUMN_NAME='id' AND EXTRA LIKE '%auto_increment%');
SET @stmt := IF(@has_lt=1 AND @is_ai=0,
  'ALTER TABLE `leave_types` MODIFY `id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Seed the canonical catalogue ONLY when the table is empty (non-destructive:
-- never wipes a populated catalogue on re-run). The original 081 repair TRUNCATEd
-- a known double-seeded catalogue; run that standalone migration if you hit it.
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


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ 10. permissions — REQUEST_LEAVE + grant to every staff role                  ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
SET @cat_hr := (SELECT `id` FROM `permission_categories` WHERE `name`='HR Management' LIMIT 1);

INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`)
VALUES (@cat_hr, 'Request Leave', 'REQUEST_LEAVE', 'Submit your own leave requests and view their status.');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug`='REQUEST_LEAVE'
WHERE r.`name` NOT IN ('applicant', 'student');


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ 11. backfill — every staff user gets a linked employees row                  ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
-- Depends on §7 (employees.user_id). Idempotent: re-running is a no-op.

-- A. Link an existing employee to its user account by matching email.
UPDATE `employees` e
JOIN `users` u ON u.email COLLATE utf8mb4_unicode_ci = e.employee_username COLLATE utf8mb4_unicode_ci
SET e.user_id = u.id
WHERE (e.user_id IS NULL OR e.user_id = 0)
  AND u.email IS NOT NULL AND u.email <> '';

-- B. Create a linked employee for every staff user still missing one.
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
  '',                       -- employee_post (department) — fill in later
  r.name,                   -- employee_position = role label (sensible default)
  '', 0,
  '', '', 'Permanent', '', '',
  '', '',
  u.email,
  '',                       -- no employee password — login is via the user account
  'system-backfill',
  CURDATE(),
  0,
  CASE WHEN u.is_active = 1 THEN 'Active' ELSE 'Inactive' END,
  0.00
FROM `users` u
JOIN `roles` r ON r.id = u.role_id
-- The `employees` subqueries are wrapped in derived tables so MySQL materialises
-- them first — otherwise referencing the INSERT target table in the SELECT
-- raises error 1093 ("table specified twice").
WHERE r.name NOT IN ('student', 'applicant')
  AND u.id NOT IN (
        SELECT user_id FROM (SELECT user_id FROM `employees` WHERE user_id IS NOT NULL) z
      )
  AND (u.email IS NULL OR u.email = '' OR u.email COLLATE utf8mb4_unicode_ci NOT IN (
        SELECT employee_username COLLATE utf8mb4_unicode_ci FROM (
          SELECT employee_username FROM `employees` WHERE employee_username IS NOT NULL AND employee_username <> ''
        ) y
      ));

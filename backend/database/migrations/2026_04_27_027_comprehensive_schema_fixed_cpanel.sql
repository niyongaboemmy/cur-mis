-- =============================================================================
-- 2026_04_27_027_comprehensive_schema.sql
-- Complete database schema for CUR-MIS.
--
-- Safe to run on any state:
--   • CREATE TABLE IF NOT EXISTS  — skips tables that already exist.
--   • ALTER TABLE … ADD COLUMN IF NOT EXISTS (via stored proc) — adds only
--     missing columns on tables created by earlier migrations.
--   • INSERT IGNORE / ON DUPLICATE KEY UPDATE — safe seed data.
--
-- Table groups (dependency order, parents before children):
--   §1  Auth & RBAC
--   §2  System
--   §3  Academic Structure
--   §4  Staff
--   §5  Modules
--   §6  Attendance
--   §7  Admissions
--   §8  Student Records
--   §9  HR & Payroll
--   §10 Finance
--   §11 Communication
--   §12 Legacy / Archival
-- =============================================================================

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- =============================================================================
-- §1  AUTH & RBAC
-- =============================================================================

CREATE TABLE IF NOT EXISTS `permission_categories` (
  `id`          INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(100) NOT NULL,
  `description` TEXT,
  `created_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `permissions` (
  `id`          INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `category_id` INT(10) UNSIGNED NOT NULL,
  `name`        VARCHAR(100) NOT NULL,
  `slug`        VARCHAR(100) NOT NULL,
  `description` TEXT,
  `created_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `roles` (
  `id`          INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(50)  NOT NULL,
  `description` TEXT,
  `created_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `users` (
  `id`                    INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `username`              VARCHAR(60)      NOT NULL COMMENT 'Internal username',
  `password`              VARCHAR(255)     NOT NULL,
  `full_name`             VARCHAR(120)     NOT NULL,
  `email`                 VARCHAR(120)     NOT NULL COMMENT 'Login identifier; OTP sent here',
  `phone`                 VARCHAR(20)      DEFAULT NULL,
  `role_id`               INT(10) UNSIGNED NOT NULL,
  `reset_token`           VARCHAR(255)     DEFAULT NULL,
  `reset_token_expires_at`DATETIME         DEFAULT NULL,
  `is_active`             TINYINT(1)       NOT NULL DEFAULT 1,
  `is_applicant`          TINYINT(1)       NOT NULL DEFAULT 0 COMMENT '1 = self-registered applicant',
  `must_change_pw`        TINYINT(1)       NOT NULL DEFAULT 0,
  `otp_code`              VARCHAR(10)      DEFAULT NULL,
  `otp_expires_at`        DATETIME         DEFAULT NULL,
  `last_login`            DATETIME         DEFAULT NULL,
  `last_activity`         DATETIME         DEFAULT NULL,
  `login_count`           INT(11)          NOT NULL DEFAULT 0,
  `created_at`            TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `role_permissions` (
  `role_id`       INT(10) UNSIGNED NOT NULL,
  `permission_id` INT(10) UNSIGNED NOT NULL,
  `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`role_id`, `permission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- §2  SYSTEM
-- =============================================================================

CREATE TABLE IF NOT EXISTS `settings` (
  `id`          INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `key_name`    VARCHAR(100)     NOT NULL,
  `value`       TEXT,
  `description` VARCHAR(255)     DEFAULT NULL,
  `updated_at`  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `key_name` (`key_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `academic_years` (
  `id`                  INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `label`               VARCHAR(9)       NOT NULL COMMENT 'e.g. 2025-2026',
  `start_date`          DATE             NOT NULL,
  `end_date`            DATE             NOT NULL,
  `is_current`          TINYINT(1)       NOT NULL DEFAULT 0,
  `clearance_threshold` DECIMAL(15,2)    NOT NULL DEFAULT 0.00 COMMENT 'Max outstanding balance for auto-clearance',
  `created_at`          TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `academic_terms` (
  `id`               INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `academic_year_id` INT(10) UNSIGNED NOT NULL,
  `label`            VARCHAR(50)      NOT NULL COMMENT 'e.g. Semester 1',
  `start_date`       DATE             NOT NULL,
  `end_date`         DATE             NOT NULL,
  `is_current`       TINYINT(1)       NOT NULL DEFAULT 0,
  `created_at`       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_academic_year_id` (`academic_year_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- §3  ACADEMIC STRUCTURE
-- =============================================================================

CREATE TABLE IF NOT EXISTS `schools` (
  `school_id`      INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `school_name`    TEXT        NOT NULL,
  `school_descript`TEXT        NOT NULL,
  `school_logo`    TEXT        NOT NULL,
  `school_banner`  TEXT        NOT NULL,
  `school_address` VARCHAR(21) NOT NULL,
  `school_phone`   VARCHAR(21) NOT NULL,
  `school_email`   TEXT        NOT NULL,
  `school_date`    DATE        NOT NULL,
  `school_author`  INT(10) UNSIGNED NOT NULL,
  `url`            VARCHAR(40) NOT NULL,
  PRIMARY KEY (`school_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `faculty` (
  `fac_id`       INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `fac_name`     VARCHAR(51) NOT NULL,
  `fac_code`     VARCHAR(21) NOT NULL,
  `fac_descript` TEXT        NOT NULL,
  `fac_reg_date` DATE        NOT NULL,
  `school_id`    INT(10) UNSIGNED NOT NULL,
  PRIMARY KEY (`fac_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `departements` (
  `dep_id`               INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `dep_name`             VARCHAR(200) NOT NULL,
  `dep_acronym`          VARCHAR(21)  NOT NULL,
  `dep_description`      TEXT         NOT NULL,
  `fac_id`               INT(10) UNSIGNED NOT NULL,
  `school_id`            INT(10) UNSIGNED NOT NULL,
  `dep_author`           INT(10) UNSIGNED NOT NULL,
  `program`              VARCHAR(100) NOT NULL,
  `index_number`         INT(11)      NOT NULL DEFAULT 0,
  `allowed_combinations` JSON         DEFAULT NULL COMMENT 'Accepted A-level subject combinations',
  `program_level`        ENUM('undergraduate','postgraduate','diploma','certificate') NOT NULL DEFAULT 'undergraduate',
  PRIMARY KEY (`dep_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `dep_options` (
  `op_id`          INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `department`     INT(10) UNSIGNED NOT NULL,
  `option_name`    TEXT        NOT NULL,
  `option_acronym` VARCHAR(40) NOT NULL,
  `date`           DATE        NOT NULL,
  `creator`        INT(10) UNSIGNED NOT NULL,
  `school_id`      INT(10) UNSIGNED NOT NULL,
  PRIMARY KEY (`op_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `options` (
  `id`            INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `department_id` INT(10) UNSIGNED NOT NULL,
  `name`          VARCHAR(255)     NOT NULL,
  `is_active`     TINYINT(1)       DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `department_id` (`department_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `levels` (
  `id`   INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(50)      NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `rooms` (
  `id`        INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`      VARCHAR(60)      NOT NULL,
  `building`  VARCHAR(80)      DEFAULT NULL,
  `capacity`  SMALLINT(6)      NOT NULL DEFAULT 30,
  `room_type` ENUM('lecture','lab','seminar','exam_hall') NOT NULL DEFAULT 'lecture',
  `is_active` TINYINT(1)       NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `degree_catalogue` (
  `id`            INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`          VARCHAR(20)      NOT NULL,
  `name`          VARCHAR(200)     NOT NULL,
  `department_id` INT(10) UNSIGNED DEFAULT NULL,
  `degree_type`   ENUM('Certificate','Diploma','Bachelor','Master','PhD') DEFAULT 'Bachelor',
  `duration_years`INT(10) UNSIGNED DEFAULT 3,
  `total_credits` INT(10) UNSIGNED DEFAULT 180,
  `is_active`     TINYINT(1)       DEFAULT 1,
  `created_at`    TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `degrees` (
  `id`             INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`     INT(10) UNSIGNED NOT NULL,
  `program_id`     INT(10) UNSIGNED DEFAULT NULL,
  `degree_type`    ENUM('Certificate','Diploma','Bachelor','Master','PhD') NOT NULL,
  `degree_title`   VARCHAR(200)     NOT NULL,
  `classification` VARCHAR(60)      DEFAULT NULL,
  `awarded_date`   DATE             DEFAULT NULL,
  `certificate_no` VARCHAR(60)      DEFAULT NULL,
  `file_path`      VARCHAR(255)     DEFAULT NULL,
  `created_at`     TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `timetable` (
  `id`               INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `course_id`        INT(10) UNSIGNED NOT NULL,
  `staff_id`         INT(10) UNSIGNED DEFAULT NULL,
  `room_id`          INT(10) UNSIGNED DEFAULT NULL,
  `academic_year_id` INT(10) UNSIGNED NOT NULL,
  `semester`         TINYINT(4)       NOT NULL,
  `day_of_week`      ENUM('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday') NOT NULL,
  `start_time`       TIME             NOT NULL,
  `end_time`         TIME             NOT NULL,
  `created_at`       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `program_courses` (
  `id`          INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `program_id`  INT(10) UNSIGNED NOT NULL,
  `course_id`   INT(10) UNSIGNED NOT NULL,
  `is_required` TINYINT(1)       NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `regnumbers` (
  `id`           INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `regnumber`    VARCHAR(32)      NOT NULL,
  `category`     VARCHAR(40)      NOT NULL,
  `school`       INT(10) UNSIGNED DEFAULT NULL,
  `generated_on` DATE             NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `grading_scales` (
  `id`          INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `grade`       VARCHAR(5)       NOT NULL,
  `min_marks`   DECIMAL(5,2)     NOT NULL,
  `max_marks`   DECIMAL(5,2)     NOT NULL,
  `grade_point` DECIMAL(3,1)     NOT NULL,
  `description` VARCHAR(60)      DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- §4  STAFF
-- =============================================================================

CREATE TABLE IF NOT EXISTS `staff` (
  `id`                 INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`            INT(10) UNSIGNED DEFAULT NULL COMMENT 'FK → users.id (nullable — not all staff have portal access)',
  `staff_number`       VARCHAR(30)      NOT NULL,
  `first_name`         VARCHAR(80)      NOT NULL,
  `last_name`          VARCHAR(80)      NOT NULL,
  `other_names`        VARCHAR(80)      DEFAULT NULL,
  `email`              VARCHAR(120)     DEFAULT NULL,
  `phone`              VARCHAR(20)      DEFAULT NULL,
  `gender`             ENUM('Male','Female','Other') DEFAULT NULL,
  `dob`                DATE             DEFAULT NULL,
  `national_id`        VARCHAR(30)      DEFAULT NULL,
  `department_id`      INT(10) UNSIGNED DEFAULT NULL,
  `position`           VARCHAR(100)     DEFAULT NULL,
  `qualifications`     TEXT,
  `contract_type`      ENUM('full_time','part_time','contract','visiting') NOT NULL DEFAULT 'full_time',
  `contract_category`  ENUM('Probation','Temporal','Part-time','Full-time') DEFAULT 'Full-time',
  `contract_start_date`DATE             DEFAULT NULL,
  `contract_end_date`  DATE             DEFAULT NULL,
  `hire_date`          DATE             DEFAULT NULL,
  `basic_salary`       DECIMAL(12,2)    DEFAULT NULL,
  `housing_allowance`  DECIMAL(15,2)    NOT NULL DEFAULT 0.00,
  `transport_allowance`DECIMAL(15,2)    NOT NULL DEFAULT 0.00,
  `bank_account`       VARCHAR(60)      DEFAULT NULL,
  `bank_name`          VARCHAR(100)     DEFAULT NULL,
  `account_number`     VARCHAR(50)      DEFAULT NULL,
  `rssb_number`        VARCHAR(50)      DEFAULT NULL,
  `degree`             VARCHAR(255)     DEFAULT NULL,
  `specialization`     VARCHAR(255)     DEFAULT NULL,
  `equivalence_abroad` VARCHAR(255)     DEFAULT NULL,
  `photo`              VARCHAR(255)     DEFAULT NULL,
  `is_active`          TINYINT(1)       NOT NULL DEFAULT 1,
  `created_at`         TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `employees` (
  `employee_id`      INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_fname`   VARCHAR(31)  NOT NULL,
  `employee_lname`   VARCHAR(31)  NOT NULL,
  `employee_gender`  VARCHAR(11)  NOT NULL,
  `employee_age`     VARCHAR(21)  NOT NULL,
  `employee_phone`   VARCHAR(21)  NOT NULL,
  `employee_post`    VARCHAR(21)  NOT NULL,
  `employee_position`VARCHAR(21)  NOT NULL,
  `additional_duty`  TEXT         NOT NULL,
  `faculty`          INT(10) UNSIGNED NOT NULL,
  `employee_photo`   TEXT         NOT NULL,
  `employee_address` TEXT         NOT NULL,
  `employee_status`  VARCHAR(21)  NOT NULL,
  `employe_qr`       TEXT         NOT NULL,
  `employee_idcard`  VARCHAR(21)  NOT NULL,
  `employee_bank`    VARCHAR(21)  NOT NULL,
  `employee_account` VARCHAR(21)  NOT NULL,
  `salary`           DECIMAL(15,2)NOT NULL DEFAULT 0.00,
  `employee_username`VARCHAR(50)  NOT NULL,
  `employee_password`TEXT         NOT NULL,
  `employee_author`  VARCHAR(21)  NOT NULL,
  `employee_reg_date`DATE         NOT NULL,
  `school_id`        INT(10) UNSIGNED NOT NULL,
  `account_status`   ENUM('Active','Inactive') DEFAULT 'Active',
  `otp_code`         VARCHAR(10)  DEFAULT NULL,
  `otp_expires_at`   DATETIME     DEFAULT NULL,
  `last_login`       DATETIME     DEFAULT NULL,
  `last_activity`    DATETIME     DEFAULT NULL,
  `login_count`      INT(11)      NOT NULL DEFAULT 0,
  PRIMARY KEY (`employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `hr_employees` (
  `id`            INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `emp_code`      VARCHAR(20)  NOT NULL,
  `staff_id`      INT(10) UNSIGNED DEFAULT NULL COMMENT 'FK → staff.id if exists',
  `full_name`     VARCHAR(100) NOT NULL,
  `gender`        ENUM('M','F') NOT NULL,
  `department`    VARCHAR(80)  NOT NULL,
  `position`      VARCHAR(80)  NOT NULL,
  `contract_type` ENUM('Permanent','Temporal','Part-time') NOT NULL DEFAULT 'Permanent',
  `start_date`    DATE         NOT NULL,
  `end_date`      DATE         DEFAULT NULL,
  `salary`        DECIMAL(12,2)NOT NULL DEFAULT 0.00,
  `phone`         VARCHAR(20)  DEFAULT NULL,
  `email`         VARCHAR(100) DEFAULT NULL,
  `status`        ENUM('Active','Inactive','Terminated') NOT NULL DEFAULT 'Active',
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `hr_staff` (
  `id`         INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `fname`      VARCHAR(100) NOT NULL,
  `lname`      VARCHAR(100) NOT NULL,
  `email`      VARCHAR(255) NOT NULL,
  `position`   VARCHAR(100) NOT NULL,
  `department` INT(10) UNSIGNED NOT NULL,
  `status`     VARCHAR(50)  DEFAULT 'active',
  PRIMARY KEY (`id`),
  KEY `department` (`department`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- §5  MODULES
-- =============================================================================

CREATE TABLE IF NOT EXISTS `modules` (
  `module_id`      INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `module_name`    VARCHAR(100) NOT NULL,
  `description`    TEXT,
  `module_code`    VARCHAR(20)  NOT NULL,
  `module_credits` INT(11)      NOT NULL,
  `department`     INT(10) UNSIGNED NOT NULL,
  `d_option`       VARCHAR(40)  DEFAULT NULL,
  `level`          INT(11)      NOT NULL,
  `hours`          INT(11)      DEFAULT NULL,
  `price`          INT(11)      DEFAULT NULL,
  `author`         INT(10) UNSIGNED DEFAULT NULL,
  `school_id`      INT(10) UNSIGNED DEFAULT NULL,
  `status`         ENUM('draft','active','archived') NOT NULL DEFAULT 'active',
  PRIMARY KEY (`module_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `module_prerequisites` (
  `id`                    INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `module_id`             INT(11) NOT NULL,
  `prerequisite_module_id`INT(11) NOT NULL,
  `created_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_prereq_pair` (`module_id`, `prerequisite_module_id`),
  KEY `idx_prereq_module`   (`module_id`),
  KEY `idx_prereq_required` (`prerequisite_module_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `module_assignments` (
  `id`               INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `module_id`        INT(11) NOT NULL,
  `staff_id`         INT(10) UNSIGNED NOT NULL,
  `academic_year_id` INT(10) UNSIGNED NOT NULL,
  `academic_term_id` INT(10) UNSIGNED NOT NULL,
  `role`             ENUM('primary','assistant') NOT NULL DEFAULT 'primary',
  `hours_per_week`   DECIMAL(4,1)    NOT NULL DEFAULT 0.0,
  `notes`            TEXT,
  `created_by`       INT(10) UNSIGNED DEFAULT NULL,
  `created_at`       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_assignment` (`module_id`, `staff_id`, `academic_term_id`),
  KEY `idx_asgn_staff_term`  (`staff_id`, `academic_term_id`),
  KEY `idx_asgn_module_term` (`module_id`, `academic_term_id`),
  KEY `idx_asgn_year`        (`academic_year_id`),
  KEY `idx_asgn_term`        (`academic_term_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `module_schedules` (
  `id`                   INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `module_id`            INT(11) NOT NULL,
  `module_assignment_id` INT(10) UNSIGNED DEFAULT NULL,
  `academic_term_id`     INT(10) UNSIGNED NOT NULL,
  `room_id`              INT(10) UNSIGNED NOT NULL,
  `day_of_week`          TINYINT(3) UNSIGNED NOT NULL COMMENT '1=Mon … 7=Sun',
  `start_time`           TIME             NOT NULL,
  `end_time`             TIME             NOT NULL,
  `start_date`           DATE             DEFAULT NULL,
  `end_date`             DATE             DEFAULT NULL,
  `session_type`         ENUM('lecture','lab','tutorial','seminar','exam') NOT NULL DEFAULT 'lecture',
  `notes`                VARCHAR(255)     DEFAULT NULL,
  `created_at`           TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sched_module_term` (`module_id`, `academic_term_id`),
  KEY `idx_sched_room_day`    (`room_id`, `day_of_week`, `academic_term_id`),
  KEY `idx_sched_asgn`        (`module_assignment_id`),
  KEY `idx_sched_term`        (`academic_term_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `module_registrations` (
  `id`               INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `module_id`        INT(11) NOT NULL,
  -- Pinned collation to match student.regnumber and prevent "Illegal mix of collations" JOINs.
  `student_regnumber`VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `academic_term_id` INT(10) UNSIGNED NOT NULL,
  `status`           ENUM('registered','dropped','completed','failed') NOT NULL DEFAULT 'registered',
  `grade`            VARCHAR(4)       DEFAULT NULL,
  `registered_at`    TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `dropped_at`       TIMESTAMP        NULL DEFAULT NULL,
  `created_at`       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_registration` (`module_id`, `student_regnumber`, `academic_term_id`),
  KEY `idx_reg_student_term` (`student_regnumber`, `academic_term_id`),
  KEY `idx_reg_module_term`  (`module_id`, `academic_term_id`),
  KEY `idx_reg_term`         (`academic_term_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;



CREATE TABLE IF NOT EXISTS `module_marks` (
  `id`               INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `module_id`        INT(11) NOT NULL,
  `student_regnumber`VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `academic_term_id` INT(10) UNSIGNED NOT NULL,
  `cat_marks`        DECIMAL(6,2)     DEFAULT NULL,
  `assignment_marks` DECIMAL(6,2)     DEFAULT NULL,
  `exam_marks`       DECIMAL(6,2)     DEFAULT NULL,
  `cat_max`          DECIMAL(6,2)     NOT NULL DEFAULT 20.00,
  `assignment_max`   DECIMAL(6,2)     NOT NULL DEFAULT 10.00,
  `exam_max`         DECIMAL(6,2)     NOT NULL DEFAULT 70.00,
  `total`            DECIMAL(6,2)     DEFAULT NULL,
  `percentage`       DECIMAL(5,2)     DEFAULT NULL,
  `grade`            VARCHAR(4)       DEFAULT NULL,
  `remarks`          TEXT,
  `recorded_by`      INT(10) UNSIGNED DEFAULT NULL,
  `created_at`       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_marks` (`module_id`, `student_regnumber`, `academic_term_id`),
  KEY `idx_marks_student_term` (`student_regnumber`, `academic_term_id`),
  KEY `idx_marks_module_term`  (`module_id`, `academic_term_id`),
  KEY `idx_marks_term`         (`academic_term_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- §6  ATTENDANCE
-- =============================================================================

CREATE TABLE IF NOT EXISTS `attendance_sessions` (
  `id`                 INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `module_id`          INT(11) NOT NULL,
  `module_schedule_id` INT(10) UNSIGNED DEFAULT NULL,
  `academic_term_id`   INT(10) UNSIGNED NOT NULL,
  `session_date`       DATE             NOT NULL,
  `session_type`       ENUM('lecture','lab','tutorial','seminar','exam') NOT NULL DEFAULT 'lecture',
  `status`             ENUM('open','closed') NOT NULL DEFAULT 'open',
  `is_locked`          TINYINT(1)       NOT NULL DEFAULT 0,
  `notes`              VARCHAR(500)     DEFAULT NULL,
  `started_by`         INT(10) UNSIGNED DEFAULT NULL COMMENT 'users.id who opened the session',
  `created_at`         TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_session` (`module_id`, `session_date`, `session_type`),
  KEY `idx_sess_term_date`   (`academic_term_id`, `session_date`),
  KEY `idx_sess_module_date` (`module_id`, `session_date`),
  KEY `idx_sess_schedule`    (`module_schedule_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `attendance_records` (
  `id`               INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `session_id`       INT(10) UNSIGNED NOT NULL,
  `student_regnumber`VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `status`           ENUM('present','absent','late','excused') NOT NULL DEFAULT 'present',
  `remarks`          VARCHAR(255)     DEFAULT NULL,
  `recorded_by`      INT(10) UNSIGNED DEFAULT NULL,
  `recorded_at`      TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_session_student` (`session_id`, `student_regnumber`),
  KEY `idx_rec_student` (`student_regnumber`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- §7  ADMISSIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS `intakes` (
  `id`         INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`       VARCHAR(50)      NOT NULL,
  `start_date` DATE             NOT NULL,
  `end_date`   DATE             NOT NULL,
  `is_active`  TINYINT(1)       NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `document_types` (
  `id`                 INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`               VARCHAR(120)     NOT NULL,
  `slug`               VARCHAR(100)     NOT NULL,
  `description`        TEXT,
  `allowed_extensions` VARCHAR(100)     DEFAULT 'pdf,jpg,jpeg,png',
  `is_active`          TINYINT(1)       NOT NULL DEFAULT 1,
  `sort_order`         INT(11)          NOT NULL DEFAULT 0,
  `created_at`         TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_document_types_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `admission_requirements` (
  `id`               INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `faculty_id`       INT(10) UNSIGNED NOT NULL,
  `academic_year_id` INT(10) UNSIGNED NOT NULL,
  `document_type_id` INT(10) UNSIGNED NOT NULL,
  `is_required`      TINYINT(1)       NOT NULL DEFAULT 1,
  `notes`            VARCHAR(255)     DEFAULT NULL COMMENT 'Guidance shown to applicant',
  `sort_order`       INT(11)          NOT NULL DEFAULT 0,
  `created_by`       INT(10) UNSIGNED DEFAULT NULL,
  `created_at`       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ar_faculty_year_type` (`faculty_id`, `academic_year_id`, `document_type_id`),
  KEY `idx_ar_faculty_year` (`faculty_id`, `academic_year_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `student_applications` (
  `id`                  INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `application_number`  VARCHAR(20)      NOT NULL,
  `academic_year_id`    INT(10) UNSIGNED NOT NULL,
  `faculty_id`          INT(10) UNSIGNED NOT NULL COMMENT 'FK → faculty.fac_id',
  `department_id`       INT(10) UNSIGNED NOT NULL,
  `intake`              VARCHAR(20)      NOT NULL COMMENT 'e.g. 2026-A',
  `first_name`          VARCHAR(100)     NOT NULL,
  `last_name`           VARCHAR(100)     NOT NULL,
  `email`               VARCHAR(150)     NOT NULL,
  `phone`               VARCHAR(30)      NOT NULL,
  `gender`              ENUM('M','F','Other') NOT NULL,
  `birthdate`           DATE             NOT NULL,
  `nationality`         VARCHAR(100)     NOT NULL DEFAULT 'Rwandan',
  `address`             TEXT,
  `prev_school`         VARCHAR(255)     NOT NULL,
  `prev_qualification`  VARCHAR(150)     NOT NULL,
  `prev_grade`          VARCHAR(50)      NOT NULL,
  `combination`         VARCHAR(100)     DEFAULT NULL,
  `graduation_year`     YEAR          NOT NULL,
  `sponsorship`         ENUM('government','self','private','scholarship') NOT NULL DEFAULT 'self',
  `sponsor_name`        VARCHAR(150)     DEFAULT NULL,
  `status`              ENUM('draft','submitted','documents_under_review','documents_verified','documents_rejected','requested_changes','merit_listed','offered','offer_accepted','offer_declined','enrolled','withdrawn') NOT NULL DEFAULT 'draft',
  `email_verified`      TINYINT(1)       NOT NULL DEFAULT 0,
  `verification_code`   VARCHAR(10)      DEFAULT NULL,
  `document_status`     ENUM('incomplete','under_review','verified','rejected') NOT NULL DEFAULT 'incomplete',
  `merit_score`         DECIMAL(8,4)     DEFAULT NULL,
  `merit_rank`          INT(11)          DEFAULT NULL,
  `submitted_at`        TIMESTAMP        NULL DEFAULT NULL,
  `reviewed_by`         INT(10) UNSIGNED DEFAULT NULL,
  `reviewed_at`         TIMESTAMP        NULL DEFAULT NULL,
  `internal_notes`      TEXT             COMMENT 'Admin-only; never shown to applicant',
  `rejection_reason`    TEXT,
  `ip_address`          VARCHAR(45)      DEFAULT NULL,
  `created_at`          TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_application_number` (`application_number`),
  KEY `idx_sa_email`        (`email`),
  KEY `idx_sa_status`       (`status`),
  KEY `idx_sa_faculty_year` (`faculty_id`, `academic_year_id`),
  KEY `idx_sa_dept_intake`  (`department_id`, `intake`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `applicant_profiles` (
  `id`                      INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`                 INT(10) UNSIGNED NOT NULL COMMENT 'FK → users.id',
  `application_id`          INT(10) UNSIGNED DEFAULT NULL,
  `middle_name`             VARCHAR(100)     DEFAULT NULL,
  `id_type`                 ENUM('national_id','passport','birth_certificate') DEFAULT NULL,
  `id_number`               VARCHAR(50)      DEFAULT NULL,
  `province`                VARCHAR(100)     DEFAULT NULL,
  `district`                VARCHAR(100)     DEFAULT NULL,
  `sector`                  VARCHAR(100)     DEFAULT NULL,
  `emergency_contact_name`  VARCHAR(150)     DEFAULT NULL,
  `emergency_contact_phone` VARCHAR(30)      DEFAULT NULL,
  `profile_photo_id`        VARCHAR(100)     DEFAULT NULL,
  `created_at`              TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`              TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ap_user`        (`user_id`),
  UNIQUE KEY `uq_ap_application` (`application_id`),
  KEY `idx_ap_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `applicant_academic_records` (
  `id`                   INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `applicant_profile_id` INT(10) UNSIGNED NOT NULL COMMENT 'FK → applicant_profiles.id',
  `document_id`          INT(10) UNSIGNED DEFAULT NULL,
  `institution_name`     VARCHAR(255)     NOT NULL,
  `qualification`        VARCHAR(150)     NOT NULL,
  `grade`                VARCHAR(50)      NOT NULL,
  `combination`          VARCHAR(100)     DEFAULT NULL,
  `year_completed`       YEAR          NOT NULL,
  `is_primary`           TINYINT(1)       NOT NULL DEFAULT 0 COMMENT '1 = used for merit scoring',
  `created_at`           TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_aar_profile` (`applicant_profile_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `application_documents` (
  `id`                   INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `applicant_profile_id` INT(10) UNSIGNED DEFAULT NULL,
  `application_id`       INT(10) UNSIGNED DEFAULT NULL,
  `document_type_id`     INT(10) UNSIGNED NOT NULL,
  `file_server_id`       VARCHAR(100)     DEFAULT NULL COMMENT 'UUID from file-server service',
  `file_original_name`   VARCHAR(255)     DEFAULT NULL,
  `file_size`            INT(11)          DEFAULT NULL COMMENT 'bytes',
  `file_mime`            VARCHAR(100)     DEFAULT NULL,
  `verification_status`  ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
  `verified_by`          INT(10) UNSIGNED DEFAULT NULL,
  `verified_at`          TIMESTAMP        NULL DEFAULT NULL,
  `verification_comment` TEXT,
  `uploaded_at`          TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_app_doctype` (`application_id`, `document_type_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `application_status_log` (
  `id`             INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `application_id` INT(10) UNSIGNED NOT NULL,
  `from_status`    VARCHAR(50)      DEFAULT NULL,
  `to_status`      VARCHAR(50)      NOT NULL,
  `actor_id`       INT(10) UNSIGNED DEFAULT NULL,
  `actor_type`     ENUM('applicant','admin','system') NOT NULL DEFAULT 'system',
  `notes`          TEXT,
  `created_at`     TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_asl_application` (`application_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `admission_offers` (
  `id`                    INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `application_id`        INT(10) UNSIGNED NOT NULL,
  `offer_letter_reference`VARCHAR(50)      NOT NULL,
  `offered_at`            TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `offered_by`            INT(10) UNSIGNED DEFAULT NULL,
  `expires_at`            DATE             NOT NULL,
  `status`                ENUM('pending','accepted','declined','expired') NOT NULL DEFAULT 'pending',
  `responded_at`          TIMESTAMP        NULL DEFAULT NULL,
  `response_notes`        TEXT,
  `enrollment_initiated`  TINYINT(1)       NOT NULL DEFAULT 0,
  `student_id`            INT(10) UNSIGNED DEFAULT NULL COMMENT 'Populated after enrollment; references student.id',
  `enrolled_at`           TIMESTAMP        NULL DEFAULT NULL,
  `letter_sent_at`        DATETIME         DEFAULT NULL,
  `letter_sent_by`        INT(10) UNSIGNED DEFAULT NULL,
  `letter_token`          VARCHAR(64)      DEFAULT NULL COMMENT 'Token for applicant to download letter without login',
  `updated_at`            TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ao_application`     (`application_id`),
  UNIQUE KEY `uq_ao_offer_reference` (`offer_letter_reference`),
  UNIQUE KEY `letter_token`          (`letter_token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `manual_admissions` (
  `id`             INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `application_id` INT(10) UNSIGNED NOT NULL,
  `admitted_by`    INT(10) UNSIGNED NOT NULL,
  `reason`         TEXT,
  `notes`          TEXT,
  `admitted_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `offer_id`       INT(10) UNSIGNED DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ma_application`  (`application_id`),
  KEY `idx_ma_admitted_by`  (`admitted_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `merit_criteria` (
  `id`                    INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `department_id`         INT(10) UNSIGNED NOT NULL,
  `intake`                VARCHAR(20)      NOT NULL,
  `academic_year_id`      INT(10) UNSIGNED NOT NULL,
  `grade_weight`          DECIMAL(5,2)     NOT NULL DEFAULT 60.00,
  `combination_weight`    DECIMAL(5,2)     NOT NULL DEFAULT 30.00,
  `other_weight`          DECIMAL(5,2)     NOT NULL DEFAULT 10.00,
  `min_grade`             VARCHAR(50)      DEFAULT NULL,
  `required_combinations` TEXT             COMMENT 'JSON array of accepted A-level combinations',
  `cutoff_score`          DECIMAL(8,4)     DEFAULT NULL,
  `max_capacity`          INT(11)          DEFAULT NULL,
  `is_published`          TINYINT(1)       NOT NULL DEFAULT 0,
  `algorithm_type`        ENUM('merit_based','manual','first_come_first_served') NOT NULL DEFAULT 'merit_based',
  `algorithm_notes`       TEXT,
  `created_by`            INT(10) UNSIGNED DEFAULT NULL,
  `created_at`            TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mc_dept_intake_year` (`department_id`, `intake`, `academic_year_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `merit_lists` (
  `id`             INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `department_id`  INT(10) UNSIGNED NOT NULL,
  `intake`         VARCHAR(20)      NOT NULL,
  `academic_year_id`INT(10) UNSIGNED NOT NULL,
  `application_id` INT(10) UNSIGNED NOT NULL,
  `merit_score`    DECIMAL(8,4)     NOT NULL,
  `rank`           INT(11)          NOT NULL,
  `is_qualified`   TINYINT(1)       NOT NULL DEFAULT 0,
  `generated_at`   TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `generated_by`   INT(10) UNSIGNED DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ml_app_dept_intake` (`application_id`, `department_id`, `intake`),
  KEY `idx_ml_dept_intake`  (`department_id`, `intake`, `academic_year_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- §8  STUDENT RECORDS
-- =============================================================================

-- Primary student record (legacy wide table — data came before RBAC rollout).
CREATE TABLE IF NOT EXISTS `student` (
  `id`                INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`           INT(10) UNSIGNED DEFAULT NULL,
  `regnumber`         VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `index_file`        TEXT,
  `index_number`      VARCHAR(40)  DEFAULT NULL,
  `fname`             VARCHAR(50)  DEFAULT NULL,
  `lname`             VARCHAR(50)  DEFAULT NULL,
  `father`            VARCHAR(50)  DEFAULT NULL,
  `mother`            VARCHAR(50)  DEFAULT NULL,
  `reference`         VARCHAR(50)  DEFAULT NULL,
  `phone`             VARCHAR(50)  DEFAULT NULL,
  `email`             VARCHAR(50)  DEFAULT NULL,
  `gender`            VARCHAR(50)  DEFAULT NULL,
  `birthdate`         VARCHAR(50)  DEFAULT NULL,
  `id_card`           TEXT,
  `photo`             TEXT,
  `marital_status`    VARCHAR(50)  DEFAULT NULL,
  `spouse`            VARCHAR(50)  DEFAULT NULL,
  `disability`        VARCHAR(50)  DEFAULT NULL,
  `nationality`       VARCHAR(50)  DEFAULT NULL,
  `country`           VARCHAR(50)  DEFAULT NULL,
  `province`          VARCHAR(50)  DEFAULT NULL,
  `district`          VARCHAR(50)  DEFAULT NULL,
  `sector`            VARCHAR(100) DEFAULT NULL,
  `cell`              VARCHAR(50)  DEFAULT NULL,
  `village`           VARCHAR(50)  DEFAULT NULL,
  `last_school`       VARCHAR(1000)DEFAULT NULL,
  `combination`       VARCHAR(200) DEFAULT NULL,
  `diploma`           TEXT,
  `transcript`        TEXT,
  `program`           VARCHAR(50)  DEFAULT NULL,
  `faculty`           VARCHAR(40)  NOT NULL,
  `department`        VARCHAR(11)  DEFAULT NULL,
  `std_option`        VARCHAR(11)  DEFAULT NULL,
  `current_level`     VARCHAR(40)  DEFAULT NULL,
  `accepted_date`     VARCHAR(200) DEFAULT NULL,
  `registration_date` VARCHAR(40)  DEFAULT NULL,
  `expire_date`       VARCHAR(50)  DEFAULT NULL,
  `sponsor`           VARCHAR(50)  DEFAULT NULL,
  `campus`            VARCHAR(40)  DEFAULT NULL,
  `serial_number`     TEXT,
  `grades`            TEXT,
  `principle_pass`    TEXT,
  `A2_compl_year`     TEXT,
  `last_university`   VARCHAR(1000)NOT NULL DEFAULT 'CUR',
  `student_state`     VARCHAR(40)  NOT NULL DEFAULT 'active',
  `intake`            VARCHAR(40)  DEFAULT NULL,
  `category`          VARCHAR(40)  DEFAULT NULL,
  `admitted_by`       INT(10) UNSIGNED DEFAULT NULL,
  `school_id`         INT(10) UNSIGNED DEFAULT NULL,
  `started_at_cur`    VARCHAR(24)  DEFAULT NULL,
  `full_part_free`    TEXT,
  `acc_year`          VARCHAR(20)  NOT NULL DEFAULT '-',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_student_regnumber` (`regnumber`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `student_bursaries` (
  `id`              INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`      INT(10) UNSIGNED NOT NULL,
  `source`          ENUM('FARG','WDA_BRD','Bishop_Diocese','Private','Institutional','NGO','Other') NOT NULL,
  `sponsor_name`    VARCHAR(150)     DEFAULT NULL,
  `academic_year_id`INT(10) UNSIGNED DEFAULT NULL,
  `semester`        TINYINT(4)       DEFAULT NULL,
  `amount_covered`  DECIMAL(12,2)    NOT NULL DEFAULT 0.00,
  `coverage_type`   ENUM('Full','Partial','Tuition_Only') NOT NULL DEFAULT 'Partial',
  `contract_number` VARCHAR(80)      DEFAULT NULL,
  `notes`           VARCHAR(255)     DEFAULT NULL,
  `status`          ENUM('Active','Suspended','Ended') NOT NULL DEFAULT 'Active',
  `created_by`      INT(10) UNSIGNED NOT NULL,
  `created_at`      TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP        NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `student_gpa` (
  `id`               INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`       INT(10) UNSIGNED NOT NULL,
  `academic_year_id` INT(10) UNSIGNED NOT NULL,
  `semester`         TINYINT(4)       NOT NULL,
  `credits_attempted`SMALLINT(6)      NOT NULL DEFAULT 0,
  `credits_earned`   SMALLINT(6)      NOT NULL DEFAULT 0,
  `gpa`              DECIMAL(4,2)     NOT NULL DEFAULT 0.00,
  `cgpa`             DECIMAL(4,2)     NOT NULL DEFAULT 0.00,
  `updated_at`       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `student_ids` (
  `id`          INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`  INT(10) UNSIGNED NOT NULL,
  `issue_date`  DATE             NOT NULL,
  `expiry_date` DATE             NOT NULL,
  `barcode`     VARCHAR(60)      DEFAULT NULL,
  `is_active`   TINYINT(1)       NOT NULL DEFAULT 1,
  `created_at`  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `student_clearances` (
  `id`               INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`       VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL COMMENT 'student.regnumber',
  `academic_year_id` INT(10) UNSIGNED NOT NULL,
  `academic_term_id` INT(10) UNSIGNED NOT NULL,
  `office_type`      ENUM('library','finance','department','registrar','sports','hostel') NOT NULL,
  `status`           ENUM('pending','cleared','rejected') NOT NULL DEFAULT 'pending',
  `cleared_by`       INT(10) UNSIGNED DEFAULT NULL,
  `cleared_at`       TIMESTAMP        NULL DEFAULT NULL,
  `rejection_reason` TEXT,
  `created_at`       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_clearance` (`student_id`, `academic_year_id`, `academic_term_id`, `office_type`),
  KEY `idx_clear_student` (`student_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `transcripts` (
  `id`                INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`        INT(10) UNSIGNED NOT NULL,
  `generated_by`      INT(10) UNSIGNED DEFAULT NULL,
  `generated_at`      TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `purpose`           VARCHAR(150)     DEFAULT NULL,
  `is_official`       TINYINT(1)       NOT NULL DEFAULT 0,
  `verification_code` VARCHAR(40)      DEFAULT NULL,
  `file_path`         VARCHAR(255)     DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `graduands` (
  `id`               INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`       INT(10) UNSIGNED NOT NULL,
  `academic_year_id` INT(10) UNSIGNED DEFAULT NULL,
  `graduation_date`  DATE             DEFAULT NULL,
  `degree_class`     ENUM('First Class','Upper Second','Lower Second','Pass','Distinction') DEFAULT 'Pass',
  `cgpa`             DECIMAL(4,2)     DEFAULT NULL,
  `total_credits`    SMALLINT(6)      DEFAULT NULL,
  `ceremony_number`  VARCHAR(20)      DEFAULT NULL,
  `status`           ENUM('pending','approved','graduated','deferred') NOT NULL DEFAULT 'pending',
  `approved_by`      INT(10) UNSIGNED DEFAULT NULL,
  `approved_at`      DATETIME         DEFAULT NULL,
  `created_at`       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `grades` (
  `id`               INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`       INT(10) UNSIGNED NOT NULL,
  `course_id`        INT(10) UNSIGNED NOT NULL,
  `academic_year_id` INT(10) UNSIGNED NOT NULL,
  `semester`         TINYINT(4)       NOT NULL,
  `marks`            DECIMAL(5,2)     NOT NULL DEFAULT 0.00,
  `grade_id`         INT(10) UNSIGNED DEFAULT NULL,
  `recorded_by`      INT(10) UNSIGNED DEFAULT NULL,
  `created_at`       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `deliberations` (
  `id`               INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `academic_year_id` INT(10) UNSIGNED NOT NULL,
  `semester`         TINYINT(4)       NOT NULL,
  `program_id`       INT(10) UNSIGNED DEFAULT NULL,
  `convened_at`      DATE             DEFAULT NULL,
  `notes`            TEXT,
  `finalized`        TINYINT(1)       NOT NULL DEFAULT 0,
  `created_by`       INT(10) UNSIGNED DEFAULT NULL,
  `created_at`       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `exam_sessions` (
  `id`               INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `academic_year_id` INT(10) UNSIGNED NOT NULL,
  `semester`         TINYINT(4)       NOT NULL,
  `label`            VARCHAR(60)      DEFAULT NULL,
  `start_date`       DATE             DEFAULT NULL,
  `end_date`         DATE             DEFAULT NULL,
  `is_active`        TINYINT(1)       NOT NULL DEFAULT 1,
  `created_at`       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `revaluations` (
  `id`          INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`  INT(10) UNSIGNED NOT NULL,
  `module_id`   INT(10) UNSIGNED NOT NULL,
  `reason`      TEXT,
  `status`      ENUM('pending','approved','rejected','completed') NOT NULL DEFAULT 'pending',
  `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `visa_to_whom` (
  `id`             INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `student`        VARCHAR(250) NOT NULL,
  `acc_year`       VARCHAR(20)  NOT NULL,
  `created_by`     INT(10) UNSIGNED NOT NULL,
  `date_generated` DATE         NOT NULL,
  `duplicate`      INT(11)      NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `gate_logs` (
  `id`          INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`  INT(10) UNSIGNED DEFAULT NULL,
  `staff_id`    INT(10) UNSIGNED DEFAULT NULL,
  `scan_type`   ENUM('student_id','receipt','registration') NOT NULL,
  `barcode`     VARCHAR(80)      DEFAULT NULL,
  `gate`        VARCHAR(40)      NOT NULL DEFAULT 'Main Gate',
  `result`      ENUM('granted','denied') NOT NULL,
  `reason`      VARCHAR(200)     DEFAULT NULL,
  `verified_by` INT(10) UNSIGNED DEFAULT NULL,
  `created_at`  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- §9  HR & PAYROLL
-- =============================================================================

CREATE TABLE IF NOT EXISTS `leave_types` (
  `id`          INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(80)      NOT NULL,
  `description` TEXT             DEFAULT NULL,
  `days_allowed`INT(11)          NOT NULL DEFAULT 21,
  `is_paid`     TINYINT(1)       NOT NULL DEFAULT 1,
  `color`       VARCHAR(30)      NOT NULL DEFAULT '#4FB4FF',
  `is_active`   TINYINT(1)       NOT NULL DEFAULT 1,
  `updated_at`  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `leave_requests` (
  `id`             INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id`    INT(10) UNSIGNED DEFAULT NULL COMMENT 'FK → employees.employee_id',
  `staff_id`       INT(10) UNSIGNED DEFAULT NULL COMMENT 'Legacy FK → staff.id (kept for backward compat)',
  `leave_type_id`  INT(10) UNSIGNED NOT NULL,
  `start_date`     DATE             NOT NULL,
  `end_date`       DATE             NOT NULL,
  `days_requested` DECIMAL(5,1)     NOT NULL DEFAULT 0,
  `reason`         TEXT,
  `status`         ENUM('Pending','Approved','Rejected','Cancelled') NOT NULL DEFAULT 'Pending',
  `approved_by`    INT(10) UNSIGNED DEFAULT NULL,
  `approved_at`    DATETIME         DEFAULT NULL,
  `notes`          TEXT,
  `review_comment` TEXT,
  `reviewed_by`    INT(10) UNSIGNED DEFAULT NULL,
  `reviewed_at`    DATETIME         DEFAULT NULL,
  `created_at`     TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `leave_balances` (
  `id`            INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id`   INT(10) UNSIGNED NOT NULL,
  `leave_type_id` INT(10) UNSIGNED NOT NULL,
  `year`          YEAR          NOT NULL,
  `total_days`    DECIMAL(5,1)     NOT NULL DEFAULT 0,
  `used_days`     DECIMAL(5,1)     NOT NULL DEFAULT 0,
  `created_at`    TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_lb_emp_type_year` (`employee_id`, `leave_type_id`, `year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `hr_payroll` (
  `id`                  INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `emp_id`              INT(10) UNSIGNED NOT NULL,
  `pay_month`           VARCHAR(20)  NOT NULL COMMENT 'Human label e.g. "April 2025"',
  `period_year`         SMALLINT(4)  NOT NULL DEFAULT 0,
  `period_month`        TINYINT(2)   NOT NULL DEFAULT 0 COMMENT '1 = January … 12 = December',
  `basic_salary`        DECIMAL(15,2)NOT NULL DEFAULT 0.00,
  `housing_allowance`   DECIMAL(15,2)NOT NULL DEFAULT 0.00,
  `transport_allowance` DECIMAL(15,2)NOT NULL DEFAULT 0.00,
  `other_allowances`    DECIMAL(15,2)NOT NULL DEFAULT 0.00,
  `gross`               DECIMAL(15,2)NOT NULL DEFAULT 0.00,
  `pension`             DECIMAL(12,2)NOT NULL DEFAULT 0.00,
  `rama`                DECIMAL(12,2)NOT NULL DEFAULT 0.00,
  `maternity`           DECIMAL(12,2)         DEFAULT 0.00,
  `cbhi`                DECIMAL(12,2)         DEFAULT 0.00,
  `tax`                 DECIMAL(12,2)NOT NULL DEFAULT 0.00,
  `net`                 DECIMAL(12,2)NOT NULL DEFAULT 0.00,
  `employer_pension`    DECIMAL(12,2)         DEFAULT 0.00,
  `employer_maternity`  DECIMAL(12,2)         DEFAULT 0.00,
  `employer_cbhi`       DECIMAL(12,2)         DEFAULT 0.00,
  `gross_cost`          DECIMAL(12,2)         DEFAULT 0.00,
  `status`              ENUM('Pending','Approved','Paid') NOT NULL DEFAULT 'Pending',
  `created_at`          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_payroll_emp_period` (`emp_id`, `period_year`, `period_month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `hr_custom_deductions` (
  `id`            INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `label`         VARCHAR(100)     NOT NULL,
  `description`   VARCHAR(255)     DEFAULT NULL,
  `employee_rate` DECIMAL(6,3)     NOT NULL DEFAULT 0.000,
  `employer_rate` DECIMAL(6,3)     NOT NULL DEFAULT 0.000,
  `is_active`     TINYINT(1)       NOT NULL DEFAULT 1,
  `sort_order`    INT(11)          NOT NULL DEFAULT 0,
  `created_at`    TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `payroll_config` (
  `id`           INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `config_key`   VARCHAR(100)     NOT NULL,
  `config_value` VARCHAR(255)     NOT NULL DEFAULT '0',
  `updated_at`   TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_config_key` (`config_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `salary_payments` (
  `id`             INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `payroll_id`     INT(10) UNSIGNED NOT NULL,
  `emp_id`         INT(10) UNSIGNED NOT NULL,
  `period_year`    SMALLINT(6)      NOT NULL,
  `period_month`   TINYINT(4)       NOT NULL,
  `amount`         DECIMAL(14,2)    NOT NULL,
  `payment_method` ENUM('Bank Transfer','Cash','MoMo','Cheque') NOT NULL DEFAULT 'Bank Transfer',
  `bank_name`      VARCHAR(150)     DEFAULT NULL,
  `account_number` VARCHAR(60)      DEFAULT NULL,
  `reference`      VARCHAR(120)     DEFAULT NULL,
  `notes`          TEXT,
  `paid_by_user_id`INT(10) UNSIGNED DEFAULT NULL,
  `paid_at`        DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status`         ENUM('Processed','Cancelled') NOT NULL DEFAULT 'Processed',
  `created_at`     TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sp_emp_period` (`emp_id`, `period_year`, `period_month`),
  KEY `idx_sp_payroll`    (`payroll_id`),
  KEY `idx_sp_status`     (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Legacy payroll (staff-based, replaced by hr_payroll for employees)
CREATE TABLE IF NOT EXISTS `payroll` (
  `id`              INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `staff_id`        INT(10) UNSIGNED NOT NULL,
  `month`           TINYINT(4)       NOT NULL,
  `year`            YEAR          NOT NULL,
  `basic_salary`    DECIMAL(12,2)    NOT NULL DEFAULT 0.00,
  `allowances`      DECIMAL(12,2)    NOT NULL DEFAULT 0.00,
  `deductions`      DECIMAL(12,2)    NOT NULL DEFAULT 0.00,
  `net_salary`      DECIMAL(12,2)    NOT NULL DEFAULT 0.00,
  `tax`             DECIMAL(12,2)    NOT NULL DEFAULT 0.00,
  `pension`         DECIMAL(12,2)    NOT NULL DEFAULT 0.00,
  `rssb_pension`    DECIMAL(15,2)    NOT NULL DEFAULT 0.00,
  `rssb_maternity`  DECIMAL(15,2)    NOT NULL DEFAULT 0.00,
  `payment_date`    DATE             DEFAULT NULL,
  `status`          ENUM('draft','approved','paid') NOT NULL DEFAULT 'draft',
  `processed_by`    INT(10) UNSIGNED DEFAULT NULL,
  `created_at`      TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `hr_leaves` (
  `id`          INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `emp_id`      INT(10) UNSIGNED NOT NULL,
  `leave_type`  ENUM('Annual Leave','Sick Leave','Maternity Leave','Permission','Compassionate') NOT NULL,
  `start_date`  DATE         NOT NULL,
  `end_date`    DATE         NOT NULL,
  `days`        INT(5)       NOT NULL DEFAULT 1,
  `reason`      TEXT,
  `approved_by` VARCHAR(80)  DEFAULT NULL,
  `status`      ENUM('Pending','Approved','Rejected') NOT NULL DEFAULT 'Pending',
  `created_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `hr_certificates` (
  `id`          INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `emp_id`      INT(10) UNSIGNED NOT NULL,
  `cert_type`   ENUM('Salary Certificate','Service Certificate','Employment Confirmation','Experience Letter') NOT NULL,
  `purpose`     VARCHAR(120) DEFAULT NULL,
  `issued_date` DATE         DEFAULT NULL,
  `issued_by`   VARCHAR(80)  DEFAULT NULL,
  `status`      ENUM('Pending','Issued') NOT NULL DEFAULT 'Pending',
  `created_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `hr_contracts` (
  `id`            INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `emp_id`        INT(10) UNSIGNED NOT NULL,
  `contract_type` ENUM('Temporal','Part-time') NOT NULL DEFAULT 'Temporal',
  `start_date`    DATE      NOT NULL,
  `end_date`      DATE      NOT NULL,
  `notes`         TEXT,
  `status`        ENUM('Active','Expired','Renewed') NOT NULL DEFAULT 'Active',
  `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- §10  FINANCE
-- =============================================================================

CREATE TABLE IF NOT EXISTS `fee_structures` (
  `id`               INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `academic_year_id` INT(10) UNSIGNED NOT NULL,
  `department_id`    INT(10) UNSIGNED DEFAULT NULL,
  `level_id`         INT(10) UNSIGNED DEFAULT NULL,
  `fee_type`         ENUM('TUITION','REGISTRATION','ADMISSION','HOSTEL','ACADEMIC_DOCUMENT','FINE','REPEAT_MODULE') NOT NULL,
  `label`            VARCHAR(120)     NOT NULL,
  `amount`           DECIMAL(12,2)    NOT NULL,
  `semester`         TINYINT(3) UNSIGNED DEFAULT NULL,
  `is_active`        TINYINT(1)       NOT NULL DEFAULT 1,
  `created_by`       INT(10) UNSIGNED NOT NULL,
  `created_at`       DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_fs_year_dept_level` (`academic_year_id`, `department_id`, `level_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `fee_invoices` (
  `id`                 INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `invoice_number`     VARCHAR(30)      NOT NULL,
  `student_id`         VARCHAR(32)      NOT NULL COMMENT 'student.regnumber',
  `fee_structure_id`   INT(10) UNSIGNED DEFAULT NULL,
  `academic_year_id`   INT(10) UNSIGNED NOT NULL,
  `semester`           TINYINT(3) UNSIGNED DEFAULT NULL,
  `fee_type`           ENUM('TUITION','REGISTRATION','ADMISSION','HOSTEL','ACADEMIC_DOCUMENT','FINE','REPEAT_MODULE','ARREARS','BURSARY_CREDIT') NOT NULL,
  `description`        VARCHAR(200)     NOT NULL,
  `amount_due`         DECIMAL(12,2)    NOT NULL,
  `amount_paid`        DECIMAL(12,2)    NOT NULL DEFAULT 0.00,
  `bursary_applied`    DECIMAL(12,2)    NOT NULL DEFAULT 0.00,
  `due_date`           DATE             DEFAULT NULL,
  `status`             ENUM('unpaid','partial','paid','overdue','waived') NOT NULL DEFAULT 'unpaid',
  `is_system_generated`TINYINT(1)       NOT NULL DEFAULT 0,
  `module_id`          INT(10) UNSIGNED DEFAULT NULL,
  `created_by`         INT(10) UNSIGNED NOT NULL,
  `created_at`         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_invoice_number` (`invoice_number`),
  KEY `idx_fi_student_year` (`student_id`, `academic_year_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `fee_payments` (
  `id`                 INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `invoice_id`         INT(10) UNSIGNED NOT NULL,
  `student_id`         VARCHAR(32)      NOT NULL,
  `amount`             DECIMAL(12,2)    NOT NULL,
  `payment_method`     ENUM('CASH','BANK_TRANSFER','MOBILE_MONEY','BURSARY','WAIVER') NOT NULL,
  `payment_sub_method` VARCHAR(30)      DEFAULT NULL COMMENT 'e.g. BK, MTN_MOMO, AIRTEL_MONEY',
  `reference_number`   VARCHAR(80)      DEFAULT NULL,
  `bank_slip_file_id`  VARCHAR(36)      DEFAULT NULL,
  `receipt_number`     VARCHAR(30)      NOT NULL,
  `status`             ENUM('pending','confirmed','rejected') NOT NULL DEFAULT 'confirmed',
  `notes`              TEXT,
  `recorded_by`        INT(10) UNSIGNED NOT NULL,
  `paid_at`            DATETIME         NOT NULL,
  `confirmed_by`       INT(10) UNSIGNED DEFAULT NULL,
  `confirmed_at`       DATETIME         DEFAULT NULL,
  `rejection_reason`   TEXT,
  `created_at`         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_receipt_number` (`receipt_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `fee_bursaries` (
  `id`               INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`       VARCHAR(32)      NOT NULL,
  `academic_year_id` INT(10) UNSIGNED NOT NULL,
  `bursary_type`     VARCHAR(80)      NOT NULL,
  `amount`           DECIMAL(12,2)    NOT NULL,
  `coverage_pct`     DECIMAL(5,2)     DEFAULT NULL,
  `approved_by`      INT(10) UNSIGNED NOT NULL,
  `notes`            TEXT,
  `status`           ENUM('pending','confirmed','cancelled') NOT NULL DEFAULT 'pending',
  `confirmed_at`     DATETIME         DEFAULT NULL,
  `confirmed_by`     INT(10) UNSIGNED DEFAULT NULL,
  `created_at`       DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_fb_student_year` (`student_id`, `academic_year_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `fee_waivers` (
  `id`               INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`       INT(10) UNSIGNED NOT NULL,
  `invoice_id`       INT(10) UNSIGNED NOT NULL,
  `amount_waived`    DECIMAL(12,2)    NOT NULL,
  `reason`           TEXT             NOT NULL,
  `waiver_type`      ENUM('hardship','merit','error_correction','scholarship','other') NOT NULL DEFAULT 'other',
  `status`           ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `requested_by`     INT(10) UNSIGNED DEFAULT NULL,
  `authorized_by`    INT(10) UNSIGNED DEFAULT NULL,
  `authorized_at`    DATETIME         DEFAULT NULL,
  `rejection_reason` TEXT,
  `reference_number` VARCHAR(60)      DEFAULT NULL,
  `notes`            TEXT,
  `created_at`       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_waiver_student` (`student_id`),
  KEY `idx_waiver_invoice` (`invoice_id`),
  KEY `idx_waiver_status`  (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `fee_payment_plans` (
  `id`               INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`       INT(10) UNSIGNED NOT NULL,
  `invoice_id`       INT(10) UNSIGNED DEFAULT NULL,
  `academic_year_id` INT(10) UNSIGNED DEFAULT NULL,
  `plan_name`        VARCHAR(120)     NOT NULL,
  `total_amount`     DECIMAL(12,2)    NOT NULL,
  `num_installments` TINYINT(3) UNSIGNED NOT NULL DEFAULT 2,
  `status`           ENUM('active','completed','cancelled') NOT NULL DEFAULT 'active',
  `notes`            TEXT,
  `created_by`       INT(10) UNSIGNED DEFAULT NULL,
  `created_at`       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pplan_student` (`student_id`),
  KEY `idx_pplan_invoice` (`invoice_id`),
  KEY `idx_pplan_ay`      (`academic_year_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `fee_installments` (
  `id`                 INT(10) UNSIGNED    NOT NULL AUTO_INCREMENT,
  `plan_id`            INT(10) UNSIGNED    NOT NULL,
  `installment_number` TINYINT(3) UNSIGNED NOT NULL,
  `amount_due`         DECIMAL(12,2)       NOT NULL,
  `amount_paid`        DECIMAL(12,2)       NOT NULL DEFAULT 0.00,
  `due_date`           DATE                NOT NULL,
  `paid_date`          DATE                DEFAULT NULL,
  `payment_id`         INT(10) UNSIGNED    DEFAULT NULL,
  `status`             ENUM('pending','partial','paid','overdue') NOT NULL DEFAULT 'pending',
  `notes`              TEXT,
  `created_at`         TIMESTAMP           NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_inst_plan`   (`plan_id`),
  KEY `idx_inst_due`    (`due_date`),
  KEY `idx_inst_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `fee_refunds` (
  `id`                  INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`          INT(10) UNSIGNED NOT NULL,
  `original_payment_id` INT(10) UNSIGNED NOT NULL,
  `invoice_id`          INT(10) UNSIGNED DEFAULT NULL,
  `refund_amount`        DECIMAL(12,2)    NOT NULL,
  `reason`              ENUM('overpayment','withdrawal','program_change','error','other') NOT NULL DEFAULT 'overpayment',
  `reason_notes`        TEXT,
  `refund_method`       ENUM('cash','bank_transfer','mobile_money','cheque') NOT NULL DEFAULT 'bank_transfer',
  `refund_reference`    VARCHAR(100)     DEFAULT NULL,
  `status`              ENUM('pending','approved','disbursed','rejected') NOT NULL DEFAULT 'pending',
  `requested_by`        INT(10) UNSIGNED DEFAULT NULL,
  `approved_by`         INT(10) UNSIGNED DEFAULT NULL,
  `approved_at`         DATETIME         DEFAULT NULL,
  `disbursed_by`        INT(10) UNSIGNED DEFAULT NULL,
  `disbursed_at`        DATETIME         DEFAULT NULL,
  `rejection_reason`    TEXT,
  `reference_number`    VARCHAR(60)      DEFAULT NULL,
  `created_at`          TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_refund_student` (`student_id`),
  KEY `idx_refund_payment` (`original_payment_id`),
  KEY `idx_refund_status`  (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `fee_clearance_certificates` (
  `id`                INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`        INT(10) UNSIGNED NOT NULL,
  `academic_year_id`  INT(10) UNSIGNED DEFAULT NULL,
  `certificate_number`VARCHAR(60)      NOT NULL,
  `balance_at_issue`  DECIMAL(12,2)    NOT NULL DEFAULT 0.00,
  `issued_by`         INT(10) UNSIGNED DEFAULT NULL,
  `issued_at`         TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `is_valid`          TINYINT(1)       NOT NULL DEFAULT 1,
  `invalidated_reason`VARCHAR(255)     DEFAULT NULL,
  `notes`             TEXT,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_cert_number` (`certificate_number`),
  KEY `idx_cert_student` (`student_id`),
  KEY `idx_cert_ay`      (`academic_year_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `expense_categories` (
  `id`          INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(80)      NOT NULL,
  `description` VARCHAR(255)     DEFAULT NULL,
  `created_at`  DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_expense_cat_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `expenses` (
  `id`               INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `category_id`      INT(10) UNSIGNED NOT NULL,
  `academic_year_id` INT(10) UNSIGNED DEFAULT NULL,
  `title`            VARCHAR(150)     NOT NULL,
  `description`      TEXT,
  `amount`           DECIMAL(12,2)    NOT NULL,
  `payment_date`     DATE             NOT NULL,
  `payment_method`   VARCHAR(30)      NOT NULL DEFAULT 'BANK_TRANSFER',
  `reference_number` VARCHAR(80)      DEFAULT NULL,
  `vendor`           VARCHAR(120)     DEFAULT NULL,
  `receipt_file_id`  VARCHAR(36)      DEFAULT NULL,
  `recorded_by`      INT(10) UNSIGNED NOT NULL,
  `created_at`       DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_exp_category` (`category_id`),
  KEY `idx_exp_year`     (`academic_year_id`),
  KEY `idx_exp_date`     (`payment_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `expense_budgets` (
  `id`               INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `academic_year_id` INT(10) UNSIGNED NOT NULL,
  `category_id`      INT(10) UNSIGNED NOT NULL,
  `amount`           DECIMAL(15,2)    NOT NULL DEFAULT 0.00,
  `notes`            TEXT,
  `created_by`       INT(10) UNSIGNED NOT NULL,
  `created_at`       DATETIME         DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME         DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_budget_year_cat` (`academic_year_id`, `category_id`),
  KEY `category_id` (`category_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `finance_budgets` (
  `id`               INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `academic_year_id` INT(10) UNSIGNED NOT NULL,
  `category`         VARCHAR(100)     NOT NULL,
  `budget_type`      ENUM('Revenue','Expense') NOT NULL DEFAULT 'Expense',
  `budgeted_amount`  DECIMAL(14,2)    NOT NULL DEFAULT 0.00,
  `notes`            TEXT,
  `created_by`       INT(10) UNSIGNED NOT NULL,
  `created_at`       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP        NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `budget_unique` (`academic_year_id`, `category`, `budget_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `finance_expenses` (
  `id`               INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `academic_year_id` INT(10) UNSIGNED DEFAULT NULL,
  `category`         ENUM('Utilities','Stationery','Maintenance','Capex','Events','Transport','Other') NOT NULL,
  `description`      VARCHAR(255)     NOT NULL,
  `amount`           DECIMAL(12,2)    NOT NULL,
  `expense_date`     DATE             NOT NULL,
  `paid_to`          VARCHAR(150)     DEFAULT NULL,
  `payment_method`   ENUM('cash','bank_transfer','cheque','mobile_money') NOT NULL DEFAULT 'cash',
  `reference`        VARCHAR(100)     DEFAULT NULL,
  `created_by`       INT(10) UNSIGNED NOT NULL,
  `created_at`       TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- §11  COMMUNICATION
-- =============================================================================

CREATE TABLE IF NOT EXISTS `announcements` (
  `id`         INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `title`      VARCHAR(200)     NOT NULL,
  `body`       TEXT             NOT NULL,
  `audience`   ENUM('all','students','staff','faculty','admin') NOT NULL DEFAULT 'all',
  `priority`   ENUM('normal','urgent') NOT NULL DEFAULT 'normal',
  `posted_by`  INT(10) UNSIGNED DEFAULT NULL,
  `expires_at` DATE             DEFAULT NULL,
  `is_active`  TINYINT(1)       NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `notifications` (
  `id`         INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    INT(10) UNSIGNED NOT NULL,
  `type`       VARCHAR(60)      DEFAULT NULL,
  `message`    VARCHAR(255)     NOT NULL,
  `link`       VARCHAR(255)     DEFAULT NULL,
  `is_read`    TINYINT(1)       NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notif_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `messages` (
  `id`          INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `sender_id`   INT(10) UNSIGNED NOT NULL,
  `receiver_id` INT(10) UNSIGNED NOT NULL,
  `subject`     VARCHAR(200)     DEFAULT NULL,
  `body`        TEXT             NOT NULL,
  `is_read`     TINYINT(1)       NOT NULL DEFAULT 0,
  `read_at`     DATETIME         DEFAULT NULL,
  `created_at`  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_msg_receiver` (`receiver_id`),
  KEY `idx_msg_sender`   (`sender_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- §12  LEGACY / ARCHIVAL
-- =============================================================================

CREATE TABLE IF NOT EXISTS `legacy_application` (
  `id`                INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `fname`             VARCHAR(255) DEFAULT NULL,
  `lname`             VARCHAR(255) DEFAULT NULL,
  `father`            VARCHAR(250) DEFAULT NULL,
  `mother`            VARCHAR(250) DEFAULT NULL,
  `reference`         VARCHAR(50)  DEFAULT NULL,
  `email`             TEXT,
  `phone`             VARCHAR(50)  DEFAULT NULL,
  `gender`            VARCHAR(50)  DEFAULT NULL,
  `birthdate`         VARCHAR(50)  DEFAULT NULL,
  `id_card`           VARCHAR(250) DEFAULT NULL,
  `marital_status`    VARCHAR(50)  DEFAULT NULL,
  `spouse`            VARCHAR(50)  DEFAULT NULL,
  `church`            VARCHAR(50)  DEFAULT NULL,
  `disability`        VARCHAR(50)  DEFAULT NULL,
  `nationality`       VARCHAR(50)  DEFAULT NULL,
  `country`           VARCHAR(50)  DEFAULT NULL,
  `province`          VARCHAR(50)  DEFAULT NULL,
  `district`          VARCHAR(50)  DEFAULT NULL,
  `sector`            VARCHAR(50)  DEFAULT NULL,
  `cell`              VARCHAR(50)  DEFAULT NULL,
  `village`           VARCHAR(50)  DEFAULT NULL,
  `last_school`       TEXT,
  `last_university`   VARCHAR(50)  DEFAULT NULL,
  `combination`       TEXT,
  `A2_compl_year`     TEXT,
  `principle_pass`    TEXT,
  `grades`            TEXT,
  `serial_number`     TEXT,
  `last_class`        TEXT,
  `diploma`           TEXT,
  `transcript`        VARCHAR(255) DEFAULT NULL,
  `program`           VARCHAR(255) DEFAULT NULL,
  `applied_department`VARCHAR(255) DEFAULT NULL,
  `applied_level`     VARCHAR(50)  DEFAULT NULL,
  `password`          VARCHAR(255) DEFAULT NULL,
  `apply_date`        DATE         DEFAULT NULL,
  `year`              VARCHAR(50)  DEFAULT NULL,
  `photo`             VARCHAR(255) DEFAULT NULL,
  `pay_transaction_id`TEXT,
  `application_slip`  TEXT,
  `campus`            VARCHAR(40)  DEFAULT NULL,
  `intake`            VARCHAR(50)  DEFAULT NULL,
  `status`            VARCHAR(50)  NOT NULL,
  `given_dep_status`  INT(11)      NOT NULL DEFAULT 0,
  `appeal_app_status` INT(11)      NOT NULL DEFAULT 0,
  `accepted_date`     VARCHAR(50)  DEFAULT NULL,
  `url`               VARCHAR(50)  DEFAULT NULL,
  `received_by`       INT(10) UNSIGNED DEFAULT NULL,
  `dep_options`       TEXT,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `legacy_application_documents` (
  `id`                  INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `application_id`      INT(10) UNSIGNED NOT NULL,
  `document_type`       ENUM('National ID/Passport','High School Certificate','Passport Photo','Other') NOT NULL,
  `file_path`           VARCHAR(255)     NOT NULL,
  `verification_status` ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
  `uploaded_at`         TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `legacy_application_options` (
  `id`             INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `application_id` INT(10) UNSIGNED DEFAULT NULL,
  `option_id`      INT(10) UNSIGNED DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- INDEX GUARDS
-- Ensure referenced columns are indexed when the table already
-- existed (CREATE TABLE IF NOT EXISTS skips our PK definition).
-- ADD INDEX IF NOT EXISTS is a no-op when the index already exists.
-- ============================================================

ALTER TABLE `modules`      ADD INDEX IF NOT EXISTS `idx_fk_module_id` (`module_id`);
ALTER TABLE `departements` ADD INDEX IF NOT EXISTS `idx_fk_dep_id`    (`dep_id`);
ALTER TABLE `student`      ADD INDEX IF NOT EXISTS `idx_fk_regnumber` (`regnumber`(191));
ALTER TABLE `rooms`        ADD INDEX IF NOT EXISTS `idx_fk_rooms_id`  (`id`);

-- ============================================================
-- FOREIGN KEY CONSTRAINTS
-- Added after all tables are created to avoid ordering issues
-- ============================================================

ALTER TABLE `permissions` DROP FOREIGN KEY IF EXISTS `fk_permission_categories`;
ALTER TABLE `permissions` ADD CONSTRAINT `fk_permission_categories` FOREIGN KEY (`category_id`) REFERENCES `permission_categories` (`id`) ON DELETE CASCADE;
ALTER TABLE `users` DROP FOREIGN KEY IF EXISTS `fk_users_roles`;
ALTER TABLE `users` ADD CONSTRAINT `fk_users_roles` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`);
ALTER TABLE `role_permissions` DROP FOREIGN KEY IF EXISTS `fk_role_permissions_permission`;
ALTER TABLE `role_permissions` ADD CONSTRAINT `fk_role_permissions_permission` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE;
ALTER TABLE `role_permissions` DROP FOREIGN KEY IF EXISTS `fk_role_permissions_role`;
ALTER TABLE `role_permissions` ADD CONSTRAINT `fk_role_permissions_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE;
ALTER TABLE `academic_terms` DROP FOREIGN KEY IF EXISTS `fk_at_year`;
ALTER TABLE `academic_terms` ADD CONSTRAINT `fk_at_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`) ON DELETE CASCADE;
ALTER TABLE `module_prerequisites` DROP FOREIGN KEY IF EXISTS `fk_prereq_module`;
ALTER TABLE `module_prerequisites` ADD CONSTRAINT `fk_prereq_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE;
ALTER TABLE `module_prerequisites` DROP FOREIGN KEY IF EXISTS `fk_prereq_required`;
ALTER TABLE `module_prerequisites` ADD CONSTRAINT `fk_prereq_required` FOREIGN KEY (`prerequisite_module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE;
ALTER TABLE `module_assignments` DROP FOREIGN KEY IF EXISTS `fk_asgn_module`;
ALTER TABLE `module_assignments` ADD CONSTRAINT `fk_asgn_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE;
ALTER TABLE `module_assignments` DROP FOREIGN KEY IF EXISTS `fk_asgn_year`;
ALTER TABLE `module_assignments` ADD CONSTRAINT `fk_asgn_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`) ON DELETE CASCADE;
ALTER TABLE `module_assignments` DROP FOREIGN KEY IF EXISTS `fk_asgn_term`;
ALTER TABLE `module_assignments` ADD CONSTRAINT `fk_asgn_term` FOREIGN KEY (`academic_term_id`) REFERENCES `academic_terms` (`id`) ON DELETE CASCADE;
ALTER TABLE `module_schedules` DROP FOREIGN KEY IF EXISTS `fk_sched_module`;
ALTER TABLE `module_schedules` ADD CONSTRAINT `fk_sched_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE;
ALTER TABLE `module_schedules` DROP FOREIGN KEY IF EXISTS `fk_sched_asgn`;
ALTER TABLE `module_schedules` ADD CONSTRAINT `fk_sched_asgn` FOREIGN KEY (`module_assignment_id`) REFERENCES `module_assignments` (`id`) ON DELETE SET NULL;
ALTER TABLE `module_schedules` DROP FOREIGN KEY IF EXISTS `fk_sched_room`;
ALTER TABLE `module_schedules` ADD CONSTRAINT `fk_sched_room` FOREIGN KEY (`room_id`) REFERENCES `rooms` (`id`);
ALTER TABLE `module_schedules` DROP FOREIGN KEY IF EXISTS `fk_sched_term`;
ALTER TABLE `module_schedules` ADD CONSTRAINT `fk_sched_term` FOREIGN KEY (`academic_term_id`) REFERENCES `academic_terms` (`id`) ON DELETE CASCADE;
ALTER TABLE `module_registrations` DROP FOREIGN KEY IF EXISTS `fk_reg_module`;
ALTER TABLE `module_registrations` ADD CONSTRAINT `fk_reg_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE;
ALTER TABLE `module_registrations` DROP FOREIGN KEY IF EXISTS `fk_reg_term`;
ALTER TABLE `module_registrations` ADD CONSTRAINT `fk_reg_term` FOREIGN KEY (`academic_term_id`) REFERENCES `academic_terms` (`id`) ON DELETE CASCADE;
ALTER TABLE `module_marks` DROP FOREIGN KEY IF EXISTS `fk_marks_module`;
ALTER TABLE `module_marks` ADD CONSTRAINT `fk_marks_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE;
ALTER TABLE `module_marks` DROP FOREIGN KEY IF EXISTS `fk_marks_term`;
ALTER TABLE `module_marks` ADD CONSTRAINT `fk_marks_term` FOREIGN KEY (`academic_term_id`) REFERENCES `academic_terms` (`id`) ON DELETE CASCADE;
ALTER TABLE `attendance_sessions` DROP FOREIGN KEY IF EXISTS `fk_sess_module`;
ALTER TABLE `attendance_sessions` ADD CONSTRAINT `fk_sess_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE;
ALTER TABLE `attendance_sessions` DROP FOREIGN KEY IF EXISTS `fk_sess_schedule`;
ALTER TABLE `attendance_sessions` ADD CONSTRAINT `fk_sess_schedule` FOREIGN KEY (`module_schedule_id`) REFERENCES `module_schedules` (`id`) ON DELETE SET NULL;
ALTER TABLE `attendance_sessions` DROP FOREIGN KEY IF EXISTS `fk_sess_term`;
ALTER TABLE `attendance_sessions` ADD CONSTRAINT `fk_sess_term` FOREIGN KEY (`academic_term_id`) REFERENCES `academic_terms` (`id`) ON DELETE CASCADE;
ALTER TABLE `attendance_sessions` DROP FOREIGN KEY IF EXISTS `fk_sess_user`;
ALTER TABLE `attendance_sessions` ADD CONSTRAINT `fk_sess_user` FOREIGN KEY (`started_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;
ALTER TABLE `attendance_records` DROP FOREIGN KEY IF EXISTS `fk_rec_session`;
ALTER TABLE `attendance_records` ADD CONSTRAINT `fk_rec_session` FOREIGN KEY (`session_id`) REFERENCES `attendance_sessions` (`id`) ON DELETE CASCADE;
ALTER TABLE `attendance_records` DROP FOREIGN KEY IF EXISTS `fk_rec_user`;
ALTER TABLE `attendance_records` ADD CONSTRAINT `fk_rec_user` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;
ALTER TABLE `admission_requirements` DROP FOREIGN KEY IF EXISTS `fk_ar_academic_year`;
ALTER TABLE `admission_requirements` ADD CONSTRAINT `fk_ar_academic_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`);
ALTER TABLE `admission_requirements` DROP FOREIGN KEY IF EXISTS `fk_ar_document_type`;
ALTER TABLE `admission_requirements` ADD CONSTRAINT `fk_ar_document_type` FOREIGN KEY (`document_type_id`) REFERENCES `document_types` (`id`);
ALTER TABLE `admission_requirements` DROP FOREIGN KEY IF EXISTS `fk_ar_created_by`;
ALTER TABLE `admission_requirements` ADD CONSTRAINT `fk_ar_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;
ALTER TABLE `student_applications` DROP FOREIGN KEY IF EXISTS `fk_sa_acad_year`;
ALTER TABLE `student_applications` ADD CONSTRAINT `fk_sa_acad_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`);
ALTER TABLE `student_applications` DROP FOREIGN KEY IF EXISTS `fk_sa_dept`;
ALTER TABLE `student_applications` ADD CONSTRAINT `fk_sa_dept` FOREIGN KEY (`department_id`) REFERENCES `departements` (`dep_id`);
ALTER TABLE `student_applications` DROP FOREIGN KEY IF EXISTS `fk_sa_reviewer`;
ALTER TABLE `student_applications` ADD CONSTRAINT `fk_sa_reviewer` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;
ALTER TABLE `applicant_profiles` DROP FOREIGN KEY IF EXISTS `fk_ap_user`;
ALTER TABLE `applicant_profiles` ADD CONSTRAINT `fk_ap_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;
ALTER TABLE `applicant_profiles` DROP FOREIGN KEY IF EXISTS `fk_ap_application`;
ALTER TABLE `applicant_profiles` ADD CONSTRAINT `fk_ap_application` FOREIGN KEY (`application_id`) REFERENCES `student_applications` (`id`) ON DELETE CASCADE;
ALTER TABLE `applicant_academic_records` DROP FOREIGN KEY IF EXISTS `fk_aar_profile`;
ALTER TABLE `applicant_academic_records` ADD CONSTRAINT `fk_aar_profile` FOREIGN KEY (`applicant_profile_id`) REFERENCES `applicant_profiles` (`id`) ON DELETE CASCADE;
ALTER TABLE `application_documents` DROP FOREIGN KEY IF EXISTS `fk_ad_application`;
ALTER TABLE `application_documents` ADD CONSTRAINT `fk_ad_application` FOREIGN KEY (`application_id`) REFERENCES `student_applications` (`id`) ON DELETE CASCADE;
ALTER TABLE `application_documents` DROP FOREIGN KEY IF EXISTS `fk_ad_document_type`;
ALTER TABLE `application_documents` ADD CONSTRAINT `fk_ad_document_type` FOREIGN KEY (`document_type_id`) REFERENCES `document_types` (`id`);
ALTER TABLE `application_documents` DROP FOREIGN KEY IF EXISTS `fk_ad_verified_by`;
ALTER TABLE `application_documents` ADD CONSTRAINT `fk_ad_verified_by` FOREIGN KEY (`verified_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;
ALTER TABLE `application_status_log` DROP FOREIGN KEY IF EXISTS `fk_asl_application`;
ALTER TABLE `application_status_log` ADD CONSTRAINT `fk_asl_application` FOREIGN KEY (`application_id`) REFERENCES `student_applications` (`id`) ON DELETE CASCADE;
ALTER TABLE `application_status_log` DROP FOREIGN KEY IF EXISTS `fk_asl_actor`;
ALTER TABLE `application_status_log` ADD CONSTRAINT `fk_asl_actor` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;
ALTER TABLE `admission_offers` DROP FOREIGN KEY IF EXISTS `fk_ao_application`;
ALTER TABLE `admission_offers` ADD CONSTRAINT `fk_ao_application` FOREIGN KEY (`application_id`) REFERENCES `student_applications` (`id`);
ALTER TABLE `admission_offers` DROP FOREIGN KEY IF EXISTS `fk_ao_offered_by`;
ALTER TABLE `admission_offers` ADD CONSTRAINT `fk_ao_offered_by` FOREIGN KEY (`offered_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;
ALTER TABLE `merit_criteria` DROP FOREIGN KEY IF EXISTS `fk_mc_dept`;
ALTER TABLE `merit_criteria` ADD CONSTRAINT `fk_mc_dept` FOREIGN KEY (`department_id`) REFERENCES `departements` (`dep_id`);
ALTER TABLE `merit_criteria` DROP FOREIGN KEY IF EXISTS `fk_mc_acad_year`;
ALTER TABLE `merit_criteria` ADD CONSTRAINT `fk_mc_acad_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`);
ALTER TABLE `merit_criteria` DROP FOREIGN KEY IF EXISTS `fk_mc_created_by`;
ALTER TABLE `merit_criteria` ADD CONSTRAINT `fk_mc_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;
ALTER TABLE `merit_lists` DROP FOREIGN KEY IF EXISTS `fk_ml_application`;
ALTER TABLE `merit_lists` ADD CONSTRAINT `fk_ml_application` FOREIGN KEY (`application_id`) REFERENCES `student_applications` (`id`) ON DELETE CASCADE;
ALTER TABLE `merit_lists` DROP FOREIGN KEY IF EXISTS `fk_ml_generated_by`;
ALTER TABLE `merit_lists` ADD CONSTRAINT `fk_ml_generated_by` FOREIGN KEY (`generated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;
-- fk_clear_student intentionally omitted: student.regnumber is nullable varchar(250) with no unique index
-- in the legacy table; referential integrity is enforced at the application layer instead.
ALTER TABLE `student_clearances` DROP FOREIGN KEY IF EXISTS `fk_clear_year`;
ALTER TABLE `student_clearances` ADD CONSTRAINT `fk_clear_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`) ON DELETE CASCADE;
ALTER TABLE `student_clearances` DROP FOREIGN KEY IF EXISTS `fk_clear_term`;
ALTER TABLE `student_clearances` ADD CONSTRAINT `fk_clear_term` FOREIGN KEY (`academic_term_id`) REFERENCES `academic_terms` (`id`) ON DELETE CASCADE;
ALTER TABLE `fee_structures` DROP FOREIGN KEY IF EXISTS `fk_fs_academic_year`;
ALTER TABLE `fee_structures` ADD CONSTRAINT `fk_fs_academic_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`);
ALTER TABLE `fee_invoices` DROP FOREIGN KEY IF EXISTS `fk_fi_academic_year`;
ALTER TABLE `fee_invoices` ADD CONSTRAINT `fk_fi_academic_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`);
ALTER TABLE `fee_payments` DROP FOREIGN KEY IF EXISTS `fk_fp_invoice`;
ALTER TABLE `fee_payments` ADD CONSTRAINT `fk_fp_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `fee_invoices` (`id`);
ALTER TABLE `fee_bursaries` DROP FOREIGN KEY IF EXISTS `fk_fb_academic_year`;
ALTER TABLE `fee_bursaries` ADD CONSTRAINT `fk_fb_academic_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`);
ALTER TABLE `expenses` DROP FOREIGN KEY IF EXISTS `fk_exp_category`;
ALTER TABLE `expenses` ADD CONSTRAINT `fk_exp_category` FOREIGN KEY (`category_id`) REFERENCES `expense_categories` (`id`);
ALTER TABLE `expenses` DROP FOREIGN KEY IF EXISTS `fk_exp_academic_year`;
ALTER TABLE `expenses` ADD CONSTRAINT `fk_exp_academic_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`) ON DELETE SET NULL;
ALTER TABLE `expense_budgets` DROP FOREIGN KEY IF EXISTS `fk_eb_year`;
ALTER TABLE `expense_budgets` ADD CONSTRAINT `fk_eb_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`) ON DELETE CASCADE;
ALTER TABLE `expense_budgets` DROP FOREIGN KEY IF EXISTS `fk_eb_cat`;
ALTER TABLE `expense_budgets` ADD CONSTRAINT `fk_eb_cat` FOREIGN KEY (`category_id`) REFERENCES `expense_categories` (`id`) ON DELETE CASCADE;

SET FOREIGN_KEY_CHECKS = 1;

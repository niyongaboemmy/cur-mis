-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: Create HR Monitoring tables
-- Date: 2026-09-07
--
-- The HR Monitoring module (HrMonitoringController / hr-monitoring routes,
-- PerformanceMonitoringPage + EmployeeRelationsMonitoringPage) was merged
-- without a schema migration, so every endpoint fails on deployment with
-- "Base table or view not found" (e.g. `grievances` doesn't exist).
--
-- This creates the 9 backing tables. Columns mirror the INSERT/UPDATE/SELECT
-- statements in HrMonitoringController. Relationships are kept as plain indexed
-- columns (no hard FKs) to stay tolerant of legacy cPanel schema snapshots.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `performance_appraisals` (
  `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id`      INT UNSIGNED DEFAULT NULL,
  `appraisal_period` VARCHAR(100) DEFAULT NULL,
  `appraisal_date`   DATE DEFAULT NULL,
  `rating`           VARCHAR(50) DEFAULT NULL,
  `comments`         TEXT DEFAULT NULL,
  `appraiser_id`     INT UNSIGNED DEFAULT NULL,
  `status`           VARCHAR(30) NOT NULL DEFAULT 'draft',
  `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pa_employee` (`employee_id`),
  KEY `idx_pa_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `recruitment_posts` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `position_title` VARCHAR(200) DEFAULT NULL,
  `department_id`  INT UNSIGNED DEFAULT NULL,
  `position_level` VARCHAR(100) DEFAULT NULL,
  `vacancy_count`  INT NOT NULL DEFAULT 1,
  `posting_date`   DATE DEFAULT NULL,
  `closing_date`   DATE DEFAULT NULL,
  `status`         VARCHAR(30) NOT NULL DEFAULT 'open',
  `description`    TEXT DEFAULT NULL,
  `created_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rp_department` (`department_id`),
  KEY `idx_rp_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `recruitment_candidates` (
  `id`                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `recruitment_post_id` INT UNSIGNED DEFAULT NULL,
  `candidate_name`      VARCHAR(200) DEFAULT NULL,
  `candidate_email`     VARCHAR(200) DEFAULT NULL,
  `candidate_phone`     VARCHAR(50) DEFAULT NULL,
  `application_date`    DATE DEFAULT NULL,
  `stage`               VARCHAR(50) NOT NULL DEFAULT 'initial',
  `status`              VARCHAR(30) NOT NULL DEFAULT 'applied',
  `interview_date`      DATE DEFAULT NULL,
  `notes`               TEXT DEFAULT NULL,
  `created_at`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rc_post` (`recruitment_post_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `grievances` (
  `id`                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id`           INT UNSIGNED DEFAULT NULL,
  `grievance_date`        DATE DEFAULT NULL,
  `grievance_type`        VARCHAR(100) DEFAULT NULL,
  `grievance_description` TEXT DEFAULT NULL,
  `status`                VARCHAR(30) NOT NULL DEFAULT 'filed',
  `assigned_to`           INT UNSIGNED DEFAULT NULL,
  `resolution_date`       DATE DEFAULT NULL,
  `resolution_notes`      TEXT DEFAULT NULL,
  `satisfaction_rating`   TINYINT DEFAULT NULL,
  `created_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_gr_employee` (`employee_id`),
  KEY `idx_gr_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `conflict_resolutions` (
  `id`                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `conflict_date`        DATE DEFAULT NULL,
  `parties_involved`     TEXT DEFAULT NULL,
  `conflict_description` TEXT DEFAULT NULL,
  `resolution_method`    VARCHAR(150) DEFAULT NULL,
  `mediator_id`          INT UNSIGNED DEFAULT NULL,
  `status`               VARCHAR(30) NOT NULL DEFAULT 'pending',
  `created_at`           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_cr_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `counseling_records` (
  `id`                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id`        INT UNSIGNED DEFAULT NULL,
  `counselor_id`       INT UNSIGNED DEFAULT NULL,
  `counseling_date`    DATE DEFAULT NULL,
  `session_topic`      VARCHAR(200) DEFAULT NULL,
  `session_notes`      TEXT DEFAULT NULL,
  `follow_up_required` TINYINT(1) NOT NULL DEFAULT 0,
  `follow_up_date`     DATE DEFAULT NULL,
  `created_at`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_co_employee` (`employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `exit_interviews` (
  `id`                             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `employee_id`                    INT UNSIGNED DEFAULT NULL,
  `exit_date`                      DATE DEFAULT NULL,
  `reason_for_leaving`             TEXT DEFAULT NULL,
  `interviewer_id`                 INT UNSIGNED DEFAULT NULL,
  `job_satisfaction`               TINYINT DEFAULT NULL,
  `management_satisfaction`        TINYINT DEFAULT NULL,
  `work_environment_satisfaction`  TINYINT DEFAULT NULL,
  `comments`                       TEXT DEFAULT NULL,
  `would_rehire`                   TINYINT(1) NOT NULL DEFAULT 0,
  `created_at`                     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`                     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ei_employee` (`employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `staff_satisfaction_surveys` (
  `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `survey_date`      DATE DEFAULT NULL,
  `survey_title`     VARCHAR(200) DEFAULT NULL,
  `respondent_count` INT NOT NULL DEFAULT 0,
  `average_score`    DECIMAL(5,2) DEFAULT NULL,
  `notes`            TEXT DEFAULT NULL,
  `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `turnover_analytics` (
  `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `academic_year_id` INT UNSIGNED DEFAULT NULL,
  `report_date`      DATE DEFAULT NULL,
  `turnover_rate`    DECIMAL(6,2) DEFAULT NULL,
  `headcount_start`  INT DEFAULT NULL,
  `headcount_end`    INT DEFAULT NULL,
  `separations`      INT DEFAULT NULL,
  `notes`            TEXT DEFAULT NULL,
  `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ta_year` (`academic_year_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SELECT 'Migration complete: created HR Monitoring tables' AS status;

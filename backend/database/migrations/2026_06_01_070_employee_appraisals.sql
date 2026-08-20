-- Migration 070: Employee Appraisal Module (Gap 16)
-- Implements appraisal periods, KPI criteria, per-employee appraisal records,
-- and per-criterion ratings supporting self-assessment, supervisor review, HR review.

-- 1. Appraisal periods (Annual / Semi-Annual / Quarterly / Custom)
CREATE TABLE IF NOT EXISTS `appraisal_periods` (
    `id`                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `title`               VARCHAR(255) NOT NULL,
    `period_type`         ENUM('Annual','Semi-Annual','Quarterly','Custom') NOT NULL DEFAULT 'Annual',
    `year`                YEAR NOT NULL,
    `start_date`          DATE NOT NULL,
    `end_date`            DATE NOT NULL,
    `submission_deadline` DATE DEFAULT NULL COMMENT 'Last day for self-assessment submission',
    `status`              ENUM('Draft','Active','Closed') NOT NULL DEFAULT 'Draft',
    `description`         TEXT DEFAULT NULL,
    `created_at`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_ap_year_status` (`year`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. KPI/criteria per period
CREATE TABLE IF NOT EXISTS `appraisal_criteria` (
    `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `period_id`   INT UNSIGNED NOT NULL,
    `name`        VARCHAR(255) NOT NULL,
    `description` TEXT DEFAULT NULL,
    `weight`      DECIMAL(5,2) NOT NULL DEFAULT 1.00 COMMENT 'Relative weight (used for weighted score)',
    `max_score`   TINYINT UNSIGNED NOT NULL DEFAULT 5,
    `sort_order`  TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_ac_period` (`period_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. One appraisal record per employee per period
CREATE TABLE IF NOT EXISTS `appraisals` (
    `id`                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `period_id`              INT UNSIGNED NOT NULL,
    `employee_id`            INT UNSIGNED NOT NULL,
    `status`                 ENUM('Draft','Self-Review','Supervisor-Review','HR-Review','Completed') NOT NULL DEFAULT 'Draft',
    `self_comment`           TEXT DEFAULT NULL COMMENT 'Overall self-assessment comment',
    `supervisor_comment`     TEXT DEFAULT NULL COMMENT 'Overall supervisor review comment',
    `hr_comment`             TEXT DEFAULT NULL COMMENT 'HR final comment',
    `self_total_score`       DECIMAL(6,2) DEFAULT NULL,
    `supervisor_total_score` DECIMAL(6,2) DEFAULT NULL,
    `final_score`            DECIMAL(6,2) DEFAULT NULL,
    `final_grade`            VARCHAR(50)  DEFAULT NULL COMMENT 'Excellent / Good / Satisfactory / Needs Improvement',
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

-- 4. Per-criterion ratings (self + supervisor)
CREATE TABLE IF NOT EXISTS `appraisal_ratings` (
    `id`                INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `appraisal_id`      INT UNSIGNED NOT NULL,
    `criterion_id`      INT UNSIGNED NOT NULL,
    `self_score`        TINYINT UNSIGNED DEFAULT NULL,
    `supervisor_score`  TINYINT UNSIGNED DEFAULT NULL,
    `self_comment`      TEXT DEFAULT NULL,
    `supervisor_comment` TEXT DEFAULT NULL,
    `created_at`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_rating_appraisal_criterion` (`appraisal_id`, `criterion_id`),
    KEY `idx_ar_appraisal` (`appraisal_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

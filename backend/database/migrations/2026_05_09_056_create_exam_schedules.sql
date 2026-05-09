-- 2026_05_09_056_create_exam_schedules.sql
-- One row per planned exam sitting (module + program + component). The
-- Academics » Exams sub-tab uses this table to set the exam date/time
-- separately from the teaching schedule (which lives in
-- `module_offerings`). Each row carries enough metadata to render the
-- per-exam attendance sheet without further joins (faculty/option are
-- still resolved at read time).
--
-- Idempotent — duplicate-key errors are swallowed by the migration runner.
CREATE TABLE IF NOT EXISTS `exam_schedules` (
  `id`              INT          NOT NULL AUTO_INCREMENT,
  `module_id`       INT          NOT NULL,
  `option_id`       INT          NULL,
  `term_id`         INT UNSIGNED NULL,
  `academic_year`   VARCHAR(20)  NULL,
  `component`       VARCHAR(50)  NOT NULL DEFAULT 'Final Exam',
  `exam_date`       DATE         NULL,
  `start_time`      TIME         NULL,
  `end_time`        TIME         NULL,
  `campus_id`       INT UNSIGNED NULL,
  `instructor_name` VARCHAR(120) NULL,
  `notes`           VARCHAR(500) NULL,
  `created_at`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_es_module` (`module_id`),
  KEY `idx_es_option` (`option_id`),
  KEY `idx_es_term`   (`term_id`),
  KEY `idx_es_campus` (`campus_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

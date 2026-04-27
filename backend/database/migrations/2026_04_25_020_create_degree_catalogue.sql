-- 2026_04_25_020_create_degree_catalogue.sql
-- Creates the `degree_catalogue` table backing DegreeModel and the
-- "Degrees" entity on /academic/management. The existing `degrees`
-- table stores awarded degrees per student (id, student_id, awarded_date,
-- certificate_no, ...) — a separate concept from the degree program
-- catalogue.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS `degree_catalogue` (
  `id`             int unsigned NOT NULL AUTO_INCREMENT,
  `code`           varchar(32)  NOT NULL,
  `name`           varchar(200) NOT NULL,
  `department_id`  int          DEFAULT NULL,
  `degree_type`    varchar(64)  DEFAULT NULL,
  `duration_years` tinyint unsigned  DEFAULT NULL,
  `total_credits`  smallint unsigned DEFAULT NULL,
  `is_active`      tinyint(1)   NOT NULL DEFAULT 1,
  `created_at`     timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_degree_code` (`code`),
  KEY `idx_degree_dept` (`department_id`),
  CONSTRAINT `fk_degree_dept`
    FOREIGN KEY (`department_id`) REFERENCES `departements` (`dep_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

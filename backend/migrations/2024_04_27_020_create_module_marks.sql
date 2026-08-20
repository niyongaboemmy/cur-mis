-- Migration: Module marks (per-student marks per module per term)
-- Date: 2024-04-27
--
-- One row per (module, student, term). Captures CAT, Assignment and Exam
-- components plus the computed total/percentage and final letter grade.
-- Lecturers fill the marks for modules they are assigned to (via
-- module_assignments); admins with MANAGE_MODULE_MARKS can edit anywhere.

CREATE TABLE IF NOT EXISTS `module_marks` (
  `id`                 INT AUTO_INCREMENT PRIMARY KEY,
  `module_id`          INT NOT NULL,
  -- Pin the collation so it matches `student.regnumber` and
  -- `module_registrations.student_regnumber` — otherwise MySQL 8's default
  -- (utf8mb4_0900_ai_ci) breaks JOINs with "Illegal mix of collations".
  `student_regnumber`  VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `academic_term_id`   INT UNSIGNED NOT NULL,

  -- Component scores (raw points). Typical weighting: CAT 20, Assignment 10, Exam 70.
  `cat_marks`          DECIMAL(6,2) NULL,
  `assignment_marks`   DECIMAL(6,2) NULL,
  `exam_marks`         DECIMAL(6,2) NULL,

  -- Maxima (so a teacher can pick e.g. CAT out of 20 instead of 100).
  `cat_max`            DECIMAL(6,2) NOT NULL DEFAULT 20,
  `assignment_max`     DECIMAL(6,2) NOT NULL DEFAULT 10,
  `exam_max`           DECIMAL(6,2) NOT NULL DEFAULT 70,

  -- Computed totals (kept in DB so reports/listings don't have to re-derive).
  `total`              DECIMAL(6,2) NULL,
  `percentage`         DECIMAL(5,2) NULL,
  `grade`              VARCHAR(4)   NULL,

  `remarks`            TEXT NULL,
  `recorded_by`        INT NULL,
  `created_at`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY `uniq_marks` (`module_id`, `student_regnumber`, `academic_term_id`),
  KEY `idx_marks_student_term` (`student_regnumber`, `academic_term_id`),
  KEY `idx_marks_module_term`  (`module_id`, `academic_term_id`),
  CONSTRAINT `fk_marks_module` FOREIGN KEY (`module_id`)
    REFERENCES `modules`(`module_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_marks_term`   FOREIGN KEY (`academic_term_id`)
    REFERENCES `academic_terms`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

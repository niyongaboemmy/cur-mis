-- Migration: Module registrations (student ↔ module per term)
-- Date: 2024-04-23

CREATE TABLE IF NOT EXISTS `module_registrations` (
  `id`                 INT AUTO_INCREMENT PRIMARY KEY,
  `module_id`          INT NOT NULL,
  `student_regnumber`  VARCHAR(32) NOT NULL,
  `academic_term_id`   INT UNSIGNED NOT NULL,
  `status`             ENUM('registered','dropped','completed','failed') NOT NULL DEFAULT 'registered',
  `grade`              VARCHAR(4) NULL,
  `registered_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `dropped_at`         TIMESTAMP NULL,
  `created_at`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_registration` (`module_id`, `student_regnumber`, `academic_term_id`),
  KEY `idx_reg_student_term` (`student_regnumber`, `academic_term_id`),
  KEY `idx_reg_module_term`  (`module_id`, `academic_term_id`),
  CONSTRAINT `fk_reg_module` FOREIGN KEY (`module_id`)
    REFERENCES `modules`(`module_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_reg_term`   FOREIGN KEY (`academic_term_id`)
    REFERENCES `academic_terms`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

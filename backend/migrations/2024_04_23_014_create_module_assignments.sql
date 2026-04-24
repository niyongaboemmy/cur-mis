-- Migration: Module assignments (faculty ↔ module per term)
-- Date: 2024-04-23

CREATE TABLE IF NOT EXISTS `module_assignments` (
  `id`                 INT AUTO_INCREMENT PRIMARY KEY,
  `module_id`          INT NOT NULL,
  `staff_id`           INT NOT NULL,
  `academic_year_id`   INT UNSIGNED NOT NULL,
  `academic_term_id`   INT UNSIGNED NOT NULL,
  `role`               ENUM('primary','assistant') NOT NULL DEFAULT 'primary',
  `hours_per_week`     DECIMAL(4,1) NOT NULL DEFAULT 0,
  `notes`              TEXT NULL,
  `created_by`         INT NULL,
  `created_at`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_assignment` (`module_id`, `staff_id`, `academic_term_id`),
  KEY `idx_asgn_staff_term` (`staff_id`, `academic_term_id`),
  KEY `idx_asgn_module_term` (`module_id`, `academic_term_id`),
  CONSTRAINT `fk_asgn_module` FOREIGN KEY (`module_id`)
    REFERENCES `modules`(`module_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_asgn_year` FOREIGN KEY (`academic_year_id`)
    REFERENCES `academic_years`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_asgn_term` FOREIGN KEY (`academic_term_id`)
    REFERENCES `academic_terms`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

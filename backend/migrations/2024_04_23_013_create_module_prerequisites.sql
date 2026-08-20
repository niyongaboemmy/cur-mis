-- Migration: Module prerequisites junction table
-- Date: 2024-04-23
--
-- Links a module to its prerequisite modules. Each row means:
--   "module_id requires prerequisite_module_id to be completed before it can be taken."

CREATE TABLE IF NOT EXISTS `module_prerequisites` (
  `id`                     INT AUTO_INCREMENT PRIMARY KEY,
  `module_id`              INT NOT NULL,
  `prerequisite_module_id` INT NOT NULL,
  `created_at`             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_prereq_pair` (`module_id`, `prerequisite_module_id`),
  KEY `idx_prereq_module`    (`module_id`),
  KEY `idx_prereq_required`  (`prerequisite_module_id`),
  CONSTRAINT `fk_prereq_module` FOREIGN KEY (`module_id`)
    REFERENCES `modules`(`module_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_prereq_required` FOREIGN KEY (`prerequisite_module_id`)
    REFERENCES `modules`(`module_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_prereq_not_self` CHECK (`module_id` <> `prerequisite_module_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

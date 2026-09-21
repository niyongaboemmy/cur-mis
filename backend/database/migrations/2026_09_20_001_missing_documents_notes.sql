-- Create table for missing documents notification messages
-- Allows staff to send messages to students about missing documents
--
-- NOTE: originally carried a FOREIGN KEY to `students`, which is a VIEW over
-- `student` on this schema, so the CREATE failed and the runner re-tried it
-- on every migrate. Rewritten without the FK (student ids are validated in
-- code); the full column set lives in 2026_09_21_001.

CREATE TABLE IF NOT EXISTS `missing_document_notes` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id` INT NOT NULL,
  `reg_number` VARCHAR(255) NULL,
  `message` LONGTEXT NOT NULL,
  `document_types` JSON NULL,
  `sent_by_user_id` INT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_mdn_student` (`student_id`, `created_at`),
  INDEX `idx_mdn_reg_number` (`reg_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

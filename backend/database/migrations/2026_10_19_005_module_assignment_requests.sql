-- A lecturer with no modules assigned asks for the modules they teach. The request
-- stays pending until an admin, or the Dean / HOD of the module's department,
-- approves it. Approval creates the module_assignments row, and the lecturer's
-- data follows that assignment.

CREATE TABLE IF NOT EXISTS `module_assignment_requests` (
  `id`               int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`          int(10) UNSIGNED NOT NULL,
  `module_id`        int(11) NOT NULL,
  `academic_year_id` int(10) UNSIGNED DEFAULT NULL,
  `academic_term_id` int(10) UNSIGNED DEFAULT NULL,
  `status`           enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `requested_at`     datetime NOT NULL DEFAULT current_timestamp(),
  `decided_by`       int(10) UNSIGNED DEFAULT NULL,
  `decided_at`       datetime DEFAULT NULL,
  `decision_note`    varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_mar_user_status` (`user_id`, `status`),
  KEY `idx_mar_module` (`module_id`),
  CONSTRAINT `fk_mar_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

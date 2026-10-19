-- Academic secretaries: one secretary per department, or one for a whole faculty.
-- A secretary sees the same data as the Dean or HOD of that unit, can manage the
-- programmes, modules and staff in it, and cannot change faculties or departments.

CREATE TABLE IF NOT EXISTS `academic_secretaries` (
  `id`          int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`     int(10) UNSIGNED NOT NULL,
  `fac_id`      int(11) DEFAULT NULL COMMENT 'whole faculty (every department in it)',
  `dep_id`      int(11) DEFAULT NULL COMMENT 'one department',
  `assigned_by` int(10) UNSIGNED DEFAULT NULL,
  `assigned_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_as_user` (`user_id`),
  CONSTRAINT `fk_as_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

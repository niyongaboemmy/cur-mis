-- Places each lecturer in a faculty, department and (optionally) programme option.
-- Lecturers still see only the modules assigned to them (module_assignments);
-- the placement decides who can manage the lecturer: admin (any), Dean (faculty),
-- HOD (department).

CREATE TABLE IF NOT EXISTS `lecturer_placements` (
  `user_id`    int(10) UNSIGNED NOT NULL,
  `fac_id`     int(11) DEFAULT NULL COMMENT 'faculty.fac_id',
  `dep_id`     int(11) DEFAULT NULL COMMENT 'departements.dep_id',
  `option_id`  int(11) DEFAULT NULL COMMENT 'options.id (programme option)',
  `updated_by` int(10) UNSIGNED DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_lp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

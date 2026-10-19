-- A Dean or Head of Department picks their faculty or department at first login.
-- The request stays pending until an admin approves it in Academic Scope; until
-- then the account sees no academic data.

CREATE TABLE IF NOT EXISTS `academic_scope_requests` (
  `id`            int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`       int(10) UNSIGNED NOT NULL,
  `fac_id`        int(11) DEFAULT NULL COMMENT 'requested faculty (Dean)',
  `dep_id`        int(11) DEFAULT NULL COMMENT 'requested department (HOD)',
  `status`        enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `requested_at`  datetime NOT NULL DEFAULT current_timestamp(),
  `decided_by`    int(10) UNSIGNED DEFAULT NULL,
  `decided_at`    datetime DEFAULT NULL,
  `decision_note` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_asr_user_status` (`user_id`, `status`),
  CONSTRAINT `fk_asr_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

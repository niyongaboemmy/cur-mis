-- 2026_04_24_018_create_attendance_module.sql
-- Replaces the empty legacy `attendance` table with a proper two-table model:
--   1. `attendance_sessions` — one row per class meeting (module + date + type).
--   2. `attendance_records`  — one row per student per session with status.
--
-- Also registers three permissions (VIEW/RECORD/MANAGE_ATTENDANCE) under a new
-- "Attendance" category and grants them to the Superadmin role.
--
-- Idempotent: safe to re-run.

-- 1. Drop legacy table (it was unused, had no PK, no FKs, 0 rows) ─────────────
DROP TABLE IF EXISTS `attendance`;

-- 2. Sessions table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `attendance_sessions` (
  `id`                   int NOT NULL AUTO_INCREMENT,
  `module_id`            int NOT NULL,
  `module_schedule_id`   int DEFAULT NULL,
  `academic_term_id`     int unsigned NOT NULL,
  `session_date`         date NOT NULL,
  `session_type`         enum('lecture','lab','tutorial','seminar','exam') NOT NULL DEFAULT 'lecture',
  `status`               enum('open','closed') NOT NULL DEFAULT 'open',
  `notes`                varchar(500) DEFAULT NULL,
  `started_by`           int unsigned DEFAULT NULL COMMENT 'users.id who started/owns the session',
  `created_at`           timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_session` (`module_id`, `session_date`, `session_type`),
  KEY `idx_sess_term_date`   (`academic_term_id`, `session_date`),
  KEY `idx_sess_module_date` (`module_id`, `session_date`),
  KEY `fk_sess_schedule`     (`module_schedule_id`),
  KEY `fk_sess_owner`        (`started_by`),
  CONSTRAINT `fk_sess_module`    FOREIGN KEY (`module_id`)          REFERENCES `modules`          (`module_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sess_schedule`  FOREIGN KEY (`module_schedule_id`) REFERENCES `module_schedules` (`id`)        ON DELETE SET NULL,
  CONSTRAINT `fk_sess_term`      FOREIGN KEY (`academic_term_id`)   REFERENCES `academic_terms`   (`id`)        ON DELETE CASCADE,
  CONSTRAINT `fk_sess_user`      FOREIGN KEY (`started_by`)         REFERENCES `users`            (`id`)        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 3. Records table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `attendance_records` (
  `id`                int NOT NULL AUTO_INCREMENT,
  `session_id`        int NOT NULL,
  `student_regnumber` varchar(32) NOT NULL,
  `status`            enum('present','absent','late','excused') NOT NULL DEFAULT 'present',
  `remarks`           varchar(255) DEFAULT NULL,
  `recorded_by`       int unsigned DEFAULT NULL,
  `recorded_at`       timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_session_student` (`session_id`, `student_regnumber`),
  KEY `idx_rec_student` (`student_regnumber`),
  KEY `fk_rec_user`     (`recorded_by`),
  CONSTRAINT `fk_rec_session` FOREIGN KEY (`session_id`)  REFERENCES `attendance_sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rec_user`    FOREIGN KEY (`recorded_by`) REFERENCES `users`               (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 4. Permissions ─────────────────────────────────────────────────────────────
INSERT IGNORE INTO `permission_categories` (`name`, `description`) VALUES
  ('Attendance', 'Recording and reviewing student class attendance.');

SET @cat_att = (SELECT id FROM permission_categories WHERE name = 'Attendance' LIMIT 1);

INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
  (@cat_att, 'View Attendance',   'VIEW_ATTENDANCE',   'Browse attendance sessions, rosters and summaries.'),
  (@cat_att, 'Record Attendance', 'RECORD_ATTENDANCE', 'Start sessions and mark students present/absent for modules the user teaches.'),
  (@cat_att, 'Manage Attendance', 'MANAGE_ATTENDANCE', 'Full attendance administration — edit/delete any session or record, override teacher scoping.');

-- 5. Grant to Superadmin ─────────────────────────────────────────────────────
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 1, `id` FROM `permissions`
WHERE `slug` IN ('VIEW_ATTENDANCE', 'RECORD_ATTENDANCE', 'MANAGE_ATTENDANCE');

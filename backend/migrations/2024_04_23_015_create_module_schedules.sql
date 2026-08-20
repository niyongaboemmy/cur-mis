-- Migration: Module schedules (timetable per module/term)
-- Date: 2024-04-23

CREATE TABLE IF NOT EXISTS `module_schedules` (
  `id`                    INT AUTO_INCREMENT PRIMARY KEY,
  `module_id`             INT NOT NULL,
  `module_assignment_id`  INT NULL,
  `academic_term_id`      INT UNSIGNED NOT NULL,
  `room_id`               INT UNSIGNED NOT NULL,
  `day_of_week`           TINYINT UNSIGNED NOT NULL,
  `start_time`            TIME NOT NULL,
  `end_time`              TIME NOT NULL,
  `session_type`          ENUM('lecture','lab','tutorial','seminar','exam') NOT NULL DEFAULT 'lecture',
  `notes`                 VARCHAR(255) NULL,
  `created_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_sched_module_term`  (`module_id`, `academic_term_id`),
  KEY `idx_sched_room_day`     (`room_id`, `day_of_week`, `academic_term_id`),
  KEY `idx_sched_asgn`         (`module_assignment_id`),
  CONSTRAINT `fk_sched_module` FOREIGN KEY (`module_id`)
    REFERENCES `modules`(`module_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sched_room`   FOREIGN KEY (`room_id`)
    REFERENCES `rooms`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_sched_term`   FOREIGN KEY (`academic_term_id`)
    REFERENCES `academic_terms`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sched_asgn`   FOREIGN KEY (`module_assignment_id`)
    REFERENCES `module_assignments`(`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_sched_time_valid` CHECK (`end_time` > `start_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

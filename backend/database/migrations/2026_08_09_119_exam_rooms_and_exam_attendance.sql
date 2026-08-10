-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 119: Exam room assignment + exam attendance capture.
-- Date: 2026-08-09
--
-- Adds the two things the exam subsystem has never had:
--
--   §1  exam_schedules.room_id           — WHERE the exam is sat (rooms.id).
--   §2  exam_schedules.invigilator_user_id — WHO is assigned to it (users.id).
--       `instructor_name` already exists but is a free-text VARCHAR(120) holding
--       a NAME, not a key (ExamsPanel.tsx persists the name, not an id), so
--       "which exams am I invigilating?" is not answerable today. This adds a
--       real reference without disturbing the existing display column.
--   §3  exam_attendance                   — per-student present/absent for a
--       sitting. Today ExamAttendanceModal only renders a BLANK signature sheet
--       for printing; no attendance state is ever persisted anywhere.
--
-- Deliberately NOT reusing `attendance_sessions`/`attendance_records`: those are
-- keyed on (module_id, session_date, session_type) for recurring class meetings,
-- whereas an exam sitting is identified by exam_schedules.id and additionally
-- needs seat number and sign-in/out times. Overloading the class-attendance
-- tables would force a nullable exam_schedule_id onto every class record and
-- break the uniq_session constraint.
--
-- `exam_sessions` is deliberately NOT reused either — it has 1 orphaned row, no
-- primary key, no auto_increment, no model, no route and no FK from
-- exam_schedules, so it is dead weight rather than a foundation.
--
-- Additive and idempotent throughout: guarded ALTERs + CREATE TABLE IF NOT EXISTS.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── §1  exam_schedules.room_id ────────────────────────────────────────────────
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exam_schedules'
               AND COLUMN_NAME = 'room_id');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `exam_schedules` ADD COLUMN `room_id` INT UNSIGNED NULL DEFAULT NULL AFTER `campus_id`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exam_schedules'
               AND INDEX_NAME = 'idx_es_room');
SET @stmt := IF(@idx = 0,
  'ALTER TABLE `exam_schedules` ADD INDEX `idx_es_room` (`room_id`)',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;


-- ── §2  exam_schedules.invigilator_user_id ────────────────────────────────────
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exam_schedules'
               AND COLUMN_NAME = 'invigilator_user_id');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `exam_schedules` ADD COLUMN `invigilator_user_id` INT UNSIGNED NULL DEFAULT NULL COMMENT ''users.id of the assigned invigilator'' AFTER `instructor_name`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exam_schedules'
               AND INDEX_NAME = 'idx_es_invigilator');
SET @stmt := IF(@idx = 0,
  'ALTER TABLE `exam_schedules` ADD INDEX `idx_es_invigilator` (`invigilator_user_id`)',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Backfill the new reference from the existing free-text name where it maps to
-- exactly one user, so pre-existing exams gain a queryable invigilator.
UPDATE `exam_schedules` es
JOIN `users` u ON LOWER(TRIM(u.`full_name`)) = LOWER(TRIM(es.`instructor_name`))
SET es.`invigilator_user_id` = u.`id`
WHERE es.`invigilator_user_id` IS NULL
  AND es.`instructor_name` IS NOT NULL
  AND TRIM(es.`instructor_name`) <> ''
  AND (
    SELECT COUNT(*) FROM `users` u2
    WHERE LOWER(TRIM(u2.`full_name`)) = LOWER(TRIM(es.`instructor_name`))
  ) = 1;


-- ── §3  exam_attendance ───────────────────────────────────────────────────────
-- One row per student per exam sitting. `status` mirrors the class-attendance
-- vocabulary plus 'malpractice', which only applies to exams.
CREATE TABLE IF NOT EXISTS `exam_attendance` (
  `id`                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `exam_schedule_id`   INT          NOT NULL,
  `student_regnumber`  VARCHAR(250) NOT NULL,
  `status`             ENUM('present','absent','excused','malpractice') NOT NULL DEFAULT 'absent',
  `seat_no`            VARCHAR(20)  NULL DEFAULT NULL,
  `room_id`            INT UNSIGNED NULL DEFAULT NULL COMMENT 'overrides exam_schedules.room_id for split sittings',
  `signed_in_at`       DATETIME     NULL DEFAULT NULL,
  `signed_out_at`      DATETIME     NULL DEFAULT NULL,
  `remarks`            VARCHAR(500) NULL DEFAULT NULL,
  `recorded_by`        INT UNSIGNED NULL DEFAULT NULL COMMENT 'users.id of the invigilator who marked it',
  `created_at`         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_exam_student` (`exam_schedule_id`, `student_regnumber`),
  KEY `idx_ea_exam`    (`exam_schedule_id`),
  KEY `idx_ea_student` (`student_regnumber`),
  KEY `idx_ea_status`  (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

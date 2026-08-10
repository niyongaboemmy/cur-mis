-- ══════════════════════════════════════════════════════════════════════════════
-- PRODUCTION CUMULATED MIGRATION — 2026-08-10
-- Teacher (lecturer) portal
--
-- Rolls up every schema and RBAC change the teacher workspace needs into ONE
-- runnable file, so production can be brought up to date in a single paste
-- (phpMyAdmin / mysql CLI) without running the migration runner.
--
-- MIGRATIONS COVERED — applying this file is equivalent to running all six:
--   §1  2026_08_09_117  reconcile fee_payments / options / modules columns
--   §2  2026_08_09_118  module_assignments.user_id — canonical lecturer link
--   §3  2026_08_09_119  exam room + invigilator + exam_attendance table
--   §4  2026_08_09_121  rooms PRIMARY KEY/AUTO_INCREMENT + assignment uniqueness
--   §5  2026_08_09_120  ACCESS_TEACHER_PORTAL permission + role grants
--   §6  2026_08_09_122  revoke the global dashboard from teaching roles
--
-- ORDER MATTERS: §2 must backfill user_id BEFORE §4 adds the unique key over it,
-- and §3 must create exam_schedules.room_id BEFORE §4 touches `rooms`.
--
-- DESIGN
--   • Idempotent. Every statement is guarded by INFORMATION_SCHEMA, or uses
--     CREATE TABLE IF NOT EXISTS / INSERT IGNORE / ON DUPLICATE KEY. Safe to
--     re-run, and safe on a database where some of it already landed.
--   • Portable. No `ADD COLUMN IF NOT EXISTS` — that is MariaDB-only syntax and
--     a 1064 syntax error on MySQL 8. Guarded PREPARE blocks run on both.
--   • Additive. No DROP of any table, and no data deletion except §6, which
--     removes exactly one role_permissions grant (reversible — see §6).
--
-- SAFE TO RUN ALONGSIDE THE RUNNER: the six individual files remain in
-- database/migrations/. Because everything here is guarded, whichever runs
-- second is a no-op. If you apply this file by hand, mark the six as applied so
-- the runner skips them:
--   INSERT IGNORE INTO schema_migrations (filename, status) VALUES
--     ('2026_08_09_117_reconcile_fee_payments_and_options_columns.sql','applied'),
--     ('2026_08_09_118_module_assignments_canonical_user_link.sql','applied'),
--     ('2026_08_09_119_exam_rooms_and_exam_attendance.sql','applied'),
--     ('2026_08_09_120_seed_teacher_portal_permission.sql','applied'),
--     ('2026_08_09_121_rooms_pk_and_assignment_user_unique.sql','applied'),
--     ('2026_08_09_122_revoke_global_dashboard_from_teaching_roles.sql','applied');
-- ══════════════════════════════════════════════════════════════════════════════


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §1  Columns the code requires but no safe migration creates                ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

-- ── 1a. fee_payments.bank_slip_file_id ───────────────────────────────────────
-- FeePaymentModel::$fillable lists it and FeeService::record() writes it (NULL
-- for cash/manual payments). The only migration that creates it is
-- 2026_05_16_051, which does so by DROPping and recreating `fee_payments` —
-- destructive on any populated database, so it must stay skipped there. This
-- adds the column additively instead.
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fee_payments'
               AND COLUMN_NAME = 'bank_slip_file_id');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `fee_payments` ADD COLUMN `bank_slip_file_id` VARCHAR(36) NULL DEFAULT NULL COMMENT ''UUID in file-server'' AFTER `reference_number`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Restore nullability if an older schema left it NOT NULL (was 087 §7).
SET @notnull := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fee_payments'
                   AND COLUMN_NAME = 'bank_slip_file_id' AND IS_NULLABLE = 'NO');
SET @stmt := IF(@notnull > 0,
  'ALTER TABLE `fee_payments` MODIFY COLUMN `bank_slip_file_id` VARCHAR(36) NULL DEFAULT NULL',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ── 1b. options.title ────────────────────────────────────────────────────────
-- GraduandController selects `o.title AS option_title`.
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'options'
               AND COLUMN_NAME = 'title');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `options` ADD COLUMN `title` VARCHAR(255) NULL DEFAULT NULL AFTER `name`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

UPDATE `options` SET `title` = `name` WHERE `title` IS NULL;

-- ── 1c. modules.description ──────────────────────────────────────────────────
-- ModuleModel::$fillable lists `description`, and
-- ModulesManagementController::createCatalog() passes $request->body() straight
-- into create(). BaseModel::filterFillable() keeps any payload key present in
-- $fillable, so posting a description without this column is a 1054 500.
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modules'
               AND COLUMN_NAME = 'description');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `modules` ADD COLUMN `description` TEXT NULL DEFAULT NULL AFTER `module_name`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §2  module_assignments.user_id — the canonical lecturer link               ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
-- `staff_id` is a namespaced instructor id (App\Helpers\InstructorDirectory):
-- < 1,000,000 = hr_employees.id, >= 1,000,000 = USER_OFFSET + users.id. Four
-- subsystems decoded it four different ways and disagreed, so a lecturer could
-- be authorised to WRITE marks for a module that never appeared in their own
-- picker. `user_id` is a plain FK to users.id and becomes the single answer
-- (see App\Helpers\LecturerScope). `staff_id` is left untouched.

-- The column itself, for databases that predate 2026_06_02_079.
SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'module_assignments'
               AND COLUMN_NAME = 'user_id');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `module_assignments` ADD COLUMN `user_id` INT UNSIGNED NULL DEFAULT NULL AFTER `staff_id`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'module_assignments'
               AND INDEX_NAME = 'idx_ma_user');
SET @stmt := IF(@idx = 0,
  'ALTER TABLE `module_assignments` ADD INDEX `idx_ma_user` (`user_id`)',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- 2a. User-account lecturers: staff_id = USER_OFFSET + users.id
UPDATE `module_assignments` a
JOIN `users` u ON u.`id` = a.`staff_id` - 1000000
SET a.`user_id` = u.`id`
WHERE a.`user_id` IS NULL
  AND a.`staff_id` >= 1000000;

-- 2b. HR-employee lecturers: staff_id = hr_employees.id, bridged by email
--     (hr_employees has no user_id column). Only unambiguous matches.
UPDATE `module_assignments` a
JOIN `hr_employees` e ON e.`id` = a.`staff_id`
JOIN `users` u ON LOWER(TRIM(u.`email`)) = LOWER(TRIM(e.`email`))
SET a.`user_id` = u.`id`
WHERE a.`user_id` IS NULL
  AND a.`staff_id` < 1000000
  AND e.`email` IS NOT NULL
  AND TRIM(e.`email`) <> ''
  AND (
    SELECT COUNT(*) FROM `users` u2
    WHERE LOWER(TRIM(u2.`email`)) = LOWER(TRIM(e.`email`))
  ) = 1;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §3  Exam room assignment + exam attendance capture                        ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

-- ── 3a. exam_schedules.room_id — WHERE the exam is sat ───────────────────────
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

-- ── 3b. exam_schedules.invigilator_user_id — WHO is assigned to it ───────────
-- `instructor_name` already exists but is free-text VARCHAR(120) holding a NAME,
-- so "which exams am I invigilating?" is not answerable. This adds a real key
-- without disturbing the display column.
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

-- Backfill the key from the existing free-text name where it maps to exactly
-- one user, so pre-existing exams gain a queryable invigilator.
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

-- ── 3c. exam_attendance ──────────────────────────────────────────────────────
-- Nothing anywhere stored present/absent for an exam: ExamAttendanceModal only
-- rendered a BLANK signature sheet for printing.
--
-- Deliberately NOT reusing attendance_sessions/attendance_records: those are
-- keyed on (module_id, session_date, session_type) for recurring class meetings,
-- whereas an exam sitting is identified by exam_schedules.id and additionally
-- needs seat number and sign-in/out times. `exam_sessions` is also not reused —
-- it has no primary key, no auto_increment, no model and no FK.
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


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §4  rooms primary key + one assignment per lecturer/module/term           ║
-- ╚════════════════════════════════════════════════════════════════════════════╝

-- ── 4a. `rooms` had NO PRIMARY KEY and no AUTO_INCREMENT — only a plain,
--        non-unique KEY on `id`. Nothing could declare a foreign key to it, and
--        inserting a room meant inventing an id by hand. That matters now exam
--        sittings carry a room_id.
SET @haspk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rooms'
                 AND INDEX_NAME = 'PRIMARY');
SET @dups := (SELECT COUNT(*) FROM (
    SELECT 1 FROM `rooms` GROUP BY `id` HAVING COUNT(*) > 1
) d);
SET @stmt := IF(@haspk = 0 AND @dups = 0,
  'ALTER TABLE `rooms` ADD PRIMARY KEY (`id`)',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- AUTO_INCREMENT needs a key on the column, and `rooms`.`id` is the parent of a
-- foreign key (module_schedules.fk_sched_room) which makes a bare MODIFY fail
-- with 1833. Suspending FK checks for the one statement lifts that restriction;
-- the column type is unchanged, so no existing reference is invalidated.
SET @isauto := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rooms'
                  AND COLUMN_NAME = 'id' AND EXTRA LIKE '%auto_increment%');
SET @haspk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rooms'
                 AND INDEX_NAME = 'PRIMARY');
SET @stmt := IF(@isauto = 0 AND @haspk > 0,
  'ALTER TABLE `rooms` MODIFY `id` INT UNSIGNED NOT NULL AUTO_INCREMENT',
  'SELECT 1');
SET FOREIGN_KEY_CHECKS = 0;
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
SET FOREIGN_KEY_CHECKS = 1;

-- The old non-unique helper index is redundant once a PRIMARY KEY exists.
SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rooms'
               AND INDEX_NAME = 'idx_fk_rooms_id');
SET @stmt := IF(@idx > 0,
  'ALTER TABLE `rooms` DROP INDEX `idx_fk_rooms_id`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ── 4b. One canonical assignment per lecturer/module/term ────────────────────
-- `uniq_assignment` covers (module_id, staff_id, academic_term_id). Now that
-- user_id is the link the portal reads, the same lecturer could be attached
-- twice to one module in one term via two different staff_id id-spaces, and
-- every "my courses"/roster query would double-count. NULL user_id rows are
-- unconstrained (MySQL permits unlimited NULLs in a UNIQUE index), so HR-only
-- lecturers with no user account are unaffected.
SET @dups := (SELECT COUNT(*) FROM (
    SELECT 1 FROM `module_assignments`
    WHERE `user_id` IS NOT NULL
    GROUP BY `module_id`, `user_id`, `academic_term_id`
    HAVING COUNT(*) > 1
) d);
SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'module_assignments'
               AND INDEX_NAME = 'uniq_assignment_user');
SET @stmt := IF(@dups = 0 AND @idx = 0,
  'ALTER TABLE `module_assignments` ADD UNIQUE KEY `uniq_assignment_user` (`module_id`, `user_id`, `academic_term_id`)',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §5  ACCESS_TEACHER_PORTAL + teaching-role grants                          ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
-- Gates /api/teacher/* and the teacher dashboard UI.
--
-- A NEW slug rather than reusing VIEW_MY_MODULES, because the `student` role
-- holds VIEW_MY_MODULES too (it is what lets a student browse the catalogue) —
-- gating on it would hand every student a teacher dashboard.
--
-- NOTE: the API gate is TeacherPortalMiddleware, which admits this permission OR
-- an actual module assignment, so a registrar/HR user handed a class reaches the
-- workspace without any RBAC change. This grant simply makes it the default for
-- the two teaching roles.

INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`)
SELECT
    (SELECT `id` FROM `permission_categories` WHERE `name` = 'External Portals' LIMIT 1),
    'Access Teacher Portal',
    'ACCESS_TEACHER_PORTAL',
    'Self-service teaching workspace: my courses, my students, attendance, marks, exams.';

-- category_id is NOT NULL — fall back to any category if 'External Portals'
-- does not exist on this database.
UPDATE `permissions`
SET `category_id` = (SELECT `id` FROM `permission_categories` ORDER BY `id` ASC LIMIT 1)
WHERE `slug` = 'ACCESS_TEACHER_PORTAL' AND (`category_id` IS NULL OR `category_id` = 0);

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
CROSS JOIN `permissions` p
WHERE p.`slug` = 'ACCESS_TEACHER_PORTAL'
  AND r.`name` IN ('lecturer', 'HOD');

-- Round out the HOD role, which teaches but held none of the teaching slugs —
-- a head of department could not open a class list, mark attendance or enter
-- marks for the modules they personally teach.
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
CROSS JOIN `permissions` p
WHERE r.`name` = 'HOD'
  AND p.`slug` IN (
      'VIEW_MY_MODULES', 'VIEW_ATTENDANCE', 'RECORD_ATTENDANCE',
      'VIEW_MODULE_MARKS', 'RECORD_MODULE_MARKS', 'VIEW_EXAMS',
      'VIEW_TIMETABLE', 'VIEW_STUDENTS', 'VIEW_SYSTEM_BASICS'
  );


-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║ §6  Remove the institution-wide dashboard from teaching roles             ║
-- ╚════════════════════════════════════════════════════════════════════════════╝
-- VIEW_DASHBOARD gates exactly one thing — the global admin dashboard:
--   GET /api/admin/dashboard, the /dashboard route, the sidebar entry, and the
--   global-search hit. That page reports institution-wide student totals, is not
--   scoped to the signed-in lecturer, and sits confusingly beside their real
--   dashboard at /teacher.
--
-- Revoking the grant (rather than hiding the nav item) also closes the API and
-- the direct /dashboard URL. Only `lecturer` and `HOD` are touched — admin,
-- registrar, finance and HR keep it; superadmin bypasses permission checks.
--
-- REVERSIBLE: re-grant with
--   INSERT IGNORE INTO role_permissions (role_id, permission_id)
--   SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
--   WHERE p.slug = 'VIEW_DASHBOARD' AND r.name IN ('lecturer','HOD');

DELETE rp
FROM `role_permissions` rp
JOIN `roles` r       ON r.id = rp.role_id
JOIN `permissions` p ON p.id = rp.permission_id
WHERE p.`slug` = 'VIEW_DASHBOARD'
  AND r.`name` IN ('lecturer', 'HOD');


-- ══════════════════════════════════════════════════════════════════════════════
-- END OF CUMULATED MIGRATION 2026-08-10
-- ══════════════════════════════════════════════════════════════════════════════

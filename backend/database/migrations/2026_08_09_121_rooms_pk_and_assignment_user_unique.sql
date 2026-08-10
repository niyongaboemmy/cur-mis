-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 121: Repair `rooms` (no primary key) + protect the canonical
--                lecturer link against duplicates.
-- Date: 2026-08-09
--
-- ── §1  rooms has no PRIMARY KEY and no AUTO_INCREMENT ────────────────────────
--   CREATE TABLE `rooms` (
--     `id` int unsigned NOT NULL,          -- <= no PK, no auto_increment
--     ...
--     KEY `idx_fk_rooms_id` (`id`)         -- <= a plain non-unique index
--   )
-- Consequences: nothing can declare a foreign key to `rooms` (an FK requires a
-- unique/primary key on the parent), and inserting a room requires the caller to
-- invent an id by hand. That matters now that exams carry a `room_id`
-- (migration 119) and exam rooms have to be manageable.
--
-- Safe to promote: verified 4 rows, 4 distinct ids, max id 4 — no duplicates and
-- no NULLs, so the PRIMARY KEY cannot fail on existing data.
--
-- ── §2  module_assignments unique on the canonical link ───────────────────────
-- `uniq_assignment` covers (module_id, staff_id, academic_term_id). Now that
-- `user_id` is the link the teacher portal actually reads, the same lecturer
-- could be attached twice to one module in one term via two different staff_id
-- id-spaces (e.g. once as hr_employees.id and once as USER_OFFSET+users.id),
-- and every "my courses"/roster query would double-count the module.
--
-- NULL user_id rows are unconstrained: MySQL permits unlimited NULLs in a UNIQUE
-- index, so HR-only lecturers with no user account are unaffected.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── §1  rooms: PRIMARY KEY + AUTO_INCREMENT ───────────────────────────────────
SET @haspk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
               WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rooms'
                 AND INDEX_NAME = 'PRIMARY');
SET @stmt := IF(@haspk = 0,
  'ALTER TABLE `rooms` ADD PRIMARY KEY (`id`)',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- AUTO_INCREMENT can only be added once a key exists on the column, and
-- `rooms`.`id` is the parent of at least one foreign key (module_schedules
-- .fk_sched_room), which makes a bare MODIFY fail with:
--   1833 Cannot change column 'id': used in a foreign key constraint
-- Suspending FK checks for the single statement lifts that restriction; the
-- column type is unchanged, so no existing reference is invalidated.
SET @isauto := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rooms'
                  AND COLUMN_NAME = 'id' AND EXTRA LIKE '%auto_increment%');
SET @stmt := IF(@isauto = 0,
  'ALTER TABLE `rooms` MODIFY `id` INT UNSIGNED NOT NULL AUTO_INCREMENT',
  'SELECT 1');
SET FOREIGN_KEY_CHECKS = 0;
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
SET FOREIGN_KEY_CHECKS = 1;

-- The old non-unique helper index is now redundant with the PRIMARY KEY.
SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rooms'
               AND INDEX_NAME = 'idx_fk_rooms_id');
SET @stmt := IF(@idx > 0,
  'ALTER TABLE `rooms` DROP INDEX `idx_fk_rooms_id`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;


-- ── §2  module_assignments: one canonical assignment per lecturer/module/term ──
-- Guarded by a duplicate check so the migration degrades to a no-op rather than
-- failing on a database that already contains conflicting rows.
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

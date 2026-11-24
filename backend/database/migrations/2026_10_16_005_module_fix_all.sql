-- 2026_10_16_005_module_fix_all.sql
--
-- WHY
-- ───
-- The application stores modules in `modules`. On the live database the
-- foreign keys of ten module-linked tables still point at `modules_1`, an
-- older copy. Module ids created after that copy fail with error 1452 when
-- they are linked to a programme, which blocks the course import, and adding
-- a student to them fails ("Enrol to this module" on the marks upload review
-- answered "Server error." for EDU8125, module 1335).
--
-- Fourteen module ids are used by links but missing from `modules`. Their
-- rows still exist in `modules_1`, so this migration repairs them first and
-- then re-points the foreign keys. Nothing is deleted except the two links of
-- the "test101" test module (step 0) and duplicate links that already exist
-- on the target module (see step 3).
--
-- WHAT THIS DOES (in order)
-- ─────────────────────────
-- 0. Delete the level link and programme link of module 1876 "test101", a test
--    module that exists only in `modules_1` and has no marks, registrations or
--    attendance. They are the only rows the guard below does not know about.
-- 1. Work out the IACC 2212 and MECO2221 targets (see step 3), then guard: if a
--    child row references a module id outside the known ids, or a re-point
--    target cannot be found in `modules`, stop and change nothing else.
-- 2. Copy the 7 modules with no code clash (336, 356, 357, 569, 959, 1145,
--    1483) from `modules_1` into `modules` with their original ids.
-- 2b. Drop the module_programs and module_levels keys that still point at
--    `modules_1`. Step 3 moves links onto modules (165, 174, …) that are not
--    in `modules_1`, so the move would fail with 1452 under the old keys.
-- 3. Re-point the duplicate modules to the existing module with the same
--    code, so no new course is created:
--        97   -> 165    (IACC 2212) — 165 was later deleted on live; where it
--                       is gone, the one module left in `modules` with code
--                       IACC2212 is used instead (stop if several). If none
--                       is left at all (live), 97 itself is copied from
--                       `modules_1` in step 2 and keeps its own links.
--        102  -> 170    (MECO2221)  — only where 102 has been deleted from
--                       `modules` and its links were left behind (live, after
--                       this file was first written). Same fallback as 97.
--        106  -> 174    (PRME 2221)
--        173  -> 608    (INEC2222)
--        535  -> 570    (PECO1211)
--        638  -> 353    (DMSS 5312)
--        1055 -> 1419   (CHE8473)
--        1125 -> 1420   (ENT8351)
--    Where the target already has the same programme or level, the duplicate
--    link is deleted first, because the unique keys would otherwise reject the
--    move. On the live data this deletes 4 links, all for module 535, each a
--    copy of a link module 570 already has (module_order is NULL on both).
-- 4. Guard: if any child row still references a module missing from
--    `modules`, stop before changing any foreign key.
-- 5. Re-point the ten foreign keys from `modules_1` to `modules`, keeping the
--    constraint name, column and ON DELETE CASCADE. Each key is dropped (if
--    it still points at `modules_1`) and then added (if missing) in separate
--    statements, so a re-run after a failure finishes the job.
--
-- SAFETY NOTES
-- ────────────
-- - Every step is idempotent. A re-run is a no-op once it has completed.
-- - Guards use error 1146 (table does not exist) on purpose. MigrationService
--   treats 1823 and 1215 as "already applied" and would hide a failure.
-- - The runner does not wrap statements in a transaction. If a statement
--   fails midway, earlier statements stay applied, and a re-run continues.
-- - Take a database backup before running.
--
-- IF IT STOPS WITH "Table 'module_fix_all_blocked_unexpected_rows' doesn't exist"
-- ─────────────────────────────────────────────────────────────────────────────
-- A child row references a module id this migration does not know about.
-- Nothing has been changed apart from step 0. Investigate those rows before
-- re-running.
--
-- IF IT STOPS WITH "Table 'module_fk_repoint_blocked_orphan_rows_exist' doesn't exist"
-- ────────────────────────────────────────────────────────────────────────────────────
-- A child row still references a module missing from `modules` after step 3.
-- Only the two keys of step 2b have been dropped; the other eight are
-- unchanged. Fix the rows, then re-run (it finishes the job). Find them with:
--
-- SELECT 'module_programs' AS tbl, module_id, COUNT(*) AS n FROM module_programs
--   WHERE module_id NOT IN (SELECT module_id FROM modules) GROUP BY module_id;

-- ── 0. Remove the two links of the "test101" test module ───────────────────
-- Only links of module 1876 whose `modules_1` row is code "test101" and which
-- `modules` does not have. Does nothing where `modules_1` does not exist.

SET @has_m1 := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modules_1');

SET @stmt := IF(@has_m1 = 1,
  'DELETE ml FROM `module_levels` ml
     JOIN `modules_1` m1 ON m1.`module_id` = ml.`module_id`
    WHERE ml.`module_id` = 1876 AND LOWER(TRIM(m1.`module_code`)) = ''test101''
      AND NOT EXISTS (SELECT 1 FROM `modules` m WHERE m.`module_id` = 1876)',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @stmt := IF(@has_m1 = 1,
  'DELETE mp FROM `module_programs` mp
     JOIN `modules_1` m1 ON m1.`module_id` = mp.`module_id`
    WHERE mp.`module_id` = 1876 AND LOWER(TRIM(m1.`module_code`)) = ''test101''
      AND NOT EXISTS (SELECT 1 FROM `modules` m WHERE m.`module_id` = 1876)',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ── 1. Resolve the targets, then guard: no unexpected orphans, every target exists

-- IACC 2212: module 165, or else the only module in `modules` with that code.
-- If `modules` has no IACC2212 at all (live: 165 and 1940 were both deleted),
-- keep module 97 itself: step 2 copies it from `modules_1` like the 7 others,
-- and @s97 = -1 so step 3 does not move (or de-duplicate away) its own links.
SET @t97 := IF(EXISTS (SELECT 1 FROM `modules` WHERE `module_id` = 165), 165,
               (SELECT MIN(`module_id`) FROM `modules`
                 WHERE REPLACE(TRIM(`module_code`), ' ', '') = 'IACC2212'
                HAVING COUNT(*) = 1));
SET @copy97 := IF(@t97 IS NULL
                  AND NOT EXISTS (SELECT 1 FROM `modules` WHERE REPLACE(TRIM(`module_code`), ' ', '') = 'IACC2212')
                  AND EXISTS (SELECT 1 FROM `modules_1` WHERE `module_id` = 97), 97, -1);
SET @t97 := IF(@copy97 = 97, 97, @t97);
SET @s97 := IF(@t97 = 97, -1, 97);

-- MECO2221: move module 102's links only where 102 itself is gone from
-- `modules` (-1 matches no row). Target 170, or else the only module left
-- with that code.
SET @s102 := IF(EXISTS (SELECT 1 FROM `modules` WHERE `module_id` = 102), -1, 102);
SET @t102 := IF(EXISTS (SELECT 1 FROM `modules` WHERE `module_id` = 170), 170,
               (SELECT MIN(`module_id`) FROM `modules`
                 WHERE REPLACE(TRIM(`module_code`), ' ', '') = 'MECO2221'
                HAVING COUNT(*) = 1));

SET @unexpected := (
    (SELECT COUNT(*) FROM `attendance_sessions`  WHERE `module_id` NOT IN (SELECT `module_id` FROM `modules`) AND `module_id` NOT IN (336,356,357,569,959,1145,1483,97,106,173,535,638,1055,1125,102))
  + (SELECT COUNT(*) FROM `module_assignments`   WHERE `module_id` NOT IN (SELECT `module_id` FROM `modules`) AND `module_id` NOT IN (336,356,357,569,959,1145,1483,97,106,173,535,638,1055,1125,102))
  + (SELECT COUNT(*) FROM `module_levels`        WHERE `module_id` NOT IN (SELECT `module_id` FROM `modules`) AND `module_id` NOT IN (336,356,357,569,959,1145,1483,97,106,173,535,638,1055,1125,102))
  + (SELECT COUNT(*) FROM `module_marks_archive` WHERE `module_id` NOT IN (SELECT `module_id` FROM `modules`) AND `module_id` NOT IN (336,356,357,569,959,1145,1483,97,106,173,535,638,1055,1125,102))
  + (SELECT COUNT(*) FROM `module_offerings`     WHERE `module_id` NOT IN (SELECT `module_id` FROM `modules`) AND `module_id` NOT IN (336,356,357,569,959,1145,1483,97,106,173,535,638,1055,1125,102))
  + (SELECT COUNT(*) FROM `module_prerequisites` WHERE `module_id` NOT IN (SELECT `module_id` FROM `modules`) AND `module_id` NOT IN (336,356,357,569,959,1145,1483,97,106,173,535,638,1055,1125,102))
  + (SELECT COUNT(*) FROM `module_prerequisites` WHERE `prerequisite_module_id` NOT IN (SELECT `module_id` FROM `modules`) AND `prerequisite_module_id` NOT IN (336,356,357,569,959,1145,1483,97,106,173,535,638,1055,1125,102))
  + (SELECT COUNT(*) FROM `module_programs`      WHERE `module_id` NOT IN (SELECT `module_id` FROM `modules`) AND `module_id` NOT IN (336,356,357,569,959,1145,1483,97,106,173,535,638,1055,1125,102))
  + (SELECT COUNT(*) FROM `module_registrations` WHERE `module_id` NOT IN (SELECT `module_id` FROM `modules`) AND `module_id` NOT IN (336,356,357,569,959,1145,1483,97,106,173,535,638,1055,1125,102))
  + (SELECT COUNT(*) FROM `module_schedules`     WHERE `module_id` NOT IN (SELECT `module_id` FROM `modules`) AND `module_id` NOT IN (336,356,357,569,959,1145,1483,97,106,173,535,638,1055,1125,102))
);

SET @missing_target := (
    SELECT COUNT(*) FROM (SELECT 174 AS id UNION ALL SELECT 608 UNION ALL SELECT 570
                          UNION ALL SELECT 353 UNION ALL SELECT 1419 UNION ALL SELECT 1420) t
    WHERE t.id NOT IN (SELECT `module_id` FROM `modules`)
) + (@t97 IS NULL) + (@s102 = 102 AND @t102 IS NULL);

SET @abort := IF(@unexpected > 0 OR @missing_target > 0,
  'SELECT 1 FROM `module_fix_all_blocked_unexpected_rows`',
  'SELECT 1');
PREPARE s FROM @abort; EXECUTE s; DEALLOCATE PREPARE s;

-- ── 2. Copy the 7 modules with no code clash from modules_1 (plus 97, see step 1)

INSERT INTO `modules`
    (`module_id`, `module_name`, `module_code`, `module_credits`, `department`,
     `d_option`, `level`, `hours`, `price`, `author`, `school_id`, `status`)
SELECT `module_id`, `module_name`, `module_code`, `module_credits`, `department`,
       `d_option`, `level`, `hours`, `price`, `author`, `school_id`, `status`
FROM `modules_1`
WHERE `module_id` IN (336, 356, 357, 569, 959, 1145, 1483, @copy97)
  AND `module_id` NOT IN (SELECT `module_id` FROM `modules`);

-- ── 2b. Release the two keys that step 3 moves rows under ─────────────────
-- Step 3 moves links onto modules (165, 174, 608, …) that exist in `modules`
-- but not in `modules_1`. While these keys still point at `modules_1` that
-- move fails with 1452, so drop them here; step 5 adds them back on `modules`.

SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'module_levels'
              AND CONSTRAINT_NAME = 'fk_ml_module' AND REFERENCED_TABLE_NAME = 'modules_1');
SET @stmt := IF(@fk = 1, 'ALTER TABLE `module_levels` DROP FOREIGN KEY `fk_ml_module`', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'module_programs'
              AND CONSTRAINT_NAME = 'fk_mp_module' AND REFERENCED_TABLE_NAME = 'modules_1');
SET @stmt := IF(@fk = 1, 'ALTER TABLE `module_programs` DROP FOREIGN KEY `fk_mp_module`', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ── 3. Re-point the 7 duplicate modules to the existing module with the same code

-- 97 -> @t97 (IACC 2212: 165, or the one module left with that code;
-- @s97 is -1 where 97 is kept as the IACC 2212 module, so nothing moves)
DELETE FROM `module_programs` WHERE `module_id` = @s97 AND `option_id` IN (SELECT `option_id` FROM (SELECT `option_id` FROM `module_programs` WHERE `module_id` = @t97) t);
UPDATE `module_programs` SET `module_id` = @t97 WHERE `module_id` = @s97;
DELETE FROM `module_levels` WHERE `module_id` = @s97 AND `level_id` IN (SELECT `level_id` FROM (SELECT `level_id` FROM `module_levels` WHERE `module_id` = @t97) t);
UPDATE `module_levels` SET `module_id` = @t97 WHERE `module_id` = @s97;

-- 106 -> 174 (PRME 2221)
DELETE FROM `module_programs` WHERE `module_id` = 106 AND `option_id` IN (SELECT `option_id` FROM (SELECT `option_id` FROM `module_programs` WHERE `module_id` = 174) t);
UPDATE `module_programs` SET `module_id` = 174 WHERE `module_id` = 106;
DELETE FROM `module_levels` WHERE `module_id` = 106 AND `level_id` IN (SELECT `level_id` FROM (SELECT `level_id` FROM `module_levels` WHERE `module_id` = 174) t);
UPDATE `module_levels` SET `module_id` = 174 WHERE `module_id` = 106;

-- 173 -> 608 (INEC2222)
DELETE FROM `module_programs` WHERE `module_id` = 173 AND `option_id` IN (SELECT `option_id` FROM (SELECT `option_id` FROM `module_programs` WHERE `module_id` = 608) t);
UPDATE `module_programs` SET `module_id` = 608 WHERE `module_id` = 173;
DELETE FROM `module_levels` WHERE `module_id` = 173 AND `level_id` IN (SELECT `level_id` FROM (SELECT `level_id` FROM `module_levels` WHERE `module_id` = 608) t);
UPDATE `module_levels` SET `module_id` = 608 WHERE `module_id` = 173;

-- 535 -> 570 (PECO1211)
DELETE FROM `module_programs` WHERE `module_id` = 535 AND `option_id` IN (SELECT `option_id` FROM (SELECT `option_id` FROM `module_programs` WHERE `module_id` = 570) t);
UPDATE `module_programs` SET `module_id` = 570 WHERE `module_id` = 535;
DELETE FROM `module_levels` WHERE `module_id` = 535 AND `level_id` IN (SELECT `level_id` FROM (SELECT `level_id` FROM `module_levels` WHERE `module_id` = 570) t);
UPDATE `module_levels` SET `module_id` = 570 WHERE `module_id` = 535;

-- 638 -> 353 (DMSS 5312)
DELETE FROM `module_programs` WHERE `module_id` = 638 AND `option_id` IN (SELECT `option_id` FROM (SELECT `option_id` FROM `module_programs` WHERE `module_id` = 353) t);
UPDATE `module_programs` SET `module_id` = 353 WHERE `module_id` = 638;
DELETE FROM `module_levels` WHERE `module_id` = 638 AND `level_id` IN (SELECT `level_id` FROM (SELECT `level_id` FROM `module_levels` WHERE `module_id` = 353) t);
UPDATE `module_levels` SET `module_id` = 353 WHERE `module_id` = 638;

-- 1055 -> 1419 (CHE8473)
DELETE FROM `module_programs` WHERE `module_id` = 1055 AND `option_id` IN (SELECT `option_id` FROM (SELECT `option_id` FROM `module_programs` WHERE `module_id` = 1419) t);
UPDATE `module_programs` SET `module_id` = 1419 WHERE `module_id` = 1055;
DELETE FROM `module_levels` WHERE `module_id` = 1055 AND `level_id` IN (SELECT `level_id` FROM (SELECT `level_id` FROM `module_levels` WHERE `module_id` = 1419) t);
UPDATE `module_levels` SET `module_id` = 1419 WHERE `module_id` = 1055;

-- 1125 -> 1420 (ENT8351)
DELETE FROM `module_programs` WHERE `module_id` = 1125 AND `option_id` IN (SELECT `option_id` FROM (SELECT `option_id` FROM `module_programs` WHERE `module_id` = 1420) t);
UPDATE `module_programs` SET `module_id` = 1420 WHERE `module_id` = 1125;
DELETE FROM `module_levels` WHERE `module_id` = 1125 AND `level_id` IN (SELECT `level_id` FROM (SELECT `level_id` FROM `module_levels` WHERE `module_id` = 1420) t);
UPDATE `module_levels` SET `module_id` = 1420 WHERE `module_id` = 1125;

-- 102 -> @t102 (MECO2221: 170, or the one module left with that code).
-- @s102 is -1 where module 102 still exists, so nothing moves there.
DELETE FROM `module_programs` WHERE `module_id` = @s102 AND `option_id` IN (SELECT `option_id` FROM (SELECT `option_id` FROM `module_programs` WHERE `module_id` = @t102) t);
UPDATE `module_programs` SET `module_id` = @t102 WHERE `module_id` = @s102;
DELETE FROM `module_levels` WHERE `module_id` = @s102 AND `level_id` IN (SELECT `level_id` FROM (SELECT `level_id` FROM `module_levels` WHERE `module_id` = @t102) t);
UPDATE `module_levels` SET `module_id` = @t102 WHERE `module_id` = @s102;

-- ── 4. Guard: no orphans left before the foreign keys change ────────────────

SET @orphans := (
    (SELECT COUNT(*) FROM `attendance_sessions`   WHERE `module_id` IS NOT NULL AND `module_id` NOT IN (SELECT `module_id` FROM `modules`))
  + (SELECT COUNT(*) FROM `module_assignments`    WHERE `module_id` IS NOT NULL AND `module_id` NOT IN (SELECT `module_id` FROM `modules`))
  + (SELECT COUNT(*) FROM `module_levels`         WHERE `module_id` IS NOT NULL AND `module_id` NOT IN (SELECT `module_id` FROM `modules`))
  + (SELECT COUNT(*) FROM `module_marks_archive`  WHERE `module_id` IS NOT NULL AND `module_id` NOT IN (SELECT `module_id` FROM `modules`))
  + (SELECT COUNT(*) FROM `module_offerings`      WHERE `module_id` IS NOT NULL AND `module_id` NOT IN (SELECT `module_id` FROM `modules`))
  + (SELECT COUNT(*) FROM `module_prerequisites`  WHERE `module_id` IS NOT NULL AND `module_id` NOT IN (SELECT `module_id` FROM `modules`))
  + (SELECT COUNT(*) FROM `module_prerequisites`  WHERE `prerequisite_module_id` IS NOT NULL AND `prerequisite_module_id` NOT IN (SELECT `module_id` FROM `modules`))
  + (SELECT COUNT(*) FROM `module_programs`       WHERE `module_id` IS NOT NULL AND `module_id` NOT IN (SELECT `module_id` FROM `modules`))
  + (SELECT COUNT(*) FROM `module_registrations`  WHERE `module_id` IS NOT NULL AND `module_id` NOT IN (SELECT `module_id` FROM `modules`))
  + (SELECT COUNT(*) FROM `module_schedules`      WHERE `module_id` IS NOT NULL AND `module_id` NOT IN (SELECT `module_id` FROM `modules`))
);

SET @abort := IF(@orphans > 0,
  'SELECT 1 FROM `module_fk_repoint_blocked_orphan_rows_exist`',
  'SELECT 1');
PREPARE s FROM @abort; EXECUTE s; DEALLOCATE PREPARE s;

-- ── 5. Re-point each foreign key from modules_1 to modules ──────────────────
-- Drop and add are separate statements (MariaDB and MySQL 8 both accept that);
-- each half is skipped once done, so a re-run after a failure picks up here.

-- attendance_sessions.fk_sess_module
SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_sessions'
              AND CONSTRAINT_NAME = 'fk_sess_module' AND REFERENCED_TABLE_NAME = 'modules_1');
SET @stmt := IF(@fk = 1, 'ALTER TABLE `attendance_sessions` DROP FOREIGN KEY `fk_sess_module`', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_sessions'
              AND CONSTRAINT_NAME = 'fk_sess_module');
SET @stmt := IF(@fk = 0,
  'ALTER TABLE `attendance_sessions` ADD CONSTRAINT `fk_sess_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- module_assignments.fk_asgn_module
SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'module_assignments'
              AND CONSTRAINT_NAME = 'fk_asgn_module' AND REFERENCED_TABLE_NAME = 'modules_1');
SET @stmt := IF(@fk = 1, 'ALTER TABLE `module_assignments` DROP FOREIGN KEY `fk_asgn_module`', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'module_assignments'
              AND CONSTRAINT_NAME = 'fk_asgn_module');
SET @stmt := IF(@fk = 0,
  'ALTER TABLE `module_assignments` ADD CONSTRAINT `fk_asgn_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- module_levels.fk_ml_module
SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'module_levels'
              AND CONSTRAINT_NAME = 'fk_ml_module' AND REFERENCED_TABLE_NAME = 'modules_1');
SET @stmt := IF(@fk = 1, 'ALTER TABLE `module_levels` DROP FOREIGN KEY `fk_ml_module`', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'module_levels'
              AND CONSTRAINT_NAME = 'fk_ml_module');
SET @stmt := IF(@fk = 0,
  'ALTER TABLE `module_levels` ADD CONSTRAINT `fk_ml_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- module_marks_archive.fk_marks_module
SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'module_marks_archive'
              AND CONSTRAINT_NAME = 'fk_marks_module' AND REFERENCED_TABLE_NAME = 'modules_1');
SET @stmt := IF(@fk = 1, 'ALTER TABLE `module_marks_archive` DROP FOREIGN KEY `fk_marks_module`', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'module_marks_archive'
              AND CONSTRAINT_NAME = 'fk_marks_module');
SET @stmt := IF(@fk = 0,
  'ALTER TABLE `module_marks_archive` ADD CONSTRAINT `fk_marks_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- module_offerings.fk_mo_module
SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'module_offerings'
              AND CONSTRAINT_NAME = 'fk_mo_module' AND REFERENCED_TABLE_NAME = 'modules_1');
SET @stmt := IF(@fk = 1, 'ALTER TABLE `module_offerings` DROP FOREIGN KEY `fk_mo_module`', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'module_offerings'
              AND CONSTRAINT_NAME = 'fk_mo_module');
SET @stmt := IF(@fk = 0,
  'ALTER TABLE `module_offerings` ADD CONSTRAINT `fk_mo_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- module_prerequisites.fk_prereq_module
SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'module_prerequisites'
              AND CONSTRAINT_NAME = 'fk_prereq_module' AND REFERENCED_TABLE_NAME = 'modules_1');
SET @stmt := IF(@fk = 1, 'ALTER TABLE `module_prerequisites` DROP FOREIGN KEY `fk_prereq_module`', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'module_prerequisites'
              AND CONSTRAINT_NAME = 'fk_prereq_module');
SET @stmt := IF(@fk = 0,
  'ALTER TABLE `module_prerequisites` ADD CONSTRAINT `fk_prereq_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- module_prerequisites.fk_prereq_required
SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'module_prerequisites'
              AND CONSTRAINT_NAME = 'fk_prereq_required' AND REFERENCED_TABLE_NAME = 'modules_1');
SET @stmt := IF(@fk = 1, 'ALTER TABLE `module_prerequisites` DROP FOREIGN KEY `fk_prereq_required`', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'module_prerequisites'
              AND CONSTRAINT_NAME = 'fk_prereq_required');
SET @stmt := IF(@fk = 0,
  'ALTER TABLE `module_prerequisites` ADD CONSTRAINT `fk_prereq_required` FOREIGN KEY (`prerequisite_module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- module_programs.fk_mp_module
SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'module_programs'
              AND CONSTRAINT_NAME = 'fk_mp_module' AND REFERENCED_TABLE_NAME = 'modules_1');
SET @stmt := IF(@fk = 1, 'ALTER TABLE `module_programs` DROP FOREIGN KEY `fk_mp_module`', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'module_programs'
              AND CONSTRAINT_NAME = 'fk_mp_module');
SET @stmt := IF(@fk = 0,
  'ALTER TABLE `module_programs` ADD CONSTRAINT `fk_mp_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- module_registrations.fk_reg_module
SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'module_registrations'
              AND CONSTRAINT_NAME = 'fk_reg_module' AND REFERENCED_TABLE_NAME = 'modules_1');
SET @stmt := IF(@fk = 1, 'ALTER TABLE `module_registrations` DROP FOREIGN KEY `fk_reg_module`', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'module_registrations'
              AND CONSTRAINT_NAME = 'fk_reg_module');
SET @stmt := IF(@fk = 0,
  'ALTER TABLE `module_registrations` ADD CONSTRAINT `fk_reg_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- module_schedules.fk_sched_module
SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'module_schedules'
              AND CONSTRAINT_NAME = 'fk_sched_module' AND REFERENCED_TABLE_NAME = 'modules_1');
SET @stmt := IF(@fk = 1, 'ALTER TABLE `module_schedules` DROP FOREIGN KEY `fk_sched_module`', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;
SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'module_schedules'
              AND CONSTRAINT_NAME = 'fk_sched_module');
SET @stmt := IF(@fk = 0,
  'ALTER TABLE `module_schedules` ADD CONSTRAINT `fk_sched_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

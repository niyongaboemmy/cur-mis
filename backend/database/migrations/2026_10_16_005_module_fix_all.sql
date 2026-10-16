-- 2026_10_16_005_module_fix_all.sql
--
-- WHY
-- ───
-- The application stores modules in `modules`. On the live database the
-- foreign keys of ten module-linked tables still point at `modules_1`, an
-- older copy. Module ids created after that copy fail with error 1452 when
-- they are linked to a programme, which blocks the course import.
--
-- Fourteen module ids are used by links but missing from `modules`. Their
-- rows still exist in `modules_1`, so this migration repairs them first and
-- then re-points the foreign keys. Nothing is deleted except duplicate links
-- that already exist on the target module (see step 3).
--
-- WHAT THIS DOES (in order)
-- ─────────────────────────
-- 1. Guard: if a child row references a module id outside the 14 known ids,
--    or a re-point target is missing from `modules`, stop and change NOTHING.
-- 2. Copy the 7 modules with no code clash (336, 356, 357, 569, 959, 1145,
--    1483) from `modules_1` into `modules` with their original ids.
-- 3. Re-point the 7 duplicate modules to the existing module with the same
--    code, so no new course is created:
--        97   -> 165    (IACC 2212)
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
--    constraint name, column and ON DELETE CASCADE.
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
-- Nothing has been changed. Investigate those rows before re-running.
--
-- IF IT STOPS WITH "Table 'module_fk_repoint_blocked_orphan_rows_exist' doesn't exist"
-- ────────────────────────────────────────────────────────────────────────────────────
-- A child row still references a module missing from `modules` after step 3.
-- The foreign keys have not been changed. Find the rows with:
--
-- SELECT 'module_programs' AS tbl, module_id, COUNT(*) AS n FROM module_programs
--   WHERE module_id NOT IN (SELECT module_id FROM modules) GROUP BY module_id;

-- ── 1. Guard: no unexpected orphans, every target exists ────────────────────

SET @unexpected := (
    (SELECT COUNT(*) FROM `attendance_sessions`  WHERE `module_id` NOT IN (SELECT `module_id` FROM `modules`) AND `module_id` NOT IN (336,356,357,569,959,1145,1483,97,106,173,535,638,1055,1125))
  + (SELECT COUNT(*) FROM `module_assignments`   WHERE `module_id` NOT IN (SELECT `module_id` FROM `modules`) AND `module_id` NOT IN (336,356,357,569,959,1145,1483,97,106,173,535,638,1055,1125))
  + (SELECT COUNT(*) FROM `module_levels`        WHERE `module_id` NOT IN (SELECT `module_id` FROM `modules`) AND `module_id` NOT IN (336,356,357,569,959,1145,1483,97,106,173,535,638,1055,1125))
  + (SELECT COUNT(*) FROM `module_marks_archive` WHERE `module_id` NOT IN (SELECT `module_id` FROM `modules`) AND `module_id` NOT IN (336,356,357,569,959,1145,1483,97,106,173,535,638,1055,1125))
  + (SELECT COUNT(*) FROM `module_offerings`     WHERE `module_id` NOT IN (SELECT `module_id` FROM `modules`) AND `module_id` NOT IN (336,356,357,569,959,1145,1483,97,106,173,535,638,1055,1125))
  + (SELECT COUNT(*) FROM `module_prerequisites` WHERE `module_id` NOT IN (SELECT `module_id` FROM `modules`) AND `module_id` NOT IN (336,356,357,569,959,1145,1483,97,106,173,535,638,1055,1125))
  + (SELECT COUNT(*) FROM `module_prerequisites` WHERE `prerequisite_module_id` NOT IN (SELECT `module_id` FROM `modules`) AND `prerequisite_module_id` NOT IN (336,356,357,569,959,1145,1483,97,106,173,535,638,1055,1125))
  + (SELECT COUNT(*) FROM `module_programs`      WHERE `module_id` NOT IN (SELECT `module_id` FROM `modules`) AND `module_id` NOT IN (336,356,357,569,959,1145,1483,97,106,173,535,638,1055,1125))
  + (SELECT COUNT(*) FROM `module_registrations` WHERE `module_id` NOT IN (SELECT `module_id` FROM `modules`) AND `module_id` NOT IN (336,356,357,569,959,1145,1483,97,106,173,535,638,1055,1125))
  + (SELECT COUNT(*) FROM `module_schedules`     WHERE `module_id` NOT IN (SELECT `module_id` FROM `modules`) AND `module_id` NOT IN (336,356,357,569,959,1145,1483,97,106,173,535,638,1055,1125))
);

SET @missing_target := (
    SELECT COUNT(*) FROM (SELECT 165 AS id UNION ALL SELECT 174 UNION ALL SELECT 608 UNION ALL SELECT 570
                          UNION ALL SELECT 353 UNION ALL SELECT 1419 UNION ALL SELECT 1420) t
    WHERE t.id NOT IN (SELECT `module_id` FROM `modules`)
);

SET @abort := IF(@unexpected > 0 OR @missing_target > 0,
  'SELECT 1 FROM `module_fix_all_blocked_unexpected_rows`',
  'SELECT 1');
PREPARE s FROM @abort; EXECUTE s; DEALLOCATE PREPARE s;

-- ── 2. Copy the 7 modules with no code clash from modules_1 ─────────────────

INSERT INTO `modules`
    (`module_id`, `module_name`, `module_code`, `module_credits`, `department`,
     `d_option`, `level`, `hours`, `price`, `author`, `school_id`, `status`)
SELECT `module_id`, `module_name`, `module_code`, `module_credits`, `department`,
       `d_option`, `level`, `hours`, `price`, `author`, `school_id`, `status`
FROM `modules_1`
WHERE `module_id` IN (336, 356, 357, 569, 959, 1145, 1483)
  AND `module_id` NOT IN (SELECT `module_id` FROM `modules`);

-- ── 3. Re-point the 7 duplicate modules to the existing module with the same code

-- 97 -> 165 (IACC 2212)
DELETE FROM `module_programs` WHERE `module_id` = 97 AND `option_id` IN (SELECT `option_id` FROM (SELECT `option_id` FROM `module_programs` WHERE `module_id` = 165) t);
UPDATE `module_programs` SET `module_id` = 165 WHERE `module_id` = 97;
DELETE FROM `module_levels` WHERE `module_id` = 97 AND `level_id` IN (SELECT `level_id` FROM (SELECT `level_id` FROM `module_levels` WHERE `module_id` = 165) t);
UPDATE `module_levels` SET `module_id` = 165 WHERE `module_id` = 97;

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

SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_sessions'
              AND CONSTRAINT_NAME = 'fk_sess_module' AND REFERENCED_TABLE_NAME = 'modules_1');
SET @stmt := IF(@fk = 1,
  'ALTER TABLE `attendance_sessions` DROP FOREIGN KEY `fk_sess_module`, ADD CONSTRAINT `fk_sess_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'module_assignments'
              AND CONSTRAINT_NAME = 'fk_asgn_module' AND REFERENCED_TABLE_NAME = 'modules_1');
SET @stmt := IF(@fk = 1,
  'ALTER TABLE `module_assignments` DROP FOREIGN KEY `fk_asgn_module`, ADD CONSTRAINT `fk_asgn_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'module_levels'
              AND CONSTRAINT_NAME = 'fk_ml_module' AND REFERENCED_TABLE_NAME = 'modules_1');
SET @stmt := IF(@fk = 1,
  'ALTER TABLE `module_levels` DROP FOREIGN KEY `fk_ml_module`, ADD CONSTRAINT `fk_ml_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'module_marks_archive'
              AND CONSTRAINT_NAME = 'fk_marks_module' AND REFERENCED_TABLE_NAME = 'modules_1');
SET @stmt := IF(@fk = 1,
  'ALTER TABLE `module_marks_archive` DROP FOREIGN KEY `fk_marks_module`, ADD CONSTRAINT `fk_marks_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'module_offerings'
              AND CONSTRAINT_NAME = 'fk_mo_module' AND REFERENCED_TABLE_NAME = 'modules_1');
SET @stmt := IF(@fk = 1,
  'ALTER TABLE `module_offerings` DROP FOREIGN KEY `fk_mo_module`, ADD CONSTRAINT `fk_mo_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'module_prerequisites'
              AND CONSTRAINT_NAME = 'fk_prereq_module' AND REFERENCED_TABLE_NAME = 'modules_1');
SET @stmt := IF(@fk = 1,
  'ALTER TABLE `module_prerequisites` DROP FOREIGN KEY `fk_prereq_module`, ADD CONSTRAINT `fk_prereq_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'module_prerequisites'
              AND CONSTRAINT_NAME = 'fk_prereq_required' AND REFERENCED_TABLE_NAME = 'modules_1');
SET @stmt := IF(@fk = 1,
  'ALTER TABLE `module_prerequisites` DROP FOREIGN KEY `fk_prereq_required`, ADD CONSTRAINT `fk_prereq_required` FOREIGN KEY (`prerequisite_module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'module_programs'
              AND CONSTRAINT_NAME = 'fk_mp_module' AND REFERENCED_TABLE_NAME = 'modules_1');
SET @stmt := IF(@fk = 1,
  'ALTER TABLE `module_programs` DROP FOREIGN KEY `fk_mp_module`, ADD CONSTRAINT `fk_mp_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'module_registrations'
              AND CONSTRAINT_NAME = 'fk_reg_module' AND REFERENCED_TABLE_NAME = 'modules_1');
SET @stmt := IF(@fk = 1,
  'ALTER TABLE `module_registrations` DROP FOREIGN KEY `fk_reg_module`, ADD CONSTRAINT `fk_reg_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'module_schedules'
              AND CONSTRAINT_NAME = 'fk_sched_module' AND REFERENCED_TABLE_NAME = 'modules_1');
SET @stmt := IF(@fk = 1,
  'ALTER TABLE `module_schedules` DROP FOREIGN KEY `fk_sched_module`, ADD CONSTRAINT `fk_sched_module` FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

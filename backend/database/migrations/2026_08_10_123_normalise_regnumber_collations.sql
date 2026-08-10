-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 123: Align every student registration-number column on one collation.
-- Date: 2026-08-10
--
-- SYMPTOM
--   GET /api/teacher/courses/:id/students returned {"success":false,
--   "message":"Server error."} on production while the sibling endpoint
--   GET /api/teacher/courses/:id (the course header) worked fine.
--
-- CAUSE
--   The class list is the only one of the pair that JOINs `student`:
--       LEFT JOIN `student` s ON s.regnumber = r.student_regnumber
--   When `student`.`regnumber` and `module_registrations`.`student_regnumber`
--   carry different collations MySQL/MariaDB refuses the comparison outright:
--       ERROR 1267 Illegal mix of collations
--         (utf8mb4_unicode_ci,IMPLICIT) and (utf8mb4_general_ci,IMPLICIT)
--         for operation '='
--   Reproduced exactly against a scratch schema with the two columns split
--   across utf8mb4_unicode_ci / utf8mb4_general_ci.
--
--   Migrations 2026_07_09_092 and 2026_08_02_116 normalise collations broadly,
--   but any table restored from an older dump — or created after those ran —
--   drifts back. This migration pins just the regnumber columns, which are the
--   ones joined across tables on every roster, mark sheet and attendance query.
--
-- TARGET
--   utf8mb4_general_ci, matching `student`.`regnumber` on a healthy database
--   and the collation the application's other regnumber columns already use.
--
-- SAFETY
--   Registration numbers are ASCII ("1CUR24AK08073", "STD/2026/23006"), so a
--   collation change cannot alter comparison results or truncate data. Each
--   ALTER is guarded so it only runs when that column actually differs, which
--   keeps this a no-op on a database that is already consistent and makes it
--   safe to re-run.
--
--   The application also applies an explicit COLLATE to these joins, so it
--   works with or without this migration — but running it restores index usage
--   on `student`.`idx_fk_regnumber`, which an explicit COLLATE suppresses.
-- ══════════════════════════════════════════════════════════════════════════════

-- `ALTER TABLE ... MODIFY` rebuilds every row, which forces the server to
-- re-validate existing values against the CURRENT session sql_mode — legacy
-- rows holding `0000-00-00` dates (accepted under an older, looser mode when
-- they were written) then fail with "1292 Incorrect date value" even though
-- this migration only touches a character column. Relax just the modes that
-- reject already-stored zero-dates for this session; restored at the end.
-- Same reasoning, same idiom as 2026_07_09_092.
SET @_orig_sql_mode := @@SESSION.sql_mode;
SET SESSION sql_mode = (
  SELECT REPLACE(REPLACE(REPLACE(@@SESSION.sql_mode,
    'STRICT_TRANS_TABLES', ''), 'NO_ZERO_DATE', ''), 'NO_ZERO_IN_DATE', '')
);

-- ── student.regnumber ─────────────────────────────────────────────────────────
SET @coll := (SELECT COLLATION_NAME FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student'
                AND COLUMN_NAME = 'regnumber');
SET @type := (SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student'
                AND COLUMN_NAME = 'regnumber');
SET @stmt := IF(@coll IS NOT NULL AND @coll <> 'utf8mb4_general_ci',
  CONCAT('ALTER TABLE `student` MODIFY `regnumber` ', @type,
         ' CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci'),
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;


-- ── module_registrations.student_regnumber ────────────────────────────────────
SET @coll := (SELECT COLLATION_NAME FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'module_registrations'
                AND COLUMN_NAME = 'student_regnumber');
SET @type := (SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'module_registrations'
                AND COLUMN_NAME = 'student_regnumber');
SET @stmt := IF(@coll IS NOT NULL AND @coll <> 'utf8mb4_general_ci',
  CONCAT('ALTER TABLE `module_registrations` MODIFY `student_regnumber` ', @type,
         ' CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL'),
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;


-- ── module_marks.student_regnumber ────────────────────────────────────────────
SET @coll := (SELECT COLLATION_NAME FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'module_marks'
                AND COLUMN_NAME = 'student_regnumber');
SET @type := (SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'module_marks'
                AND COLUMN_NAME = 'student_regnumber');
SET @stmt := IF(@coll IS NOT NULL AND @coll <> 'utf8mb4_general_ci',
  CONCAT('ALTER TABLE `module_marks` MODIFY `student_regnumber` ', @type,
         ' CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL'),
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;


-- ── attendance_records.student_regnumber ──────────────────────────────────────
SET @coll := (SELECT COLLATION_NAME FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_records'
                AND COLUMN_NAME = 'student_regnumber');
SET @type := (SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_records'
                AND COLUMN_NAME = 'student_regnumber');
SET @stmt := IF(@coll IS NOT NULL AND @coll <> 'utf8mb4_general_ci',
  CONCAT('ALTER TABLE `attendance_records` MODIFY `student_regnumber` ', @type,
         ' CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL'),
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;


-- ── exam_attendance.student_regnumber (created by migration 119) ──────────────
SET @coll := (SELECT COLLATION_NAME FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exam_attendance'
                AND COLUMN_NAME = 'student_regnumber');
SET @type := (SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exam_attendance'
                AND COLUMN_NAME = 'student_regnumber');
SET @stmt := IF(@coll IS NOT NULL AND @coll <> 'utf8mb4_general_ci',
  CONCAT('ALTER TABLE `exam_attendance` MODIFY `student_regnumber` ', @type,
         ' CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL'),
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;


-- ── Restore the caller's sql_mode ─────────────────────────────────────────────
SET SESSION sql_mode = @_orig_sql_mode;

-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 154: merge the duplicate catalogue rows, and stop making more.
-- Date: 2026-08-29
--
-- WHY
-- ───
-- The Modules / Courses list shows the same course many times over — nine
-- identical "CCU8111 General English" rows on live. They are genuinely
-- separate `modules` rows, so no amount of DISTINCT in the list query can
-- collapse them.
--
-- They come from the importer. It looks a module up with
-- `TRIM(module_code) = ?`, and MySQL's TRIM strips ONLY spaces — not tabs and
-- not non-breaking spaces. 113 catalogue codes carry exactly those
-- characters ("EDU8112<TAB>"), so every re-import failed to match, fell
-- through to the INSERT branch, and added one more copy of the same course.
--
-- WHAT THIS DOES
-- ──────────────
--  1. Normalises every module code: tabs and non-breaking spaces become
--     ordinary spaces, runs of whitespace collapse, ends are trimmed.
--  2. Groups the catalogue by normalised identity (code without spaces,
--     upper-cased — the same identity transcripts already de-duplicate on)
--     and elects ONE canonical row per group: the one carrying the most
--     marks, then the most programme links, then the lowest id. The row the
--     institution's data actually hangs off wins.
--  3. Re-points every reference — marks, registrations, programmes, levels,
--     schedules, assignments, prerequisites, offerings, attendance, exams,
--     invoices — from the duplicates onto that canonical row. Where a unique
--     key makes a move impossible the row is already represented on the
--     canonical module, so the duplicate is dropped rather than kept.
--  4. Records every old→canonical pair in `module_id_map`, so anything still
--     holding an old id (the legacy `marks` table) resolves correctly.
--  5. Deletes the surplus catalogue rows.
--
-- No mark is lost: marks move to the canonical module before anything is
-- deleted, and `module_marks` has no unique key that could reject a move.
--
-- Idempotent — safe to re-run; a second run finds no duplicates to merge.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Normalise the codes that caused this ─────────────────────────────────
UPDATE `modules`
   SET `module_code` = REPLACE(`module_code`, CONVERT(UNHEX('C2A0') USING utf8mb4), ' ')
 WHERE HEX(`module_code`) LIKE '%C2A0%';

UPDATE `modules`
   SET `module_code` = TRIM(REGEXP_REPLACE(`module_code`, '[[:space:]]+', ' '))
 WHERE BINARY `module_code` <> BINARY TRIM(REGEXP_REPLACE(`module_code`, '[[:space:]]+', ' '));

-- Names carry the same rubbish and print on transcripts.
UPDATE `modules`
   SET `module_name` = TRIM(REGEXP_REPLACE(REPLACE(`module_name`, CONVERT(UNHEX('C2A0') USING utf8mb4), ' '), '[[:space:]]+', ' '))
 WHERE BINARY `module_name` <> BINARY TRIM(REGEXP_REPLACE(REPLACE(`module_name`, CONVERT(UNHEX('C2A0') USING utf8mb4), ' '), '[[:space:]]+', ' '));

-- ── 2. Elect a canonical row per identity ───────────────────────────────────
DROP TABLE IF EXISTS `_md_rank`;
DROP TABLE IF EXISTS `_md_canon`;
DROP TABLE IF EXISTS `_md_merge`;

CREATE TABLE `_md_rank` (
  `module_id` INT(11) NOT NULL,
  `ident` VARCHAR(80) COLLATE utf8mb4_general_ci NOT NULL,
  `marks` INT NOT NULL,
  `progs` INT NOT NULL,
  PRIMARY KEY (`module_id`),
  KEY `idx_md_rank_ident` (`ident`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
AS SELECT m.`module_id`,
          UPPER(REPLACE(m.`module_code`, ' ', '')) AS ident,
          (SELECT COUNT(*) FROM `module_marks`    x WHERE x.`module_id` = m.`module_id`) AS marks,
          (SELECT COUNT(*) FROM `module_programs` p WHERE p.`module_id` = m.`module_id`) AS progs
     FROM `modules` m;

CREATE TABLE `_md_canon` (
  `ident` VARCHAR(80) COLLATE utf8mb4_general_ci NOT NULL,
  `canonical_id` INT(11) NOT NULL,
  PRIMARY KEY (`ident`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
AS SELECT `ident`, `module_id` AS canonical_id FROM (
     SELECT `ident`, `module_id`,
            ROW_NUMBER() OVER (PARTITION BY `ident`
                               ORDER BY `marks` DESC, `progs` DESC, `module_id` ASC) AS rn
       FROM `_md_rank`
   ) z WHERE z.rn = 1;

CREATE TABLE `_md_merge` (
  `old_id` INT(11) NOT NULL,
  `canonical_id` INT(11) NOT NULL,
  PRIMARY KEY (`old_id`),
  KEY `idx_md_merge_canon` (`canonical_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
AS SELECT r.`module_id` AS old_id, c.`canonical_id`
     FROM `_md_rank` r
     JOIN `_md_canon` c ON c.`ident` = r.`ident`
    WHERE r.`module_id` <> c.`canonical_id`;

-- ── 3. Re-point every reference onto the canonical module ───────────────────
-- UPDATE IGNORE first (a unique key can refuse the move when the canonical
-- module already carries that exact row), then drop whatever could not move —
-- those are duplicates of a row the canonical module already has.

UPDATE IGNORE `module_marks`        t JOIN `_md_merge` m ON m.`old_id` = t.`module_id` SET t.`module_id` = m.`canonical_id`;
UPDATE IGNORE `module_registrations`t JOIN `_md_merge` m ON m.`old_id` = t.`module_id` SET t.`module_id` = m.`canonical_id`;
UPDATE IGNORE `module_programs`     t JOIN `_md_merge` m ON m.`old_id` = t.`module_id` SET t.`module_id` = m.`canonical_id`;
UPDATE IGNORE `module_levels`       t JOIN `_md_merge` m ON m.`old_id` = t.`module_id` SET t.`module_id` = m.`canonical_id`;
UPDATE IGNORE `module_schedules`    t JOIN `_md_merge` m ON m.`old_id` = t.`module_id` SET t.`module_id` = m.`canonical_id`;
UPDATE IGNORE `module_assignments`  t JOIN `_md_merge` m ON m.`old_id` = t.`module_id` SET t.`module_id` = m.`canonical_id`;
UPDATE IGNORE `module_offerings`    t JOIN `_md_merge` m ON m.`old_id` = t.`module_id` SET t.`module_id` = m.`canonical_id`;
UPDATE IGNORE `module_marks_archive`t JOIN `_md_merge` m ON m.`old_id` = t.`module_id` SET t.`module_id` = m.`canonical_id`;
UPDATE IGNORE `attendance_sessions` t JOIN `_md_merge` m ON m.`old_id` = t.`module_id` SET t.`module_id` = m.`canonical_id`;
UPDATE IGNORE `module_prerequisites`t JOIN `_md_merge` m ON m.`old_id` = t.`module_id` SET t.`module_id` = m.`canonical_id`;
UPDATE IGNORE `module_prerequisites`t JOIN `_md_merge` m ON m.`old_id` = t.`prerequisite_module_id` SET t.`prerequisite_module_id` = m.`canonical_id`;
UPDATE IGNORE `exam_schedules`      t JOIN `_md_merge` m ON m.`old_id` = t.`module_id` SET t.`module_id` = m.`canonical_id`;
UPDATE IGNORE `fee_invoices`        t JOIN `_md_merge` m ON m.`old_id` = t.`module_id` SET t.`module_id` = m.`canonical_id`;

DELETE t FROM `module_programs`      t JOIN `_md_merge` m ON m.`old_id` = t.`module_id`;
DELETE t FROM `module_levels`        t JOIN `_md_merge` m ON m.`old_id` = t.`module_id`;
DELETE t FROM `module_registrations` t JOIN `_md_merge` m ON m.`old_id` = t.`module_id`;
DELETE t FROM `module_assignments`   t JOIN `_md_merge` m ON m.`old_id` = t.`module_id`;
DELETE t FROM `module_marks_archive` t JOIN `_md_merge` m ON m.`old_id` = t.`module_id`;
DELETE t FROM `module_prerequisites` t JOIN `_md_merge` m ON m.`old_id` = t.`module_id`;
DELETE t FROM `module_prerequisites` t JOIN `_md_merge` m ON m.`old_id` = t.`prerequisite_module_id`;
-- A module cannot require itself once two rows became one.
DELETE FROM `module_prerequisites` WHERE `module_id` = `prerequisite_module_id`;

-- ── 4. Keep the trail: anything still holding an old id resolves ────────────
INSERT IGNORE INTO `module_id_map` (`old_module_id`, `canonical_id`)
SELECT `old_id`, `canonical_id` FROM `_md_merge`;

-- ── 5. Remove the surplus catalogue rows ────────────────────────────────────
DELETE m FROM `modules` m JOIN `_md_merge` x ON x.`old_id` = m.`module_id`;

DROP TABLE IF EXISTS `_md_rank`;
DROP TABLE IF EXISTS `_md_canon`;
DROP TABLE IF EXISTS `_md_merge`;

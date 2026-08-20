-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 146: make `intakes` a real catalogue and link students to it.
-- Date: 2026-08-20
--
-- WHY
-- ───
-- The August 2026 registry report asked that a lecturer see their class by
-- intake, and that "system yose igomba kugira inatake 3 gusa (January, May na
-- September)" — the system should offer only three intakes.
--
-- Two problems stood in the way, both found by auditing the live data rather
-- than reading the schema:
--
--  1. `intakes` held SIX rows that are three duplicated pairs — "2026-A
--     (January)" and "2026-B (August)", inserted three times over by
--     re-runnable seed migrations. Nothing references them (no foreign keys
--     anywhere), so the duplicates were invisible until you looked.
--
--  2. `student.intake` is free text carrying two different KINDS of value:
--       • real intakes    — MARCH_INTAKE_2025, SEPTEMBER_INTAKE_2024,
--                           intake_March_2026, SEPTEMBER_2025  → 8,522 students
--       • academic YEARS  — 2023-2024, 2022-2023, …            → 1,749 students
--     The second group are not intakes at all and must not be guessed into one.
--
-- WHAT THIS DOES, AND WHAT IT REFUSES TO DO
-- ─────────────────────────────────────────
-- The three canonical intakes (January / May / September) become the ACTIVE
-- set — what the admissions portal offers from now on, which is what the report
-- asked for.
--
-- But the historical intakes are kept as INACTIVE catalogue rows rather than
-- deleted. The live data holds March (5,400 students), September (2,343) and
-- June (777) intakes; the requested three months do not match that history at
-- all. Dropping them would leave the great majority of the student body
-- describing an intake the system no longer knows, which would defeat the very
-- feature being asked for — a lecturer filtering a mixed class by intake.
--
-- Nothing is guessed. A student whose intake reads "2023-2024" gets
-- `intake_id` NULL and keeps their original text, because no honest mapping
-- from an academic year to an intake month exists. See the reporting query at
-- the foot of this file for how to list them for the registry to resolve.
--
-- `student.intake` (text) is KEPT alongside the new `intake_id`, per the
-- project's convention that an id is added beside the name it resolves, never
-- in place of it.
--
-- Idempotent throughout.
-- ══════════════════════════════════════════════════════════════════════════════


-- ── 1. De-duplicate the catalogue ────────────────────────────────────────────
-- Keep the lowest id for each name. Safe because nothing references intakes.id
-- (verified against information_schema.KEY_COLUMN_USAGE — zero rows).
DELETE i FROM `intakes` i
  JOIN (
        SELECT `name`, MIN(`id`) AS keep_id
          FROM `intakes`
         GROUP BY `name`
       ) k ON k.`name` = i.`name`
 WHERE i.`id` > k.keep_id;


-- ── 2. Historical intakes, derived from the students that hold them ──────────
-- One row per (month, year) actually present in `student.intake`. Inactive:
-- they describe cohorts that already exist, and must not be offered to a new
-- applicant.
INSERT INTO `intakes` (`name`, `start_date`, `end_date`, `is_active`)
SELECT d.nm, d.sd, LAST_DAY(DATE_ADD(d.sd, INTERVAL 5 MONTH)), 0
  FROM (
    SELECT DISTINCT
           CONCAT(
             ELT(m.mth, 'January','February','March','April','May','June',
                        'July','August','September','October','November','December'),
             ' ', m.yr
           ) AS nm,
           STR_TO_DATE(CONCAT(m.yr, '-', LPAD(m.mth, 2, '0'), '-01'), '%Y-%m-%d') AS sd
      FROM (
        SELECT
          CASE
            WHEN UPPER(`intake`) LIKE '%JANUARY%'   THEN 1
            WHEN UPPER(`intake`) LIKE '%FEBRUARY%'  THEN 2
            WHEN UPPER(`intake`) LIKE '%MARCH%'     THEN 3
            WHEN UPPER(`intake`) LIKE '%APRIL%'     THEN 4
            WHEN UPPER(`intake`) LIKE '%MAY%'       THEN 5
            WHEN UPPER(`intake`) LIKE '%JUNE%'      THEN 6
            WHEN UPPER(`intake`) LIKE '%JULY%'      THEN 7
            WHEN UPPER(`intake`) LIKE '%AUGUST%'    THEN 8
            WHEN UPPER(`intake`) LIKE '%SEPTEMBER%' THEN 9
            WHEN UPPER(`intake`) LIKE '%OCTOBER%'   THEN 10
            WHEN UPPER(`intake`) LIKE '%NOVEMBER%'  THEN 11
            WHEN UPPER(`intake`) LIKE '%DECEMBER%'  THEN 12
          END AS mth,
          CASE WHEN RIGHT(`intake`, 4) REGEXP '^[0-9]{4}$'
               THEN CAST(RIGHT(`intake`, 4) AS UNSIGNED) END AS yr
        FROM `student`
        WHERE `intake` IS NOT NULL AND `intake` <> ''
      ) m
     WHERE m.mth IS NOT NULL AND m.yr IS NOT NULL
  ) d
 WHERE NOT EXISTS (SELECT 1 FROM `intakes` x WHERE x.`name` = d.nm);


-- ── 3. The three canonical intakes for the current cycle ─────────────────────
-- January / May / September 2026, as the report specifies.
INSERT INTO `intakes` (`name`, `start_date`, `end_date`, `is_active`)
SELECT c.nm, c.sd, LAST_DAY(DATE_ADD(c.sd, INTERVAL 3 MONTH)), 1
  FROM (
        SELECT 'January 2026'   AS nm, DATE '2026-01-01' AS sd
  UNION SELECT 'May 2026',            DATE '2026-05-01'
  UNION SELECT 'September 2026',      DATE '2026-09-01'
       ) c
 WHERE NOT EXISTS (SELECT 1 FROM `intakes` x WHERE x.`name` = c.nm);

-- Exactly those three are offered going forward; everything else becomes
-- history. This is the part the report literally asked for.
UPDATE `intakes`
   SET `is_active` = (`name` IN ('January 2026', 'May 2026', 'September 2026'));


-- ── 4. student.intake_id ─────────────────────────────────────────────────────
SET @col_exists := (
    SELECT COUNT(*) FROM `information_schema`.`COLUMNS`
     WHERE `TABLE_SCHEMA` = DATABASE()
       AND `TABLE_NAME`   = 'student'
       AND `COLUMN_NAME`  = 'intake_id'
);
SET @sql := IF(@col_exists = 0,
    'ALTER TABLE `student` ADD COLUMN `intake_id` INT(10) UNSIGNED DEFAULT NULL AFTER `intake`',
    'SELECT "student.intake_id already present" AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (
    SELECT COUNT(*) FROM `information_schema`.`STATISTICS`
     WHERE `TABLE_SCHEMA` = DATABASE()
       AND `TABLE_NAME`   = 'student'
       AND `INDEX_NAME`   = 'idx_student_intake_id'
);
SET @sql := IF(@idx_exists = 0,
    'ALTER TABLE `student` ADD INDEX `idx_student_intake_id` (`intake_id`)',
    'SELECT "idx_student_intake_id already present" AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ── 5. Backfill, by exact (month, year) match only ───────────────────────────
-- Deliberately no fuzzy fallback: a student whose intake cannot be read as a
-- month and a year keeps intake_id NULL. Guessing here would put a student in
-- a cohort they were never part of, and nothing downstream could tell.
UPDATE `student` s
  JOIN (
    SELECT `id`,
           CONCAT(
             ELT(
               CASE
                 WHEN UPPER(`intake`) LIKE '%JANUARY%'   THEN 1
                 WHEN UPPER(`intake`) LIKE '%FEBRUARY%'  THEN 2
                 WHEN UPPER(`intake`) LIKE '%MARCH%'     THEN 3
                 WHEN UPPER(`intake`) LIKE '%APRIL%'     THEN 4
                 WHEN UPPER(`intake`) LIKE '%MAY%'       THEN 5
                 WHEN UPPER(`intake`) LIKE '%JUNE%'      THEN 6
                 WHEN UPPER(`intake`) LIKE '%JULY%'      THEN 7
                 WHEN UPPER(`intake`) LIKE '%AUGUST%'    THEN 8
                 WHEN UPPER(`intake`) LIKE '%SEPTEMBER%' THEN 9
                 WHEN UPPER(`intake`) LIKE '%OCTOBER%'   THEN 10
                 WHEN UPPER(`intake`) LIKE '%NOVEMBER%'  THEN 11
                 WHEN UPPER(`intake`) LIKE '%DECEMBER%'  THEN 12
               END,
               'January','February','March','April','May','June',
               'July','August','September','October','November','December'
             ),
             ' ', CAST(RIGHT(`intake`, 4) AS UNSIGNED)
           ) AS nm
      FROM `student`
     WHERE `intake` IS NOT NULL
       AND `intake` <> ''
       AND RIGHT(`intake`, 4) REGEXP '^[0-9]{4}$'
  ) p ON p.`id` = s.`id`
  JOIN `intakes` i ON i.`name` = p.nm
   SET s.`intake_id` = i.`id`
 WHERE s.`intake_id` IS NULL;


-- ── For the registry: students whose intake could not be resolved ────────────
-- Run this and hand the result to the registry; each row needs a human
-- decision, and none of them should be assigned by a script.
--
--   SELECT `intake`, COUNT(*) AS students
--     FROM `student`
--    WHERE `intake_id` IS NULL AND `intake` IS NOT NULL AND `intake` <> ''
--    GROUP BY `intake`
--    ORDER BY students DESC;

-- Migration 077: import legacy `marks` into `module_marks`, REMAPPED onto the
-- de-duplicated module catalog so no marks are orphaned.
--
-- WHY THIS REPLACES THE OLD IMPORT (migration 073 / the supplied module_marks.sql):
--   073 keyed marks on the RAW legacy module_id. After migration 075 collapses
--   1424 legacy modules into 766 canonical ones, 497 of the module_ids that
--   ~177,869 (module,student) mark-pairs use no longer exist. `module_marks` has
--   `fk_marks_module ... ON DELETE CASCADE`, so those marks fail the FK on insert
--   (or cascade-delete) — i.e. ~58% of marks are LOST. This migration remaps
--   every legacy module_id through `module_id_map` (old -> canonical, produced by
--   075) before inserting, so a mark recorded under a merged-away module lands on
--   the surviving canonical module instead.
--
-- BEHAVIOUR:
--   • Legacy marks have no term -> all rows attach to one "Legacy (imported
--     marks)" term (created here if missing). The whole import is reversible by
--     deleting that term (FK cascade).
--   • The legacy table has ~467k rows but only ~305k distinct (module,student)
--     pairs (re-entries/resits, NOT separate components — component_id is just
--     0/NULL). After remap, duplicates collapse onto (canonical_module, student):
--     INSERT IGNORE + ORDER BY keeps the BEST attempt (highest total, then exam,
--     then most recent mark_id).
--   • cat -> cat_marks, exam -> exam_marks, total -> total (kept verbatim for
--     traceability). percentage = total clamped to 0–100 (legacy holds a few
--     out-of-range values, e.g. total up to 5125 and a handful of negatives).
--     grade/decision left NULL so the app recomputes from its grading scale.
--   • 302 legacy rows (203 pairs) reference a module_id absent from the catalog
--     entirely — they have nowhere to attach and are the only unrecoverable rows.
--
-- PREREQUISITES (run in this order on the target DB):
--   1. 075  -> de-duplicated `modules` (766) + `module_id_map`
--   2. the legacy `marks` table present (it already is on the online DB)
--   3. this file. Do NOT also import the supplied module_marks.sql — it is the
--      pre-dedup import this migration supersedes.
--
-- Idempotent: clears only the Legacy term's marks, then re-inserts; INSERT IGNORE
-- on uniq_marks(module_id, student_regnumber, academic_term_id).

-- ── 0. Guards: legacy source + the id map must exist ─────────
CREATE TABLE IF NOT EXISTS `marks` (
  `mark_id`      INT(11)     NOT NULL,
  `module_id`    INT(11)     NOT NULL,
  `student`      VARCHAR(40) NOT NULL,
  `lecturer`     INT(11)     NOT NULL DEFAULT 0,
  `component_id` INT(11)     DEFAULT NULL,
  `cat`          FLOAT       DEFAULT NULL,
  `exam`         FLOAT       DEFAULT NULL,
  `total`        FLOAT       DEFAULT NULL,
  `school_id`    INT(11)     DEFAULT NULL,
  `done_on`      VARCHAR(40) NOT NULL DEFAULT '',
  KEY `idx_marks_module`  (`module_id`),
  KEY `idx_marks_student` (`student`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ── 1. Dedicated "Legacy" academic year + term ───────────────
INSERT INTO `academic_years` (`label`, `start_date`, `end_date`, `is_current`)
SELECT 'Legacy', '2023-01-01', '2026-12-31', 0
WHERE NOT EXISTS (SELECT 1 FROM `academic_years` WHERE `label` = 'Legacy');
SET @legacy_year := (SELECT `id` FROM `academic_years` WHERE `label` = 'Legacy' ORDER BY `id` LIMIT 1);

INSERT INTO `academic_terms` (`academic_year_id`, `label`, `start_date`, `end_date`, `is_current`)
SELECT @legacy_year, 'Legacy (imported marks)', '2023-01-01', '2026-12-31', 0
WHERE NOT EXISTS (SELECT 1 FROM `academic_terms` WHERE `label` = 'Legacy (imported marks)');
SET @legacy_term := (SELECT `id` FROM `academic_terms` WHERE `label` = 'Legacy (imported marks)' ORDER BY `id` LIMIT 1);

-- ── 2. Clear any prior Legacy-term import (makes this re-runnable & supersedes 073) ──
DELETE FROM `module_marks` WHERE `academic_term_id` = @legacy_term;

-- ── 3. Transform + REMAP legacy marks → module_marks ─────────
-- JOIN module_id_map remaps old module_id -> canonical; INNER JOIN to modules
-- guarantees the canonical module exists (FK-safe). ORDER BY keeps the best
-- attempt per (canonical_module, student) for the term's unique key.
INSERT IGNORE INTO `module_marks`
    (`module_id`, `student_regnumber`, `academic_term_id`,
     `cat_marks`, `exam_marks`, `total`, `percentage`,
     `status`, `confirmed_at`, `remarks`, `created_at`)
SELECT
    map.`canonical_id`,
    m.`student`,
    @legacy_term,
    m.`cat`,
    m.`exam`,
    m.`total`,
    LEAST(GREATEST(COALESCE(m.`total`, 0), 0), 100),
    'confirmed',
    NOW(),
    CONCAT('Imported from legacy marks #', m.`mark_id`,
           CASE WHEN m.`module_id` <> map.`canonical_id`
                THEN CONCAT(' · module ', m.`module_id`, '->', map.`canonical_id`) ELSE '' END,
           CASE WHEN m.`done_on` <> '' THEN CONCAT(' · recorded ', m.`done_on`) ELSE '' END),
    NOW()
FROM `marks` m
JOIN `module_id_map` map ON map.`old_module_id` = m.`module_id`
JOIN `modules` md        ON md.`module_id`      = map.`canonical_id`
WHERE m.`student` IS NOT NULL AND m.`student` <> ''
ORDER BY m.`total` DESC, m.`exam` DESC, m.`mark_id` DESC;

-- ── 4. Verify (read-only) ────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM `marks`)                                                      AS legacy_rows,
  (SELECT COUNT(DISTINCT module_id, student) FROM `marks`)                            AS legacy_pairs,
  (SELECT COUNT(*) FROM `module_marks` WHERE academic_term_id = @legacy_term)         AS imported_marks,
  (SELECT COUNT(*) FROM `marks` m WHERE NOT EXISTS
      (SELECT 1 FROM `module_id_map` map WHERE map.old_module_id = m.module_id))      AS unrecoverable_rows_no_module;

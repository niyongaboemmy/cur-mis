-- ============================================================
-- Migration: 073 — Import legacy `marks` into `module_marks`
-- Date: 2026-06-01
--
-- The legacy gradebook stored every mark in a flat `marks` table
-- (mark_id, module_id, student, lecturer, component_id, cat, exam,
--  total, school_id, done_on). The new app reads marks from
-- `module_marks`, which is term-scoped. This migration transforms
-- the legacy rows into `module_marks`.
--
-- Design decisions (confirmed with the data owner):
--   • Legacy marks have no academic term → all rows are attached to a
--     single dedicated "Legacy (imported marks)" term so the live
--     terms stay untouched and the whole import is reversible by
--     deleting that one term (FK cascade removes the marks).
--   • The legacy table has ~467k rows with ~88k duplicate
--     (module_id, student) pairs (resits / re-entries). We keep ONE
--     row per (module_id, student) — the best attempt (highest total,
--     then highest exam, then most recent mark_id) — via an ordered
--     INSERT IGNORE against the unique key.
--   • Only marks whose module still exists are imported (INNER JOIN
--     modules) so the module FK can never be violated.
--   • `percentage` is clamped to 0–100 (legacy data contains a few
--     out-of-range / negative values); raw cat/exam/total are kept
--     as-is for traceability. Grade/decision are intentionally left
--     NULL so the app can recompute them from its grading scale.
--
-- Idempotent & portable:
--   • `marks` is created IF NOT EXISTS, so on a database that never had
--     the legacy table the import simply inserts 0 rows (no error).
--   • INSERT IGNORE + the unique key make re-runs a no-op.
--   • On the ONLINE database (the source of this data) `marks`,
--     `modules`, departments and programs already exist, so this file
--     only needs to perform the marks transform.
-- ============================================================

-- ── 0. Legacy source table guard ─────────────────────────────
-- No-op where the legacy table already exists (online + the seeded
-- local dev DB); creates an empty shell on any other database.
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

-- ── 2. Transform legacy marks → module_marks ─────────────────
-- ORDER BY makes INSERT IGNORE keep the best attempt per
-- (module_id, student) for the legacy term's unique key.
INSERT IGNORE INTO `module_marks`
    (`module_id`, `student_regnumber`, `academic_term_id`,
     `cat_marks`, `exam_marks`, `total`, `percentage`,
     `status`, `confirmed_at`, `remarks`, `created_at`)
SELECT
    m.`module_id`,
    m.`student`,
    @legacy_term,
    m.`cat`,
    m.`exam`,
    m.`total`,
    LEAST(GREATEST(COALESCE(m.`total`, 0), 0), 100),
    'confirmed',
    NOW(),
    CONCAT('Imported from legacy marks #', m.`mark_id`,
           CASE WHEN m.`done_on` <> '' THEN CONCAT(' · recorded ', m.`done_on`) ELSE '' END),
    NOW()
FROM `marks` m
JOIN `modules` md ON md.`module_id` = m.`module_id`
WHERE m.`student` IS NOT NULL AND m.`student` <> ''
ORDER BY m.`total` DESC, m.`exam` DESC, m.`mark_id` DESC;

-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 125: consolidate EVERY legacy mark into `module_marks`.
-- Date: 2026-08-12
--
-- Goal: one table holds all marks. Nothing is deleted and nothing is skipped for
-- being untidy — completeness wins over cleanliness here, by explicit decision.
--
-- ── Where marks were scattered ───────────────────────────────────────────────
--   module_marks  264,852 rows — 146,850 (module, student) pairs   ← the app reads this
--   marks         505,854 rows — 172,812 pairs after id-mapping    ← legacy, 2010→2026
--   marks_clone   121,258 rows — mostly a copy of `marks`, but 777 pairs unique
--   MarksFromLecturer (371) / ArchiveMarks (7) — per-module STATUS flags, not marks
--   student_modules / finalResults / module_marks_archive / revaluations
--     / exemption_modules — all empty (0 rows)
--
-- Roughly 26,600 (module, student) pairs existed only in the legacy tables and
-- were invisible to every screen in the app. This migration lands them.
--
-- ── Conventions, copied from the 2026-06-16 legacy import already in the data ──
--   academic_term_id = 3  → the existing 'Legacy (imported marks)' term
--   marks.cat   → cat_marks      marks.exam → exam_marks     marks.total → total
--   percentage  = total clamped to 0..100 (legacy totals include junk like 5125)
--   status      = 'confirmed'    (historical, final — and now genuinely locked
--                                 by migration 124's server-side guard)
--   maxes left at the table defaults, exactly as the earlier import left them.
--
-- ── Deliberate choices ───────────────────────────────────────────────────────
--   • Legacy carries up to 33 rows per (module, student) — re-entries, not
--     components (component_id has ONE distinct value). The newest row wins
--     (highest mark_id), preferring `marks` over `marks_clone`.
--   • Module ids are resolved through `module_id_map` (old → canonical); 517 of
--     the 532 dead module ids resolve that way. The 15 that do not are STILL
--     imported — the marks are real even if the module record is gone.
--   • Students absent from the `student` table are STILL imported, for the same
--     reason. `student_regnumber` has no FK, so nothing blocks this.
--   • Existing (module, student, term-3) rows are left completely untouched —
--     this only fills gaps, so it can be re-run safely and cannot clobber
--     anything a lecturer has since edited.
--
-- Re-runnable: the staging table is dropped and rebuilt, and the final INSERT is
-- guarded by NOT EXISTS.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── §1  Stage one row per (canonical module, student) from BOTH legacy tables ─
DROP TABLE IF EXISTS `_legacy_marks_stage`;

CREATE TABLE `_legacy_marks_stage` (
  `module_id` INT NOT NULL,
  `student`   VARCHAR(250) COLLATE utf8mb4_general_ci NOT NULL,
  `cat`       DECIMAL(10,2) NULL,
  `exam`      DECIMAL(10,2) NULL,
  `total`     DECIMAL(10,2) NULL,
  -- Kept RAW, not DATETIME: `done_on` is a varchar holding mixed formats, and a
  -- handful of rows are US-order ('07-13-2022'). Under strict mode STR_TO_DATE
  -- on those is error 1411, not a warning, which aborts the whole INSERT — so
  -- the parse is deferred to §2 behind a pattern guard.
  `done_on`   VARCHAR(50) NULL,
  PRIMARY KEY (`module_id`, `student`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- `src` orders `marks` (0) ahead of `marks_clone` (1) so the live table wins a
-- tie; mark_id DESC then takes the most recent entry for that pair.
INSERT INTO `_legacy_marks_stage` (`module_id`, `student`, `cat`, `exam`, `total`, `done_on`)
SELECT `mod_id`, `student`, `cat`, `exam`, `total`, `done_on`
FROM (
    SELECT
        COALESCE(mp.`canonical_id`, u.`module_id`) AS `mod_id`,
        u.`student`, u.`cat`, u.`exam`, u.`total`, u.`done_on`,
        ROW_NUMBER() OVER (
            PARTITION BY COALESCE(mp.`canonical_id`, u.`module_id`), u.`student`
            ORDER BY u.`src` ASC, u.`mark_id` DESC
        ) AS rn
    FROM (
        SELECT `mark_id`, `module_id`, `student`, `cat`, `exam`, `total`,
               `done_on`, 0 AS `src`
        FROM `marks`
        UNION ALL
        SELECT `mark_id`, `module_id`, `student`, `cat`, `exam`, `total`,
               `done_on`, 1 AS `src`
        FROM `marks_clone`
    ) u
    LEFT JOIN `module_id_map` mp ON mp.`old_module_id` = u.`module_id`
    WHERE TRIM(COALESCE(u.`student`, '')) <> ''
) r
WHERE r.rn = 1;


-- ── §2  Land every staged pair that module_marks does not already have ────────
-- `created_at` keeps the original entry date where it parses and sits inside the
-- TIMESTAMP range, so the roster's "marks added between" filter stays truthful
-- for historical rows; anything unparseable falls back to now.
INSERT INTO `module_marks`
    (`module_id`, `student_regnumber`, `academic_term_id`,
     `cat_marks`, `exam_marks`, `total`, `percentage`,
     `status`, `confirmed_at`, `created_at`, `updated_at`)
SELECT
    s.`module_id`,
    s.`student`,
    3,
    s.`cat`,
    s.`exam`,
    s.`total`,
    LEAST(GREATEST(COALESCE(s.`total`, 0), 0), 100),
    'confirmed',
    -- Only parse strings that are unambiguously 'YYYY-MM-DD HH:MM:SS' AND land
    -- inside the TIMESTAMP range; everything else falls back to now.
    CASE WHEN s.`done_on` REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$'
              AND s.`done_on` BETWEEN '1971-01-01 00:00:01' AND '2037-12-31 23:59:59'
         THEN s.`done_on` ELSE NOW() END,
    CASE WHEN s.`done_on` REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$'
              AND s.`done_on` BETWEEN '1971-01-01 00:00:01' AND '2037-12-31 23:59:59'
         THEN s.`done_on` ELSE NOW() END,
    NOW()
FROM `_legacy_marks_stage` s
WHERE NOT EXISTS (
    SELECT 1 FROM `module_marks` mm
    WHERE mm.`module_id`         = s.`module_id`
      AND mm.`student_regnumber` = s.`student`
      AND mm.`academic_term_id`  = 3
);


-- ── §3  Staging table is disposable ──────────────────────────────────────────
DROP TABLE IF EXISTS `_legacy_marks_stage`;

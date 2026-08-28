-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 151: repair the legacy-marks consolidation so transcripts match the
-- registrar's signed record.
-- Date: 2026-08-28
--
-- WHY
-- ───
-- Audited against an official signed transcript (1CUR21AK06203, issued
-- 14-05-25) and the legacy system's own transcript query. Three defects in the
-- consolidated `module_marks` made our transcripts disagree with the signed
-- record — for that student, 13 of 34 modules printed the wrong mark:
--
--  1. WRONG ATTEMPT LIVE. The supersede sweep (migration 127) did not rank
--     attempts the way the registrar's system did. The old system resolves
--     re-marked modules by "newest attempt wins" (ORDER BY done_on DESC,
--     mark_id DESC on the legacy `marks` table). Our sweep left older, wrong
--     attempts live (a batch of placeholder 63s, a 43, a 0) and superseded the
--     registrar's real values. Verified: ranking by the legacy mark id
--     reproduces the signed transcript exactly.
--
--  2. MISSING ATTEMPTS. The consolidation joined `marks` to `modules` directly,
--     so attempts recorded under module ids that were later consolidated away
--     (see `module_id_map`) were never imported at all. The signed 59 for
--     LAGE2312 exists only under such an orphaned module id; our copy had only
--     the 0.
--
--  3. CORRUPT TOTALS. `marks.total` disagrees with `marks.cat + marks.exam` on
--     many rows (stored 82 vs 49+32=81, stored 61 vs 43+17=60, …). The signed
--     transcript prints the RECOMPUTED sum in every verified case. The
--     consolidation copied the corrupt stored totals.
--
-- WHAT THIS DOES
-- ──────────────
--  §1 imports the legacy attempts the consolidation missed (via module_id_map),
--     with total recomputed as cat+exam.
--  §2 recomputes total/percentage on already-imported rows where the stored
--     total disagrees with cat+exam.
--  §3 re-runs the supersede resolution over ALL rows, per
--     (student, module identity normalised as UPPER(code without spaces)):
--     marks entered through the new system (real terms) outrank every legacy
--     import; among legacy imports the highest legacy mark id wins — the same
--     "newest attempt" the registrar's system prints.
--  §4 fixes MATA2322's credits (6 → 15, per the signed transcript).
--
-- Idempotent — safe to re-run. Portable MySQL 8 / MariaDB.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 0. Stage tables (real tables, not TEMPORARY: MySQL cannot reopen a temp
--       table twice in one statement) ─────────────────────────────────────────
DROP TABLE IF EXISTS `_tmr_imported`;
DROP TABLE IF EXISTS `_tmr_rank`;
DROP TABLE IF EXISTS `_tmr_win`;
DROP TABLE IF EXISTS `_tmr_winid`;

-- Legacy mark ids already present in module_marks (parsed out of the import
-- remark). REGEXP_SUBSTR is kept out of JOINs deliberately — evaluated once
-- per row here, then joined on the materialised value.
CREATE TABLE `_tmr_imported` (
  `legacy_id` INT UNSIGNED NOT NULL,
  PRIMARY KEY (`legacy_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
AS SELECT DISTINCT
     CAST(SUBSTRING(REGEXP_SUBSTR(`remarks`, '#[0-9]+'), 2) AS UNSIGNED) AS legacy_id
   FROM `module_marks`
   WHERE `remarks` LIKE 'Imported from legacy marks #%';

-- ── 1. Import the attempts the consolidation missed ──────────────────────────
-- Only marks that resolve to a canonical module (directly or through
-- module_id_map) and belong to a known student. Term 3 is the legacy bucket,
-- same as the original consolidation. Everything lands superseded=1 — §3
-- decides the winner. total is recomputed from cat+exam (defect 3).
INSERT INTO `module_marks`
  (`module_id`, `student_regnumber`, `academic_term_id`,
   `cat_marks`, `exam_marks`, `cat_max`, `exam_max`,
   `total`, `percentage`, `status`, `superseded`, `remarks`)
SELECT
   COALESCE(mp.`canonical_id`, m.`module_id`),
   TRIM(m.`student`),
   3,
   m.`cat`, m.`exam`, 60.00, 40.00,
   ROUND(COALESCE(m.`cat`,0) + COALESCE(m.`exam`,0), 2),
   ROUND(COALESCE(m.`cat`,0) + COALESCE(m.`exam`,0), 2),
   'confirmed', 1,
   CONCAT('Imported from legacy marks #', m.`mark_id`, ' — module_id_map repair (migration 151)')
FROM `marks` m
LEFT JOIN `_tmr_imported` i ON i.`legacy_id` = m.`mark_id`
LEFT JOIN `module_id_map` mp ON mp.`old_module_id` = m.`module_id`
JOIN `modules` mo ON mo.`module_id` = COALESCE(mp.`canonical_id`, m.`module_id`)
WHERE i.`legacy_id` IS NULL
  AND m.`total` IS NOT NULL
  AND TRIM(m.`student`) <> ''
  -- The legacy table carries junk rows whose components are far outside the
  -- marks/100 scale; they overflow percentage and are not real marks.
  AND COALESCE(m.`cat`, 0)  BETWEEN 0 AND 100
  AND COALESCE(m.`exam`, 0) BETWEEN 0 AND 100
  AND (COALESCE(m.`cat`, 0) + COALESCE(m.`exam`, 0)) BETWEEN 0 AND 100
  AND EXISTS (SELECT 1 FROM `student` s WHERE s.`regnumber` = TRIM(m.`student`));

-- ── 2. Recompute corrupt totals on imported rows ─────────────────────────────
-- Applies only to rows that came from the legacy table (they have exactly a
-- cat and an exam component, nothing else), and only where the stored total
-- disagrees with the sum. The signed transcript prints the sum.
UPDATE `module_marks`
   SET `total`      = ROUND(`cat_marks` + `exam_marks`, 2),
       `percentage` = ROUND(`cat_marks` + `exam_marks`, 2)
 WHERE `remarks` LIKE 'Imported from legacy marks #%'
   AND `cat_marks`  IS NOT NULL
   AND `exam_marks` IS NOT NULL
   AND (`cat_marks` + `exam_marks`) BETWEEN 0 AND 100
   AND (`total` IS NULL OR `total` <> ROUND(`cat_marks` + `exam_marks`, 2));

-- ── 3. Re-resolve superseded, per (student, normalised module identity) ──────
-- Identity ignores spacing and the catalogue's duplicate module rows:
-- 'ADPR 2322' and 'ADPR2322' are one module. Ranking:
--   • new-system rows (recorded against a real term, not the legacy bucket):
--     1e9 + id  — newest new-system entry outranks everything;
--   • legacy imports with a parseable mark id: that id — "newest attempt wins",
--     exactly the registrar's rule;
--   • legacy-bucket rows with no parseable id (early import waves): 0 — they
--     lose to any identified attempt.
CREATE TABLE `_tmr_rank` (
  `id` INT UNSIGNED NOT NULL,
  `student_regnumber` VARCHAR(250) COLLATE utf8mb4_general_ci NOT NULL,
  `ident` VARCHAR(80) COLLATE utf8mb4_general_ci NOT NULL,
  `rank_key` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_tmr_rank_grp` (`student_regnumber`, `ident`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
AS SELECT
     mm.`id`,
     mm.`student_regnumber`,
     UPPER(REPLACE(COALESCE(mo.`module_code`, CONCAT('MID-', mm.`module_id`)), ' ', '')) AS ident,
     CASE
       WHEN mm.`remarks` LIKE 'Imported from legacy marks #%'
         THEN CAST(SUBSTRING(REGEXP_SUBSTR(mm.`remarks`, '#[0-9]+'), 2) AS UNSIGNED)
       WHEN mm.`academic_term_id` = 3 THEN 0
       ELSE 1000000000 + mm.`id`
     END AS rank_key
   FROM `module_marks` mm
   LEFT JOIN `modules` mo ON mo.`module_id` = mm.`module_id`;

CREATE TABLE `_tmr_win` (
  `student_regnumber` VARCHAR(250) COLLATE utf8mb4_general_ci NOT NULL,
  `ident` VARCHAR(80) COLLATE utf8mb4_general_ci NOT NULL,
  `best` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`student_regnumber`, `ident`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
AS SELECT `student_regnumber`, `ident`, MAX(`rank_key`) AS best
   FROM `_tmr_rank` GROUP BY `student_regnumber`, `ident`;

CREATE TABLE `_tmr_winid` (
  `win_id` INT UNSIGNED NOT NULL,
  PRIMARY KEY (`win_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
AS SELECT MAX(r.`id`) AS win_id
   FROM `_tmr_rank` r
   JOIN `_tmr_win` w
     ON w.`student_regnumber` = r.`student_regnumber`
    AND w.`ident` = r.`ident`
    AND r.`rank_key` = w.`best`
   GROUP BY r.`student_regnumber`, r.`ident`;

UPDATE `module_marks` mm
LEFT JOIN `_tmr_winid` w ON w.`win_id` = mm.`id`
   SET mm.`superseded` = IF(w.`win_id` IS NULL, 1, 0);

-- ── 4. Catalogue credit corrections, per the signed transcript ───────────────
UPDATE `modules`
   SET `module_credits` = 15
 WHERE UPPER(REPLACE(`module_code`, ' ', '')) = 'MATA2322'
   AND `module_credits` = 6;
UPDATE `modules`
   SET `module_credits` = 15
 WHERE UPPER(REPLACE(`module_code`, ' ', '')) = 'DTMD5312'
   AND `module_credits` = 20;

-- ── 5. Clean up ──────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS `_tmr_imported`;
DROP TABLE IF EXISTS `_tmr_rank`;
DROP TABLE IF EXISTS `_tmr_win`;
DROP TABLE IF EXISTS `_tmr_winid`;

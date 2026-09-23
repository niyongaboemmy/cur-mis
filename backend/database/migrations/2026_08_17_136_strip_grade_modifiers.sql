-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 136: Whole-letter grades — strip the +/- modifiers.
-- Date: 2026-08-17
--
-- CUR awards A, B, C, D and E. It does not award a B+, and yet transcripts —
-- on screen and in the signed PDF — were printing one, because two sources put
-- suffixed letters into circulation:
--
--   1. `grading_scales` is seeded with a finer 4.0-style ladder (A / B+ / B /
--      C+ / C / D / E). That table is left alone here: the sub-bands still
--      carry distinct `grade_point` values, and dropping them would coarsen
--      every CGPA in the system. `App\Helpers\GradingScale` now folds them to
--      whole letters at the point a letter is *displayed*, so the grade point
--      keeps its resolution while the printed letter stops inventing a grade.
--
--   2. `module_marks.grade` — the historical rows. Marks recorded from now on
--      are graded through `GradingScale::gradeFor()`, which returns a whole
--      letter, so only the rows already on disk need repairing. That is what
--      this migration does. It matters beyond the transcript: the deliberation
--      sheets, the teacher portal and the grade-distribution analytics all read
--      this column straight out of the database, and the analytics `GROUP BY
--      mm.grade` was splitting one cohort's Bs across two bars.
--
-- Trailing '+' and '-' are trimmed; a stored 'B+' becomes 'B'. Values that are
-- already whole letters are untouched, so this is idempotent — safe to re-run.
-- ──────────────────────────────────────────────────────────────────────────────

UPDATE `module_marks`
   SET `grade` = TRIM(TRAILING '-' FROM TRIM(TRAILING '+' FROM TRIM(`grade`)))
 WHERE `grade` IS NOT NULL
   AND `grade` <> ''
   AND TRIM(`grade`) <> TRIM(TRAILING '-' FROM TRIM(TRAILING '+' FROM TRIM(`grade`)));

-- Superseded attempts live in this same table behind `module_marks.superseded`
-- rather than in a history table of their own, so the single statement above
-- repairs the revaluation trail too — an audit of an old attempt would
-- otherwise read as though the grade changed from B+ to B when only the
-- display rule did.

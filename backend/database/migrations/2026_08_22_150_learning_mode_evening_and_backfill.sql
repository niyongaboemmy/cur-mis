-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 150: learning mode — add 'evening', and backfill students from the
-- legacy `program` column.
-- Date: 2026-08-22
--
-- WHY
-- ───
-- Migrations 2026_08_21_001/002 added `learning_mode` to `modules` and
-- `student` so a student only sees the modules scheduled for their delivery
-- mode (ModuleModel::listEligibleFor filters on it). Two gaps remained:
--
--   1. The enum offered day / weekend / holiday but not EVENING, which the
--      institution also runs.
--
--   2. Every student sat on the column DEFAULT of 'day'. The student's real
--      mode has lived for years in the legacy free-text `student.program`
--      column ("Day" 3,957 / "Weekend" 2,469 / "Holiday" 1,665 at the time of
--      writing — the same column newer enrollments fill with an actual
--      program name instead). Without a backfill, every weekend and holiday
--      student was shown the day catalogue and none of their own.
--
-- The backfill maps only the rows whose `program` is EXACTLY a mode word,
-- case- and whitespace-insensitively. A `program` holding a real program name
-- ("Public Health", "Accounting", …) says nothing about delivery mode and is
-- left on the default — same refuse-to-guess rule as migration 146's intakes.
--
-- Only rows still on the default 'day' (or NULL) are touched, so a mode an
-- administrator has since set by hand survives a re-run.
--
-- Idempotent — safe to re-run.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. The enums learn 'evening' ─────────────────────────────────────────────
-- Values are matched by string during the rebuild, so existing 'weekend' /
-- 'holiday' rows are preserved even though their enum index changes.
ALTER TABLE `modules`
  MODIFY `learning_mode` ENUM('day','evening','weekend','holiday') DEFAULT 'day';

ALTER TABLE `student`
  MODIFY `learning_mode` ENUM('day','evening','weekend','holiday') DEFAULT 'day';

-- ── 2. Backfill students from the legacy column ──────────────────────────────
UPDATE `student`
   SET `learning_mode` = 'weekend'
 WHERE LOWER(TRIM(`program`)) = 'weekend'
   AND (`learning_mode` IS NULL OR `learning_mode` = 'day');

UPDATE `student`
   SET `learning_mode` = 'holiday'
 WHERE LOWER(TRIM(`program`)) = 'holiday'
   AND (`learning_mode` IS NULL OR `learning_mode` = 'day');

-- No 'evening' values exist in `program` today; this is here so a site that
-- does hold them (or a future re-import that brings them in) maps correctly.
UPDATE `student`
   SET `learning_mode` = 'evening'
 WHERE LOWER(TRIM(`program`)) IN ('evening', 'night')
   AND (`learning_mode` IS NULL OR `learning_mode` = 'day');

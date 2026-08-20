-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 148: record what the deliberation board DECIDED about each student.
-- Date: 2026-08-20
--
-- WHY
-- ───
-- The August 2026 registry report: "Deliberation no kwimura abanyeshuri bava
-- muri Level imwe, gusibiza ndetse no kumufatira umwanzuro, kwimura Promotion"
-- — the board must be able to move a student out of a level, make them repeat,
-- rule on their case, and have the promotion actually take effect.
--
-- Deliberation today is a marks review only. DeliberationController serves a
-- grid, exports the board's XLSX, and finalizeSession() flips every
-- `module_marks` row for the programme to 'confirmed'. Nothing records a
-- per-student outcome, and nothing writes `student.current_level` — the word
-- "promotion" appears in no controller, model or migration in the codebase.
--
-- So a board sat, decided who progresses and who repeats, and the system kept
-- no record of it. The level was then moved by hand, student by student,
-- through the Programme card on the student page — with no link back to the
-- session that decided it.
--
-- WHAT THIS TABLE IS
-- ──────────────────
-- One row per student per session: the outcome, the level they moved from and
-- to, and why. It is the minute of the meeting, and finalizeSession() applies
-- it.
--
-- `applied_at` is deliberately separate from the decision itself. A board can
-- record and amend decisions all through a sitting; they take effect only when
-- the session is finalised, and this column is what tells the two apart. It
-- also makes finalisation re-runnable without double-applying.
--
-- ON current_level
-- ────────────────
-- `student.current_level` is VARCHAR(40) holding `levels.id` as text (the
-- project's level-id convention). `level_from` / `level_to` mirror that as
-- INT so the decision is unambiguous, and the controller writes the text form
-- back to the student row.
--
-- Idempotent — CREATE TABLE IF NOT EXISTS.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS `deliberation_decisions` (
  `id`              INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `deliberation_id` INT(10) UNSIGNED NOT NULL,

  -- Registration number, matching how `module_marks` keys a student. Not
  -- student.id: the marks the board is deliberating on are keyed this way, and
  -- a mismatch here would mean joining on two different identities.
  `student_regnumber` VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,

  -- promote        → advance to level_to
  -- repeat_level   → stay in level_from for another year
  -- repeat_modules → progress, but must resit named modules (carry-over)
  -- discontinue    → leave the programme; also sets student_state
  -- defer          → authorised break; level unchanged
  `outcome` ENUM('promote','repeat_level','repeat_modules','discontinue','defer') NOT NULL,

  `level_from` INT(10) UNSIGNED DEFAULT NULL,
  `level_to`   INT(10) UNSIGNED DEFAULT NULL,

  -- Free text for repeat_modules: the module codes to resit. Not a join table
  -- — the board writes a note, and turning that note into enforced
  -- registrations is a separate decision nobody has asked for yet.
  `carry_modules` VARCHAR(500) DEFAULT NULL,
  `reason`        TEXT         DEFAULT NULL,

  `decided_by` INT(10) UNSIGNED DEFAULT NULL,
  `decided_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Set when finalizeSession() writes the outcome onto the student record.
  -- NULL means "decided but not yet in force".
  `applied_at` TIMESTAMP    NULL DEFAULT NULL,

  PRIMARY KEY (`id`),
  -- One decision per student per session; re-deciding updates in place.
  UNIQUE KEY `uq_dd_session_student` (`deliberation_id`, `student_regnumber`),
  KEY `idx_dd_student` (`student_regnumber`),
  KEY `idx_dd_applied` (`deliberation_id`, `applied_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

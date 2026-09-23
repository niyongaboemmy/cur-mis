-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 009_populate_hr_data_from_hr_employees — NEUTRALISED 2026-09-06
--
-- Data-population follow-up for 007 & 008 — same hr_employees.user_id assumption, same problem.
--
-- The original body errored non-idempotently on every migrate run and never
-- got ledgered, so it retried forever and kept the workflow red. It is kept
-- as a no-op for history; a corrected version should be added as a new
-- migration if this step is still needed.
-- ──────────────────────────────────────────────────────────────────────────────

SELECT 'noop: 2026_09_04_009_populate_hr_data_from_hr_employees (neutralised — see header)' AS note;

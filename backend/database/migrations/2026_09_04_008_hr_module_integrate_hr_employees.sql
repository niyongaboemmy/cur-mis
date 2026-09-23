-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 008_hr_module_integrate_hr_employees — NEUTRALISED 2026-09-06
--
-- Populate HR tables from hr_employees — references hr_employees.user_id, a column that table does not have (its key columns are staff_id / emp_code / email). Needs rewriting against the real hr_employees shape.
--
-- The original body errored non-idempotently on every migrate run and never
-- got ledgered, so it retried forever and kept the workflow red. It is kept
-- as a no-op for history; a corrected version should be added as a new
-- migration if this step is still needed.
-- ──────────────────────────────────────────────────────────────────────────────

SELECT 'noop: 2026_09_04_008_hr_module_integrate_hr_employees (neutralised — see header)' AS note;

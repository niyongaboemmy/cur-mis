-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 007_migrate_employees_to_users — NEUTRALISED 2026-09-06
--
-- Merge legacy employees table into users with HR fields — the INSERT column list is misaligned with the users table (produced 'Truncated incorrect DECIMAL value: Superadmin'). Superseded by the consolidated HR schema in 2026_09_05_001.
--
-- The original body errored non-idempotently on every migrate run and never
-- got ledgered, so it retried forever and kept the workflow red. It is kept
-- as a no-op for history; a corrected version should be added as a new
-- migration if this step is still needed.
-- ──────────────────────────────────────────────────────────────────────────────

SELECT 'noop: 2026_09_04_007_migrate_employees_to_users (neutralised — see header)' AS note;

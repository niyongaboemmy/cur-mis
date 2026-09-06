-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 002_assign_supervisors_organizational_hierarchy — NEUTRALISED 2026-09-06
--
-- Assign supervisors from org hierarchy — references users.department_id, which exists in no migration. Supervisor assignment must be redone against the real schema (users.supervisor_id from migration 001 + whatever department linkage actually exists).
--
-- The original body errored non-idempotently on every migrate run and never
-- got ledgered, so it retried forever and kept the workflow red. It is kept
-- as a no-op for history; a corrected version should be added as a new
-- migration if this step is still needed.
-- ──────────────────────────────────────────────────────────────────────────────

SELECT 'noop: 2026_09_04_002_assign_supervisors_organizational_hierarchy (neutralised — see header)' AS note;

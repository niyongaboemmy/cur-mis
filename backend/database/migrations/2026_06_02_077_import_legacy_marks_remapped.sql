-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 077 — RETIRED / NEUTRALIZED (2026-06-16)
--
-- One-shot legacy import: loaded legacy `marks` into `module_marks` (remapped).
-- Not safe to run automatically against a populated database. The canonical,
-- additive schema is now owned by 2026_06_16_083_consolidated_session_schema.sql;
-- loading legacy DATA is a separate, deliberate one-time job. Retired to a no-op
-- so `migrate` is safe everywhere. Original SQL remains in git history.
-- ──────────────────────────────────────────────────────────────────────────────
DO 1;

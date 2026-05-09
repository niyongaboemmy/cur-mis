-- 2026_05_07_047_unique_module_code.sql
-- `modules.module_code` must be unique across the catalog. The backend's
-- per-entity uniqueness check enforces this at the API layer; this index
-- backs it with a real DB constraint so concurrent inserts can't slip
-- through.
--
-- Idempotent — duplicate-key errors are swallowed by the migration runner.

ALTER TABLE `modules`
  ADD UNIQUE KEY `uniq_modules_module_code` (`module_code`);

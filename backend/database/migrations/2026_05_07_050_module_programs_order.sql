-- 2026_05_07_050_module_programs_order.sql
-- A module's curricular position is per-program (different programs may
-- order the same module differently), so the order belongs on the
-- module ↔ program join. Mode / semester / campus stay on the future
-- Schedules feature.
--
-- Idempotent — duplicate-column errors are swallowed by the migration runner.

ALTER TABLE `module_programs`
  ADD COLUMN `module_order` INT NULL AFTER `option_id`;

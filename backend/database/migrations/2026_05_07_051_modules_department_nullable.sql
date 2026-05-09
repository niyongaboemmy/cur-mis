-- 2026_05_07_051_modules_department_nullable.sql
-- The `modules.department` column was created NOT NULL with no default,
-- which surfaces as "Field 'department' doesn't have a default value"
-- whenever an INSERT omits it. The legitimate value comes from the
-- module's owning program (`options.department_id`); the per-program
-- importer now passes that automatically. Relax the constraint so any
-- future code path that legitimately doesn't know the department (or
-- bulk-creates a module catalog before linking it to programs) doesn't
-- fail at the DB layer.
--
-- Idempotent — re-running the MODIFY with the same definition is a no-op.

ALTER TABLE `modules`
  MODIFY `department` INT NULL;

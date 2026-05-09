-- 2026_05_07_046_options_dates_to_text.sql
-- The `start_date` / `end_date` columns on `options` are used for academic-
-- year markers like "2023-2024" rather than calendar dates. MySQL DATE
-- columns reject those, so widen the type to VARCHAR(20). Existing values
-- (all NULL — these columns were added in 045) survive the type change.
--
-- Idempotent — `MODIFY COLUMN` with the same definition is a no-op.

ALTER TABLE `options`
  MODIFY `start_date` VARCHAR(20) NULL,
  MODIFY `end_date`   VARCHAR(20) NULL;

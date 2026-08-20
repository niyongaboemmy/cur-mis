-- =============================================================================
-- 043  Schedules tab: replace the single `day_of_week` (TINYINT) with a
--      pattern that can encode several days at once. Values are stored as
--      a normalized comma-separated list of ISO day numbers (1=Mon … 7=Sun):
--          "1,2,3,4,5"  → Mon–Fri (weekdays preset)
--          "6,7"        → Sat–Sun (weekend preset)
--          "1,3,5"      → custom pick
--          "1"          → single day (Mon)
--      The legacy `day_of_week` column is kept and populated with the first
--      day of the pattern (or NULL if multi-day) so older queries that read
--      it still work.
-- =============================================================================
SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'module_offerings' AND column_name = 'day_pattern'),
  'SELECT 1',
  'ALTER TABLE `module_offerings` ADD COLUMN `day_pattern` VARCHAR(64) NULL AFTER `day_of_week`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill `day_pattern` from any pre-existing `day_of_week` value so the
-- new field is the source of truth going forward.
UPDATE `module_offerings`
SET    `day_pattern` = CAST(`day_of_week` AS CHAR)
WHERE  `day_pattern` IS NULL
  AND  `day_of_week` IS NOT NULL;

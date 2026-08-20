-- 2026_05_05_040_create_module_levels.sql
-- A module can now be offered at multiple levels (e.g. a shared core
-- module taken in both Year 1 and Year 2). Mirrors the modules ↔ programs
-- relationship via a many-to-many join table.
--
-- Strategy:
--   1. Create the `module_levels` join table.
--   2. Backfill: every module's existing single `level` value becomes one
--      row in the join table so nothing is lost.
--   3. Legacy `modules.level` column stays — readers that haven't been
--      migrated yet keep working.
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS `module_levels` (
  `id`         INT NOT NULL AUTO_INCREMENT,
  `module_id`  INT NOT NULL,
  `level_id`   INT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_module_level` (`module_id`, `level_id`),
  KEY `idx_ml_module` (`module_id`),
  KEY `idx_ml_level`  (`level_id`),
  CONSTRAINT `fk_ml_module`
    FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ml_level`
    FOREIGN KEY (`level_id`)  REFERENCES `levels` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Backfill from the legacy single-level column.
INSERT IGNORE INTO `module_levels` (`module_id`, `level_id`)
SELECT m.module_id, m.level
FROM `modules` m
JOIN `levels` l ON l.id = m.level
WHERE NOT EXISTS (
  SELECT 1 FROM `module_levels` ml
  WHERE ml.module_id = m.module_id AND ml.level_id = m.level
);

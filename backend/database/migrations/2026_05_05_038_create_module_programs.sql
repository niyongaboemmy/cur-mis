-- 2026_05_05_038_create_module_programs.sql
-- Make modules belong to programs (options) instead of departments, with
-- a many-to-many relationship since one module can be shared across
-- multiple programmes (e.g. "English" is taken by several departments).
--
-- Strategy:
--   1. Create the `module_programs` join table.
--   2. Backfill: every module currently linked to a department becomes
--      linked to every active option that belongs to that department —
--      preserving the existing curriculum mapping without manual touch.
--   3. The legacy `modules.department` column is left intact; the join
--      table now carries the authoritative relationship.
--
-- Idempotent — safe to re-run.

-- 1. Join table
CREATE TABLE IF NOT EXISTS `module_programs` (
  `id`         INT NOT NULL AUTO_INCREMENT,
  `module_id`  INT NOT NULL,
  `option_id`  INT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_module_program` (`module_id`, `option_id`),
  KEY `idx_mp_module`  (`module_id`),
  KEY `idx_mp_option`  (`option_id`),
  CONSTRAINT `fk_mp_module`
    FOREIGN KEY (`module_id`) REFERENCES `modules` (`module_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mp_option`
    FOREIGN KEY (`option_id`) REFERENCES `options` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Backfill from the existing department-based mapping.
INSERT IGNORE INTO `module_programs` (`module_id`, `option_id`)
SELECT m.module_id, o.id
FROM `modules` m
JOIN `options` o ON o.department_id = m.department
WHERE NOT EXISTS (
  SELECT 1 FROM `module_programs` mp
  WHERE mp.module_id = m.module_id AND mp.option_id = o.id
);

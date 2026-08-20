-- 2026_05_16_059_seed_campuses_and_remap_student_campus.sql
-- ─────────────────────────────────────────────────────────────────────────
-- Switches `student.campus` from legacy free-text labels
-- ("SAVE-CAMPUS", "TABA-CAMPUS", "KIGALI-CAMPUS", "Kigali Campus", "TABA",
--  "TABA CAMPUS", …) over to the numeric `campuses.id` (stored as varchar)
-- that the rest of the app now consumes.
--
-- Self-contained: defensively re-creates the `campuses` table (no-op if
-- migration 032 already ran) and (re-)seeds the three institutional
-- campuses by `code`, so any environment — including production / cPanel —
-- ends up with the same canonical rows before the remap runs.
--
-- Idempotent on rerun:
--   • CREATE TABLE IF NOT EXISTS
--   • INSERT … ON DUPLICATE KEY UPDATE (matches on uniq `code`)
--   • UPDATEs target only legacy string values; once converted to IDs they
--     no longer match the WHERE clause.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Ensure the campuses table exists (matches migration 032).
CREATE TABLE IF NOT EXISTS `campuses` (
  `id`         int unsigned NOT NULL AUTO_INCREMENT,
  `name`       varchar(120) NOT NULL,
  `code`       varchar(32)  DEFAULT NULL,
  `location`   varchar(160) DEFAULT NULL,
  `address`    varchar(255) DEFAULT NULL,
  `phone`      varchar(40)  DEFAULT NULL,
  `email`      varchar(120) DEFAULT NULL,
  `is_active`  tinyint(1)   NOT NULL DEFAULT 1,
  `created_at` timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_campus_name` (`name`),
  UNIQUE KEY `uniq_campus_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 2. Seed / sync the three institutional campuses. Keyed on `code` so IDs
--    are allowed to differ between environments — the remap below resolves
--    them by code, not by a hardcoded numeric ID.
INSERT INTO `campuses` (`name`, `code`, `location`, `is_active`) VALUES
  ('Save Campus',   'SAVE',   'Huye',   1),
  ('Taba Campus',   'TABA',   'Huye',   1),
  ('Kigali Campus', 'KIGALI', 'Kigali', 1)
ON DUPLICATE KEY UPDATE
  `name`      = VALUES(`name`),
  `location`  = VALUES(`location`),
  `is_active` = VALUES(`is_active`);

-- 3. Make sure `student.campus` is wide enough to hold the new value.
--    Legacy column is varchar(40); IDs fit easily, but we widen to 64 so
--    nothing surprising happens on older schemas that picked a smaller width.
ALTER TABLE `student` MODIFY `campus` VARCHAR(64) DEFAULT NULL;

-- 4. Remap legacy free-text labels → campuses.id (as VARCHAR).
--    Resolves IDs per env via JOIN on the unique `code` column.
UPDATE `student` s
JOIN `campuses` c ON c.`code` = 'SAVE'
SET s.`campus` = CAST(c.`id` AS CHAR)
WHERE s.`campus` IN ('SAVE-CAMPUS', 'SAVE CAMPUS', 'Save Campus', 'SAVE', 'Save', 'save', 'save-campus');

UPDATE `student` s
JOIN `campuses` c ON c.`code` = 'TABA'
SET s.`campus` = CAST(c.`id` AS CHAR)
WHERE s.`campus` IN ('TABA-CAMPUS', 'TABA CAMPUS', 'Taba Campus', 'TABA', 'Taba', 'taba', 'taba-campus');

UPDATE `student` s
JOIN `campuses` c ON c.`code` = 'KIGALI'
SET s.`campus` = CAST(c.`id` AS CHAR)
WHERE s.`campus` IN ('KIGALI-CAMPUS', 'KIGALI CAMPUS', 'Kigali Campus', 'KIGALI', 'Kigali', 'kigali', 'kigali-campus');

-- 5. Normalise empty strings to NULL so the column is either a real ID or
--    NULL — matches what the API and filters now assume.
UPDATE `student` SET `campus` = NULL WHERE `campus` = '';

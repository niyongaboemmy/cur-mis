-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: Create programme_types lookup table
-- Date: 2026-09-01
--
-- WHY
-- ───
-- Currently mode_of_study is stored as plain text (Day, Evening, Weekend, Holiday).
-- To normalize the database and support easier management, we need a lookup table
-- with IDs for each programme type so applications store IDs instead of text.
--
-- The table stores the five modes currently used:
-- - Day
-- - Evening
-- - Weekend
-- - Holiday
-- - Distance Learning
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `programme_types` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(50) NOT NULL UNIQUE COLLATE utf8mb4_unicode_ci,
  `display_name` VARCHAR(100) NOT NULL,
  `description` TEXT,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  KEY `idx_name` (`name`),
  KEY `idx_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Populate with standard programme types ──────────────────────────────────
INSERT IGNORE INTO `programme_types` (`name`, `display_name`, `description`, `is_active`) VALUES
('day', 'Day', 'Full-time day programmes', 1),
('evening', 'Evening', 'Evening programmes', 1),
('weekend', 'Weekend', 'Weekend programmes', 1),
('holiday', 'Holiday', 'Holiday programmes', 1),
('distance_learning', 'Distance Learning', 'Distance learning programmes', 1);

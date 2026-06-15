-- Migration: create announcements table with proper AUTO_INCREMENT primary key.
-- Date: 2026-06-16

CREATE TABLE IF NOT EXISTS `announcements` (
  `id`         INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `title`      VARCHAR(255)    NOT NULL,
  `body`       TEXT            NOT NULL,
  `audience`   ENUM('all','students','staff','faculty','admin') NOT NULL DEFAULT 'all',
  `priority`   ENUM('normal','urgent')                          NOT NULL DEFAULT 'normal',
  `posted_by`  INT UNSIGNED    NOT NULL,
  `expires_at` DATE            DEFAULT NULL,
  `is_active`  TINYINT(1)      NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_announcements_audience`  (`audience`),
  KEY `idx_announcements_is_active` (`is_active`),
  KEY `idx_announcements_posted_by` (`posted_by`),
  CONSTRAINT `fk_announcements_posted_by`
    FOREIGN KEY (`posted_by`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- If the table already exists without AUTO_INCREMENT (production fix):
-- ALTER TABLE `announcements`
--   MODIFY `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
--   ADD PRIMARY KEY (`id`);

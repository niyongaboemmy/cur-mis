-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: Discussion forums (categories → threads → posts) + permissions.
-- Date: 2026-05-16
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `forum_categories` (
    `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name`        VARCHAR(120) NOT NULL,
    `slug`        VARCHAR(140) NOT NULL,
    `description` VARCHAR(500) NULL,
    `audience`    ENUM('all','students','staff','faculty','admin') NOT NULL DEFAULT 'all',
    `is_active`   TINYINT(1) NOT NULL DEFAULT 1,
    `sort_order`  INT NOT NULL DEFAULT 0,
    `created_by`  INT UNSIGNED NULL,
    `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_forum_categories_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `forum_threads` (
    `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `category_id`  INT UNSIGNED NOT NULL,
    `title`        VARCHAR(200) NOT NULL,
    `created_by`   INT UNSIGNED NULL,
    `is_pinned`    TINYINT(1) NOT NULL DEFAULT 0,
    `is_locked`    TINYINT(1) NOT NULL DEFAULT 0,
    `is_deleted`   TINYINT(1) NOT NULL DEFAULT 0,
    `views`        INT NOT NULL DEFAULT 0,
    `last_post_at` TIMESTAMP NULL,
    `created_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_forum_threads_category` (`category_id`, `is_deleted`),
    KEY `idx_forum_threads_recent` (`last_post_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `forum_posts` (
    `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `thread_id`  INT UNSIGNED NOT NULL,
    `body`       TEXT NOT NULL,
    `created_by` INT UNSIGNED NULL,
    `is_deleted` TINYINT(1) NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_forum_posts_thread` (`thread_id`, `is_deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Permissions ───────────────────────────────────────────────────────────────
INSERT IGNORE INTO `permission_categories` (`name`) VALUES ('Forums');
SET @forum_cat_id = (SELECT `id` FROM `permission_categories` WHERE `name` = 'Forums' LIMIT 1);

INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`)
VALUES
    (@forum_cat_id, 'View Forums',     'VIEW_FORUMS',     'View discussion forum categories, threads and posts, and participate'),
    (@forum_cat_id, 'Moderate Forums', 'MODERATE_FORUMS', 'Manage categories, pin/lock threads and remove any thread or post');

-- VIEW (read + participate): every operational role.
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` = 'VIEW_FORUMS'
WHERE r.`name` IN ('superadmin', 'admin', 'registrar', 'hr_manager', 'finance_officer', 'lecturer', 'HOD', 'student');

-- MODERATE: administration / registry / HOD.
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id`
FROM `roles` r
JOIN `permissions` p ON p.`slug` = 'MODERATE_FORUMS'
WHERE r.`name` IN ('superadmin', 'admin', 'registrar', 'HOD');

-- Seed a couple of starter categories (only if none exist).
INSERT INTO `forum_categories` (`name`, `slug`, `description`, `audience`, `sort_order`)
SELECT * FROM (
    SELECT 'General Discussion' AS name, 'general' AS slug, 'Open discussion for the whole university community' AS description, 'all' AS audience, 1 AS sort_order UNION ALL
    SELECT 'Academics & Modules', 'academics', 'Questions and discussion about courses, modules and exams', 'all', 2 UNION ALL
    SELECT 'Student Lounge', 'student-lounge', 'A space for students to connect', 'students', 3
) AS seed
WHERE (SELECT COUNT(*) FROM `forum_categories`) = 0;

-- 2026_04_27_032_create_campuses.sql
-- Adds the `campuses` table backing CampusModel and the "Campuses"
-- entity on /academic/management. A campus is a physical site where
-- the institution operates (Main Campus, Huye Campus, etc.) with its
-- own location, contact details, and active flag.
--
-- Also seeds the matching MANAGE_CAMPUSES permission and grants it to
-- the Superadmin role so existing admins can use the new CRUD without
-- a manual permissions sync.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, INSERT IGNORE.

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

-- Permission registration
SET @cat_academic = (SELECT id FROM permission_categories WHERE name = 'Academic Registry' LIMIT 1);

INSERT INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(@cat_academic, 'Manage Campuses', 'MANAGE_CAMPUSES', 'CRUD for campuses (physical sites and their locations).')
ON DUPLICATE KEY UPDATE
    `category_id` = VALUES(`category_id`),
    `name`        = VALUES(`name`),
    `description` = VALUES(`description`);

-- Grant to Superadmin (role_id = 1)
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT 1, id FROM `permissions` WHERE slug = 'MANAGE_CAMPUSES';

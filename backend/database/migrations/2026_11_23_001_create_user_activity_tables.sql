-- User activity monitoring: login sessions and page views.
-- Login/logout events and module actions already live in system_logs.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS `user_sessions` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`      INT UNSIGNED    NOT NULL,
  `login_at`     DATETIME        NOT NULL,
  `last_seen_at` DATETIME        NOT NULL,
  `logout_at`    DATETIME        NULL,
  `ip_address`   VARCHAR(45)     NOT NULL DEFAULT '',
  `user_agent`   VARCHAR(255)    NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  INDEX `idx_user_sessions_user_login` (`user_id`, `login_at`),
  INDEX `idx_user_sessions_login`      (`login_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_page_views` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    INT UNSIGNED    NOT NULL,
  `session_id` BIGINT UNSIGNED NULL,
  `path`       VARCHAR(255)    NOT NULL,
  `module`     VARCHAR(100)    NOT NULL DEFAULT '',
  `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_user_page_views_user_created` (`user_id`, `created_at`),
  INDEX `idx_user_page_views_created`      (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

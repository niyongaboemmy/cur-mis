CREATE TABLE IF NOT EXISTS `system_logs` (
  `id`          BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `user_id`     INT              NULL,
  `user_name`   VARCHAR(150)     NOT NULL DEFAULT '',
  `user_email`  VARCHAR(255)     NOT NULL DEFAULT '',
  `action`      VARCHAR(50)      NOT NULL,
  `module`      VARCHAR(50)      NOT NULL,
  `entity_type` VARCHAR(100)     NULL,
  `entity_id`   INT UNSIGNED     NULL,
  `description` TEXT             NOT NULL,
  `ip_address`  VARCHAR(45)      NOT NULL DEFAULT '',
  `metadata`    JSON             NULL,
  `created_at`  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_system_logs_user_id`    (`user_id`),
  INDEX `idx_system_logs_module`     (`module`),
  INDEX `idx_system_logs_action`     (`action`),
  INDEX `idx_system_logs_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migration: create messaging tables with proper AUTO_INCREMENT primary keys.
-- Date: 2026-06-16
-- Tables: conversations, conversation_participants, messages, message_recipients,
--         message_attachments

-- ── conversations ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `conversations` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `subject`    VARCHAR(255)          DEFAULT NULL,
  `type`       ENUM('direct','broadcast') NOT NULL DEFAULT 'direct',
  `created_by` INT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_conversations_created_by` (`created_by`),
  KEY `idx_conversations_updated_at` (`updated_at`),
  CONSTRAINT `fk_conversations_created_by`
    FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── conversation_participants ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `conversation_participants` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `conversation_id` INT UNSIGNED NOT NULL,
  `user_id`         INT UNSIGNED NOT NULL,
  `last_read_at`    TIMESTAMP             DEFAULT NULL,
  `deleted_at`      TIMESTAMP             DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_conv_participant` (`conversation_id`, `user_id`),
  KEY `idx_cp_user_id` (`user_id`),
  CONSTRAINT `fk_cp_conversation`
    FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cp_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── messages ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `messages` (
  `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `conversation_id`  INT UNSIGNED          DEFAULT NULL,
  `sender_id`        INT UNSIGNED NOT NULL,
  `body`             TEXT         NOT NULL,
  `delivery_channel` ENUM('system','system_email') NOT NULL DEFAULT 'system',
  `has_attachment`   TINYINT(1)   NOT NULL DEFAULT 0,
  `is_draft`         TINYINT(1)   NOT NULL DEFAULT 0,
  `deleted_at`       TIMESTAMP             DEFAULT NULL,
  `created_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_messages_conversation_id` (`conversation_id`),
  KEY `idx_messages_sender_id`       (`sender_id`),
  KEY `idx_messages_is_draft`        (`is_draft`),
  CONSTRAINT `fk_messages_conversation`
    FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_messages_sender`
    FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── message_recipients ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `message_recipients` (
  `message_id` INT UNSIGNED NOT NULL,
  `user_id`    INT UNSIGNED NOT NULL,
  `seen_at`    TIMESTAMP             DEFAULT NULL,
  `email_sent` TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (`message_id`, `user_id`),
  KEY `idx_mr_user_id`  (`user_id`),
  KEY `idx_mr_seen_at`  (`seen_at`),
  CONSTRAINT `fk_mr_message`
    FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mr_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── message_attachments ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `message_attachments` (
  `id`         INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `message_id` INT UNSIGNED           DEFAULT NULL,
  `file_name`  VARCHAR(255)  NOT NULL,
  `file_path`  VARCHAR(500)  NOT NULL,
  `mime_type`  VARCHAR(100)           DEFAULT NULL,
  `file_size`  INT UNSIGNED           DEFAULT NULL,
  `created_at` TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ma_message_id` (`message_id`),
  CONSTRAINT `fk_ma_message`
    FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

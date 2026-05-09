-- ============================================================
-- Migration: 036 — Internal Messaging Module
-- Creates: conversations, conversation_participants,
--          messages, message_recipients, message_attachments
-- Idempotent: drops and recreates the five messaging tables so
--             any legacy schema (e.g. old sender_id/receiver_id
--             messages table) is replaced cleanly.
-- ============================================================

-- ── 0. Drop legacy messaging tables (reverse FK order) ───────
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `message_attachments`;
DROP TABLE IF EXISTS `message_recipients`;
DROP TABLE IF EXISTS `messages`;
DROP TABLE IF EXISTS `conversation_participants`;
DROP TABLE IF EXISTS `conversations`;
SET FOREIGN_KEY_CHECKS = 1;

-- ── 1. Conversations ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `conversations` (
    `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `subject`    VARCHAR(255)          DEFAULT NULL,
    `type`       ENUM('direct','broadcast') NOT NULL DEFAULT 'direct',
    `created_by` INT UNSIGNED NOT NULL,
    `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_conv_created_by` (`created_by`),
    KEY `idx_conv_type`       (`type`),
    KEY `idx_conv_updated_at` (`updated_at`),
    CONSTRAINT `fk_conv_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 2. Conversation Participants ─────────────────────────────
-- deleted_at = soft-delete per user (leaves their view without removing the conversation).
-- last_read_at = high-water mark for unread calculations.
CREATE TABLE IF NOT EXISTS `conversation_participants` (
    `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `conversation_id` INT UNSIGNED NOT NULL,
    `user_id`         INT UNSIGNED NOT NULL,
    `last_read_at`    DATETIME     DEFAULT NULL,
    `deleted_at`      DATETIME     DEFAULT NULL,
    `created_at`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `ux_cp_conv_user`   (`conversation_id`, `user_id`),
    KEY `idx_cp_user_id`           (`user_id`),
    KEY `idx_cp_deleted_at`        (`deleted_at`),
    CONSTRAINT `fk_cp_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_cp_user`         FOREIGN KEY (`user_id`)         REFERENCES `users` (`id`)         ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 3. Messages ──────────────────────────────────────────────
-- delivery_channel: 'system' = in-app only, 'system_email' = in-app + email copy.
-- is_draft = 1 means the message was auto-saved but not sent yet.
-- deleted_at = sender soft-delete (hides from sender only).
CREATE TABLE IF NOT EXISTS `messages` (
    `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `conversation_id`  INT UNSIGNED NOT NULL,
    `sender_id`        INT UNSIGNED NOT NULL,
    `body`             TEXT         NOT NULL,
    `delivery_channel` ENUM('system','system_email') NOT NULL DEFAULT 'system',
    `has_attachment`   TINYINT(1)   NOT NULL DEFAULT 0,
    `is_draft`         TINYINT(1)   NOT NULL DEFAULT 0,
    `deleted_at`       DATETIME     DEFAULT NULL,
    `created_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_msg_conversation` (`conversation_id`),
    KEY `idx_msg_sender`       (`sender_id`),
    KEY `idx_msg_is_draft`     (`is_draft`),
    KEY `idx_msg_created_at`   (`created_at`),
    CONSTRAINT `fk_msg_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_msg_sender`       FOREIGN KEY (`sender_id`)       REFERENCES `users` (`id`)         ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 4. Message Recipients ────────────────────────────────────
-- One row per recipient per message.
-- seen_at = NULL means unread for this user.
-- email_sent = 1 when email copy was successfully dispatched.
CREATE TABLE IF NOT EXISTS `message_recipients` (
    `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `message_id` INT UNSIGNED NOT NULL,
    `user_id`    INT UNSIGNED NOT NULL,
    `seen_at`    DATETIME     DEFAULT NULL,
    `email_sent` TINYINT(1)   NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `ux_mr_msg_user` (`message_id`, `user_id`),
    KEY `idx_mr_user_id`        (`user_id`),
    KEY `idx_mr_seen_at`        (`seen_at`),
    CONSTRAINT `fk_mr_message` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_mr_user`    FOREIGN KEY (`user_id`)    REFERENCES `users` (`id`)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 5. Message Attachments ───────────────────────────────────
CREATE TABLE IF NOT EXISTS `message_attachments` (
    `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `message_id`  INT UNSIGNED NOT NULL,
    `file_name`   VARCHAR(255) NOT NULL,
    `file_path`   VARCHAR(512) NOT NULL,
    `mime_type`   VARCHAR(100) DEFAULT NULL,
    `file_size`   INT UNSIGNED DEFAULT NULL,
    `created_at`  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_ma_message_id` (`message_id`),
    CONSTRAINT `fk_ma_message` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 6. Permissions ───────────────────────────────────────────
-- Seed a Messaging permission category + 3 permissions.
-- Uses variable guards for idempotency.

SET @cat_messaging = (
    SELECT `id` FROM `permission_categories` WHERE `name` = 'Messaging' LIMIT 1
);

INSERT IGNORE INTO `permission_categories` (`name`, `description`)
SELECT 'Messaging', 'Internal communication and direct messaging.'
WHERE @cat_messaging IS NULL;

SET @cat_messaging = (
    SELECT `id` FROM `permission_categories` WHERE `name` = 'Messaging' LIMIT 1
);

INSERT IGNORE INTO `permissions` (`category_id`, `name`, `slug`, `description`) VALUES
(@cat_messaging, 'Send Messages',       'SEND_MESSAGES',     'Compose and send internal messages.'),
(@cat_messaging, 'Manage Messages',     'MANAGE_MESSAGES',   'View and manage all conversations (admin-level).'),
(@cat_messaging, 'Broadcast Messages',  'BROADCAST_MESSAGES','Send messages to entire role groups.');

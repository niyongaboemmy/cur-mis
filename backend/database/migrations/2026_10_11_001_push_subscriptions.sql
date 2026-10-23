-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: device push subscriptions (Web Push).
-- Date: 2026-10-11
--
-- One row per browser/installed app per user. A user may have several devices
-- (office PC + phone). The endpoint is unique per device, so re-subscribing
-- the same device updates its row instead of duplicating it.
--
-- Idempotent — safe to re-run.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `push_subscriptions` (
  `id`            INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`       INT(10) UNSIGNED NOT NULL,
  `endpoint_hash` CHAR(64)         NOT NULL,
  `endpoint`      TEXT             NOT NULL,
  `p256dh`        VARCHAR(255)     NOT NULL,
  `auth`          VARCHAR(64)      NOT NULL,
  `user_agent`    VARCHAR(255)     NULL DEFAULT NULL,
  `created_at`    TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_push_endpoint` (`endpoint_hash`),
  KEY `idx_push_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: Forum message attachments (image / PDF).
-- Date: 2026-06-01
-- Adds an optional single file-server attachment to each forum message.
-- Plain ADD COLUMN — the migrate runner treats "duplicate column" (1060) as a
-- no-op, so this is safe to re-run.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE `forum_posts`
  ADD COLUMN `attachment_id`   VARCHAR(100) NULL AFTER `body`,
  ADD COLUMN `attachment_name` VARCHAR(255) NULL AFTER `attachment_id`,
  ADD COLUMN `attachment_mime` VARCHAR(120) NULL AFTER `attachment_name`;

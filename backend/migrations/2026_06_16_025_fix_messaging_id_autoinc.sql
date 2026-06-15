-- Migration: fix AUTO_INCREMENT on messaging tables that were created without it.
-- Date: 2026-06-16
-- Run this on any server where the messaging tables already exist but lack AUTO_INCREMENT.

ALTER TABLE `conversations`
  MODIFY `id` INT UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `conversation_participants`
  MODIFY `id` INT UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `messages`
  MODIFY `id` INT UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `message_attachments`
  MODIFY `id` INT UNSIGNED NOT NULL AUTO_INCREMENT;

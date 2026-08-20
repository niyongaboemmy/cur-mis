-- Migration: fix missing AUTO_INCREMENT on tables deployed without it.
-- Date: 2026-06-16
-- Only tables that have no formal migration and were created manually on cPanel.

SET FOREIGN_KEY_CHECKS = 0;

ALTER TABLE `announcements`             MODIFY `id` INT UNSIGNED NOT NULL AUTO_INCREMENT;
ALTER TABLE `conversations`             MODIFY `id` INT UNSIGNED NOT NULL AUTO_INCREMENT;
ALTER TABLE `conversation_participants` MODIFY `id` INT UNSIGNED NOT NULL AUTO_INCREMENT;
ALTER TABLE `messages`                  MODIFY `id` INT UNSIGNED NOT NULL AUTO_INCREMENT;
ALTER TABLE `message_attachments`       MODIFY `id` INT UNSIGNED NOT NULL AUTO_INCREMENT;
ALTER TABLE `system_logs`               MODIFY `id` INT UNSIGNED NOT NULL AUTO_INCREMENT;
ALTER TABLE `student_ids`               MODIFY `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY;

SET FOREIGN_KEY_CHECKS = 1;

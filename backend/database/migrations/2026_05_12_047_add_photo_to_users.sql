-- Migration 047: add profile photo to users table
-- Stores the file-server UUID of the user's profile picture.

ALTER TABLE `users`
  ADD COLUMN `photo` VARCHAR(255) DEFAULT NULL AFTER `phone`;

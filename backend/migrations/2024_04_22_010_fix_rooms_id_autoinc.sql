-- Migration: make rooms.id a proper AUTO_INCREMENT primary key so POST /facility works.
-- Date: 2024-04-22

ALTER TABLE `rooms`
  MODIFY `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  ADD PRIMARY KEY (`id`);

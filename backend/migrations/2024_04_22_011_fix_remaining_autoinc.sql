-- Migration: grant AUTO_INCREMENT + PRIMARY KEY to `leave_types` and `programs`
-- tables whose `id` column was defined without a PK in the legacy dump.
-- Date: 2024-04-22

ALTER TABLE `leave_types`
  ADD PRIMARY KEY (`id`),
  MODIFY `id` INT UNSIGNED NOT NULL AUTO_INCREMENT;

ALTER TABLE `programs`
  ADD PRIMARY KEY (`id`),
  MODIFY `id` INT UNSIGNED NOT NULL AUTO_INCREMENT;

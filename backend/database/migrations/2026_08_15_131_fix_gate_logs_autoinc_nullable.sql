-- Migration: fix `gate_logs` schema defects behind the Gate Management scan errors.
-- Date: 2026-08-15
--
-- The table was created manually (cPanel) without AUTO_INCREMENT / PRIMARY KEY on
-- `id`, so every logged scan got id = 0 (log_id came back 0 and rows were not
-- individually addressable). It also had `student_id` as NOT NULL, which made the
-- controller crash when logging a scan of an unknown card (it passes NULL there).
-- Companion to 2026_06_16_026_fix_all_id_autoinc.sql, which missed this table.

SET FOREIGN_KEY_CHECKS = 0;

-- Existing rows may all share id = 0; renumber them uniquely before adding the PK.
SET @n := 0;
UPDATE `gate_logs` SET `id` = (@n := @n + 1) ORDER BY `created_at`, `student_id`;

ALTER TABLE `gate_logs`
  MODIFY `student_id` VARCHAR(20) NULL,
  ADD PRIMARY KEY (`id`),
  MODIFY `id` INT UNSIGNED NOT NULL AUTO_INCREMENT;

SET FOREIGN_KEY_CHECKS = 1;

-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: Fix missing PRIMARY KEY / AUTO_INCREMENT on comprehensive-schema
-- feature tables. These were created without a key, so INSERTs fail with
-- "Field 'id' doesn't have a default value".
--
-- All are empty except grading_scales (ids 1..7, contiguous), so adding the
-- key + auto-increment is safe. Re-running is a no-op (the migrate runner
-- treats "multiple primary key"/1068 as already-applied).
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE `announcements`
  MODIFY `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  ADD PRIMARY KEY (`id`);

ALTER TABLE `student_ids`
  MODIFY `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  ADD PRIMARY KEY (`id`);

ALTER TABLE `revaluations`
  MODIFY `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  ADD PRIMARY KEY (`id`);

ALTER TABLE `grading_scales`
  MODIFY `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  ADD PRIMARY KEY (`id`);

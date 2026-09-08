-- 2026_09_08_159_index_admission_offers_student_id.sql
-- The Students registry now shows (and filters by) each student's document
-- verification status. That status is derived per row by looking up the
-- student's latest admission offer:
--   SELECT o.application_id FROM admission_offers o
--    WHERE o.student_id = s.id ORDER BY o.id DESC LIMIT 1
-- and `admission_offers` has no index on `student_id`, so every student in the
-- page (and every row of the faceted count) forced a full scan of the table.
-- Idempotent: only adds the index when it isn't there yet.

SET @exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'admission_offers'
    AND INDEX_NAME   = 'idx_ao_student_id'
);
SET @sql := IF(@exists = 0,
  'CREATE INDEX `idx_ao_student_id` ON `admission_offers` (`student_id`, `id`)',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

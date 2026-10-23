-- =============================================================================
-- 155  Module scheduling: one teaching block can run for several programs at
--      the same time (combined classes). Every program gets its own
--      `module_offerings` row so each program's timetable keeps working; rows
--      that belong to the same combined block share a `shared_block_key`.
--      NULL = a normal single-program block (the default for all existing rows).
-- =============================================================================
SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
         WHERE table_schema = DATABASE() AND table_name = 'module_offerings' AND column_name = 'shared_block_key'),
  'SELECT 1',
  'ALTER TABLE `module_offerings` ADD COLUMN `shared_block_key` VARCHAR(36) NULL AFTER `mode_order`'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql := IF (
  EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
         WHERE table_schema = DATABASE() AND table_name = 'module_offerings' AND index_name = 'idx_module_offerings_shared_block_key'),
  'SELECT 1',
  'CREATE INDEX `idx_module_offerings_shared_block_key` ON `module_offerings` (`shared_block_key`)'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

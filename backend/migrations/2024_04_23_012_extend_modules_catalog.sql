-- Migration: Extend `modules` catalog with description & status + useful indexes
-- Date: 2024-04-23
--
-- Adds:
--   description TEXT, status ENUM('draft','active','archived')
--   UNIQUE index on module_code (idempotent if already added)
--   Composite index (department, level) for fast catalog filtering

-- Each statement is wrapped in a dynamic-SQL guard so re-running the migration
-- does not fail if a column/index already exists. The existing BaseModel
-- queries expect no schema surprises so we keep the changes additive only.

-- description
SET @has_desc := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modules' AND COLUMN_NAME = 'description'
);
SET @sql := IF(@has_desc = 0,
    'ALTER TABLE `modules` ADD COLUMN `description` TEXT NULL AFTER `module_name`',
    'SELECT "description column already exists" AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- status
SET @has_status := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modules' AND COLUMN_NAME = 'status'
);
SET @sql := IF(@has_status = 0,
    "ALTER TABLE `modules` ADD COLUMN `status` ENUM('draft','active','archived') NOT NULL DEFAULT 'active'",
    'SELECT "status column already exists" AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- UNIQUE index on module_code
SET @has_uniq := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modules' AND INDEX_NAME = 'uniq_module_code'
);
SET @sql := IF(@has_uniq = 0,
    'ALTER TABLE `modules` ADD UNIQUE KEY `uniq_module_code` (`module_code`)',
    'SELECT "uniq_module_code already exists" AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Composite index (department, level)
SET @has_idx := (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modules' AND INDEX_NAME = 'idx_modules_department_level'
);
SET @sql := IF(@has_idx = 0,
    'CREATE INDEX `idx_modules_department_level` ON `modules` (`department`, `level`)',
    'SELECT "idx_modules_department_level already exists" AS note');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

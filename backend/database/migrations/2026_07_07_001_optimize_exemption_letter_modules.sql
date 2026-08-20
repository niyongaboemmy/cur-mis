-- ============================================================================
-- Optimize Exemption Letter Module Queries
-- ============================================================================
-- Purpose: Create efficient indexes for exemption letter module filtering
-- Database: whichever schema the migration runner is connected to (DATABASE())
-- Created: 2026-07-07
--
-- Portability notes (2026-08-09):
--   • The original file opened with `USE curac_save;` and filtered
--     INFORMATION_SCHEMA on TABLE_SCHEMA = 'curac_save'. That hard-codes one
--     deployment's schema name and fails with 1049 "Unknown database" anywhere
--     else (local dev uses `cur_mis`). Both now resolve via DATABASE().
--   • `CREATE INDEX IF NOT EXISTS` is MariaDB-only and is a 1064 syntax error
--     on MySQL 8, so each index is guarded via INFORMATION_SCHEMA instead —
--     the same idiom used by 2026_06_16_083_consolidated_session_schema.sql.
--   • The trailing self-INSERT into `schema_migrations` was removed: the
--     migration runner (App\Services\MigrationService) owns that ledger and
--     records the file itself once it completes.
-- ============================================================================

-- Normalise the status column the indexes below depend on.
ALTER TABLE `modules` MODIFY COLUMN `status` VARCHAR(50) DEFAULT 'active' COMMENT 'active, archived, draft, etc.';

-- Index for filtering modules by department (primary use case)
SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modules'
               AND INDEX_NAME = 'idx_modules_department_status');
SET @stmt := IF(@idx = 0,
  'CREATE INDEX `idx_modules_department_status` ON `modules` (`department`, `status`)',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Index for module code search (common filtering need)
SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modules'
               AND INDEX_NAME = 'idx_modules_code');
SET @stmt := IF(@idx = 0,
  'CREATE INDEX `idx_modules_code` ON `modules` (`module_code`)',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Composite index for department + level filtering
SET @idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'modules'
               AND INDEX_NAME = 'idx_modules_department_level_status');
SET @stmt := IF(@idx = 0,
  'CREATE INDEX `idx_modules_department_level_status` ON `modules` (`department`, `level`, `status`)',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- Refresh optimizer statistics for the new indexes.
ANALYZE TABLE `modules`;

-- ============================================================================
-- Sample verification query - modules by single department
-- ============================================================================
-- SELECT module_id, module_code, module_name, module_credits, level, status
-- FROM modules
-- WHERE department = 1 AND status = 'active'
-- ORDER BY module_code ASC;

-- ============================================================================
-- Sample verification query - modules by multiple departments
-- ============================================================================
-- SELECT module_id, module_code, module_name, module_credits, level, status
-- FROM modules
-- WHERE department IN (1, 2, 3) AND status = 'active'
-- ORDER BY module_code ASC;

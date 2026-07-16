-- ============================================================================
-- Optimize Exemption Letter Module Queries
-- ============================================================================
-- Purpose: Create efficient indexes for exemption letter module filtering
-- Database: curac_save / cur_mis
-- Created: 2026-07-07
-- ============================================================================

USE curac_save;

-- Check current modules table structure and add missing columns if needed
ALTER TABLE modules MODIFY COLUMN `status` VARCHAR(50) DEFAULT 'active' COMMENT 'active, archived, draft, etc.';

-- Create index for filtering modules by department (primary use case)
CREATE INDEX IF NOT EXISTS idx_modules_department_status
ON modules(department, `status`)
COMMENT 'Fast lookup of modules by department and active status for exemption letters';

-- Create index for module code search (common filtering need)
CREATE INDEX IF NOT EXISTS idx_modules_code
ON modules(module_code)
COMMENT 'Fast lookup by module code for exemption letter dropdowns';

-- Create composite index for department + level filtering
CREATE INDEX IF NOT EXISTS idx_modules_department_level_status
ON modules(department, `level`, `status`)
COMMENT 'Multi-column filter for exemption letters with level constraints';

-- Verify indexes are created
SELECT
    INDEX_NAME,
    SEQ_IN_INDEX,
    COLUMN_NAME,
    NON_UNIQUE,
    CARDINALITY
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = 'curac_save'
AND TABLE_NAME = 'modules'
AND INDEX_NAME LIKE 'idx_modules%'
ORDER BY INDEX_NAME, SEQ_IN_INDEX;

-- ============================================================================
-- Sample verification query - modules by single department
-- ============================================================================
-- Run this to verify the optimized query works:
-- SELECT module_id, module_code, module_name, module_credits, level, status
-- FROM modules
-- WHERE department = 1 AND status = 'active'
-- ORDER BY module_code ASC;

-- ============================================================================
-- Sample verification query - modules by multiple departments
-- ============================================================================
-- Run this to verify multi-department filtering:
-- SELECT module_id, module_code, module_name, module_credits, level, status
-- FROM modules
-- WHERE department IN (1, 2, 3) AND status = 'active'
-- ORDER BY module_code ASC;

-- ============================================================================
-- Analysis: Show table statistics
-- ============================================================================
ANALYZE TABLE modules;

SELECT
    TABLE_NAME,
    TABLE_ROWS,
    DATA_LENGTH,
    INDEX_LENGTH,
    ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 2) AS size_mb
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = 'curac_save'
AND TABLE_NAME = 'modules';

-- ============================================================================
-- Mark migration as applied
-- ============================================================================
INSERT INTO schema_migrations (filename, applied_at, status)
VALUES ('2026_07_07_001_optimize_exemption_letter_modules.sql', NOW(), 'applied')
ON DUPLICATE KEY UPDATE applied_at = NOW();

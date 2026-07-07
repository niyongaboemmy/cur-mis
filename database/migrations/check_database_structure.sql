-- =============================================================================
-- CHECK DATABASE STRUCTURE
-- Run this first to see what tables actually exist
-- =============================================================================

-- List all tables in the database
SELECT
  TABLE_NAME,
  TABLE_TYPE,
  TABLE_COLLATION,
  TABLE_ROWS,
  DATA_LENGTH,
  INDEX_LENGTH
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME;

-- Show column details for each table (optional - shows character sets)
SELECT
  TABLE_NAME,
  COLUMN_NAME,
  COLUMN_TYPE,
  COLLATION_NAME,
  IS_NULLABLE,
  COLUMN_KEY
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
ORDER BY TABLE_NAME, ORDINAL_POSITION;

-- Check for any views (not base tables)
SELECT
  TABLE_NAME,
  TABLE_TYPE
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
AND TABLE_TYPE = 'VIEW';

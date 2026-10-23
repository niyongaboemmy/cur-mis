-- 2026_10_14_004_employee_insurance_premium.sql
-- CUR procedure step 18–19: RADIANT (other insurer) is a fixed amount per employee,
-- taken off the gross to get net salary before CBHI. CBHI (step 20) is then worked out
-- on that net. Step 22 other deductions are taken after CBHI.
-- Safe to re-run: the column is only added if missing.

SET @db = DATABASE();

SET @sql = (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE `employees` ADD COLUMN `insurance_premium` DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT ''RADIANT premium per month, used when insurance_type is OTHER''',
  'SELECT 1')
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'insurance_premium');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Migration: Registration fee priced by programme tier
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Registration fee (REGISTRATION) amounts for the current academic year:
--   undergraduate → 36,000 RWF
--   postgraduate (PGDE) → 38,000 RWF
--   masters → 53,000 RWF
--
-- fee_structures had no programme dimension, so these rows carry programme_category.
-- NULL programme_category = applies to every programme (existing behaviour).
-- Rows are inserted only if the tier price does not already exist for the current year,
-- so re-running this file does not duplicate them. Edit the amounts in the Fee Structures
-- screen afterwards if Finance changes them.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

SET @col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fee_structures' AND COLUMN_NAME = 'programme_category');
SET @stmt := IF(@col = 0,
  'ALTER TABLE `fee_structures` ADD COLUMN `programme_category` ENUM(''undergraduate'',''postgraduate'',''masters'') NULL DEFAULT NULL AFTER `student_category`',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

INSERT INTO `fee_structures`
    (`academic_year_id`, `department_id`, `level_id`, `student_category`, `programme_category`,
     `fee_type`, `label`, `amount`, `currency`, `semester`, `is_active`, `created_by`)
SELECT ay.id, NULL, NULL, NULL, 'undergraduate', 'REGISTRATION', 'Registration Fee - Undergraduate', 36000.00, 'RWF', NULL, 1, 0
  FROM `academic_years` ay
 WHERE ay.is_current = 1
   AND NOT EXISTS (SELECT 1 FROM `fee_structures` fs
                    WHERE fs.academic_year_id = ay.id AND fs.fee_type = 'REGISTRATION'
                      AND fs.programme_category = 'undergraduate' AND fs.is_active = 1);

INSERT INTO `fee_structures`
    (`academic_year_id`, `department_id`, `level_id`, `student_category`, `programme_category`,
     `fee_type`, `label`, `amount`, `currency`, `semester`, `is_active`, `created_by`)
SELECT ay.id, NULL, NULL, NULL, 'postgraduate', 'REGISTRATION', 'Registration Fee - PGDE', 38000.00, 'RWF', NULL, 1, 0
  FROM `academic_years` ay
 WHERE ay.is_current = 1
   AND NOT EXISTS (SELECT 1 FROM `fee_structures` fs
                    WHERE fs.academic_year_id = ay.id AND fs.fee_type = 'REGISTRATION'
                      AND fs.programme_category = 'postgraduate' AND fs.is_active = 1);

INSERT INTO `fee_structures`
    (`academic_year_id`, `department_id`, `level_id`, `student_category`, `programme_category`,
     `fee_type`, `label`, `amount`, `currency`, `semester`, `is_active`, `created_by`)
SELECT ay.id, NULL, NULL, NULL, 'masters', 'REGISTRATION', 'Registration Fee - Masters', 53000.00, 'RWF', NULL, 1, 0
  FROM `academic_years` ay
 WHERE ay.is_current = 1
   AND NOT EXISTS (SELECT 1 FROM `fee_structures` fs
                    WHERE fs.academic_year_id = ay.id AND fs.fee_type = 'REGISTRATION'
                      AND fs.programme_category = 'masters' AND fs.is_active = 1);

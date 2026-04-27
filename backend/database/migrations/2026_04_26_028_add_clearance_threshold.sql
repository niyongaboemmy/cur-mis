-- Adds clearance_threshold to academic_years

-- Check if column exists first (MySQL workaround in pure SQL is hard without procedural, 
-- but since this is a simple schema, we just execute ALTER)
ALTER TABLE `academic_years`
ADD COLUMN `clearance_threshold` DECIMAL(15,2) NOT NULL DEFAULT 0.00 AFTER `is_current`;

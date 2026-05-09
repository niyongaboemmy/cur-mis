-- 2026_04_27_034_extend_student_applications_personal.sql
-- Adds the extended personal-info fields the apply wizard now collects in
-- step 1 (Personal Info). All nullable so existing drafts/applications
-- remain valid.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS (MariaDB 10.5+ / MySQL 8 supports
-- this directly). For broader compatibility we use the generic ALTER and
-- swallow errors via INFORMATION_SCHEMA guards.

-- father
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'father');
SET @stmt := IF(@col = 0, "ALTER TABLE `student_applications` ADD COLUMN `father` VARCHAR(120) NULL AFTER `last_name`", 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- mother
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'mother');
SET @stmt := IF(@col = 0, "ALTER TABLE `student_applications` ADD COLUMN `mother` VARCHAR(120) NULL AFTER `father`", 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- marital_status
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'marital_status');
SET @stmt := IF(@col = 0, "ALTER TABLE `student_applications` ADD COLUMN `marital_status` ENUM('single','married','divorced','widowed','other') NULL AFTER `birthdate`", 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- national_id
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'national_id');
SET @stmt := IF(@col = 0, "ALTER TABLE `student_applications` ADD COLUMN `national_id` VARCHAR(50) NULL AFTER `nationality`", 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- country_of_residence
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'country_of_residence');
SET @stmt := IF(@col = 0, "ALTER TABLE `student_applications` ADD COLUMN `country_of_residence` VARCHAR(100) NULL AFTER `nationality`", 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- reference_phone
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'reference_phone');
SET @stmt := IF(@col = 0, "ALTER TABLE `student_applications` ADD COLUMN `reference_phone` VARCHAR(30) NULL AFTER `phone`", 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- disability
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'disability');
SET @stmt := IF(@col = 0, "ALTER TABLE `student_applications` ADD COLUMN `disability` VARCHAR(150) NULL DEFAULT 'None'", 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- province
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'province');
SET @stmt := IF(@col = 0, "ALTER TABLE `student_applications` ADD COLUMN `province` VARCHAR(100) NULL", 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- district
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'district');
SET @stmt := IF(@col = 0, "ALTER TABLE `student_applications` ADD COLUMN `district` VARCHAR(100) NULL", 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- sector
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'sector');
SET @stmt := IF(@col = 0, "ALTER TABLE `student_applications` ADD COLUMN `sector` VARCHAR(100) NULL", 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- residence_district
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_applications' AND COLUMN_NAME = 'residence_district');
SET @stmt := IF(@col = 0, "ALTER TABLE `student_applications` ADD COLUMN `residence_district` VARCHAR(100) NULL", 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

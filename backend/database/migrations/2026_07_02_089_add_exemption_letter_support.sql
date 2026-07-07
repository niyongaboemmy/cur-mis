-- ============================================================
-- Migration 089 — Add exemption letter document generation support
-- Adds the exemption_modules table to store transferred credits
-- from prior institutions, enabling automatic exemption letter generation
-- ============================================================

SET @tbl := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exemption_modules');
SET @stmt := IF(@tbl = 0,
  'CREATE TABLE `exemption_modules` (
     `id` INT AUTO_INCREMENT PRIMARY KEY,
     `student_id` INT NOT NULL,
     `module_code` VARCHAR(100) NOT NULL,
     `module_title` VARCHAR(255) NOT NULL,
     `level` VARCHAR(50) NOT NULL,
     `credits` INT NOT NULL DEFAULT 0,
     `marks` DECIMAL(5,2) NULL DEFAULT NULL,
     `institution_name` VARCHAR(255) NULL DEFAULT NULL,
     `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
     FOREIGN KEY (`student_id`) REFERENCES `student`(`id`) ON DELETE CASCADE,
     INDEX `idx_student_id` (`student_id`),
     INDEX `idx_level` (`level`)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

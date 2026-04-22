-- Migration: Create academic_terms table referenced by AcademicTermModel
-- Date: 2024-04-21
--
-- Schema derived from app/Models/AcademicTermModel.php $fillable:
--   ['academic_year_id', 'label', 'start_date', 'end_date', 'is_current']

CREATE TABLE IF NOT EXISTS `academic_terms` (
  `id`                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `academic_year_id`  INT UNSIGNED NOT NULL,
  `label`             VARCHAR(64) NOT NULL,
  `start_date`        DATE NULL,
  `end_date`          DATE NULL,
  `is_current`        TINYINT(1) NOT NULL DEFAULT 0,
  `created_at`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_terms_year`    (`academic_year_id`),
  KEY `idx_terms_current` (`is_current`),
  CONSTRAINT `fk_terms_year` FOREIGN KEY (`academic_year_id`)
    REFERENCES `academic_years`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

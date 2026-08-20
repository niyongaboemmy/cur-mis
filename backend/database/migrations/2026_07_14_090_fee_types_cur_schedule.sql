-- 2026_07_14_090_fee_types_cur_schedule.sql
-- Add CUR-specific fee types and per-credit rate tracking for retakes/part-time modules.
-- Idempotent: all changes are guarded by existence checks.

SET FOREIGN_KEY_CHECKS = 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- §1  Add 9 new fee_types for CUR fee structure
-- ─────────────────────────────────────────────────────────────────────────────
INSERT IGNORE INTO `fee_types` (`code`, `label`, `sort_order`) VALUES
  ('CURSU',               'CURSU Fee',              11),
  ('INTERNSHIP',          'Internship Fee',         12),
  ('FINAL_PROJECT',       'Final Project Fee',      13),
  ('GRADUATION',          'Graduation Fee',         14),
  ('TRANSCRIPT',          'Transcript Fee',         15),
  ('ENGLISH_CERTIFICATE', 'English Certificate Fee',16),
  ('REINTEGRATION',       'Reintegration Fee',      17),
  ('UNIFORM',             'Uniform Fee',             18),
  ('TO_WHOM',             'To Whom It May Concern',  19);

-- ─────────────────────────────────────────────────────────────────────────────
-- §2  Create fee_per_credit_rates table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `fee_per_credit_rates` (
  `id`               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `academic_year_id` INT UNSIGNED  NOT NULL,
  `faculty_id`       INT            NOT NULL,
  `amount_per_credit` DECIMAL(10,2) NOT NULL,
  `is_active`        TINYINT(1)    NOT NULL DEFAULT 1,
  `created_by`       INT UNSIGNED  NOT NULL,
  `created_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fpcr_year_faculty` (`academic_year_id`, `faculty_id`),
  INDEX `idx_fpcr_faculty` (`faculty_id`),
  CONSTRAINT `fk_fpcr_academic_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fpcr_faculty` FOREIGN KEY (`faculty_id`) REFERENCES `faculty` (`fac_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

SET FOREIGN_KEY_CHECKS = 1;

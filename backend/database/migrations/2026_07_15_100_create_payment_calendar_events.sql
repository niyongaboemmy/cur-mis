-- 2026_07_15_100_create_payment_calendar_events.sql
-- Phase 3 (Payment Calendar) — MIS_REVISION_REQUEST_IMPLEMENTATION_PLAN.md §2.5 / §3 Phase 3.
-- Admin-configurable calendar of registration deadlines, installment due dates,
-- penalty start dates, and semester boundaries. Previously this only existed
-- implicitly as fee_invoices.due_date computed per-invoice.
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS `payment_calendar_events` (
  `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `academic_year_id` INT UNSIGNED NOT NULL,
  `event_type`       ENUM('registration_deadline','installment_due','penalty_start','semester_start','semester_end') NOT NULL,
  `label`            VARCHAR(150) NOT NULL,
  `event_date`       DATE NOT NULL,
  `fee_structure_id` INT UNSIGNED NULL DEFAULT NULL COMMENT 'Installment-specific date; NULL applies to the whole academic year',
  `is_active`        TINYINT(1) NOT NULL DEFAULT 1,
  `created_by`       INT UNSIGNED NULL DEFAULT NULL,
  `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_academic_year` (`academic_year_id`),
  KEY `idx_event_type` (`event_type`),
  KEY `idx_event_date` (`event_date`),
  KEY `idx_fee_structure` (`fee_structure_id`),
  KEY `idx_is_active` (`is_active`),
  CONSTRAINT `fk_pce_academic_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pce_fee_structure` FOREIGN KEY (`fee_structure_id`) REFERENCES `fee_structures` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pce_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

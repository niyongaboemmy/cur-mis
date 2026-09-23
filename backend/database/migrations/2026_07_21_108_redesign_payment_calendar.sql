-- 2026_07_21_108_redesign_payment_calendar.sql
-- Redesigns the Payment Calendar feature to model the real CUR document:
-- "PROPOSED PAYMENT CALENDAR 2025-2026.xlsx" — one printable schedule per
-- faculty/intake, with dated + amounted installment rows grouped under
-- level/semester headings, plus notes and Prepared/Verified/Approved
-- signatures. The previous `payment_calendar_events` table only stored a flat
-- list of dates with no amounts, faculty scope, or document metadata, so it
-- could not represent or print this document. Superseded by:
--   payment_calendar_documents — one row per printable calendar (header +
--     footer metadata: faculty, intake, notes, bank accounts, signatures)
--   payment_calendar_items     — schedule rows belonging to a document
--     (group heading, description, start/deadline date, amount)
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS `payment_calendar_documents` (
  `id`                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `academic_year_id`     INT UNSIGNED NOT NULL,
  `faculty_id`           INT NULL DEFAULT NULL COMMENT 'References faculty.fac_id (int(11), not unsigned)',
  `title`                VARCHAR(200) NOT NULL DEFAULT 'PAYMENT CALENDAR',
  `intake_label`         VARCHAR(150) NULL DEFAULT NULL COMMENT 'e.g. September Intake 2025-2026',
  `department_label`     VARCHAR(500) NULL DEFAULT NULL COMMENT 'Department(s) this calendar covers, free text (may list several combined programs)',
  `level_label`          VARCHAR(150) NULL DEFAULT NULL COMMENT 'e.g. L8 Semester 1&2',
  `notes`                TEXT NULL DEFAULT NULL,
  `bank_account_note`    TEXT NULL DEFAULT NULL,
  `cursu_account_note`   TEXT NULL DEFAULT NULL,
  `payment_method_note`  TEXT NULL DEFAULT NULL,
  `fine_notice`          TEXT NULL DEFAULT NULL,
  `prepared_by_name`     VARCHAR(120) NULL DEFAULT NULL,
  `prepared_by_title`    VARCHAR(120) NULL DEFAULT NULL,
  `verified_by_name`     VARCHAR(120) NULL DEFAULT NULL,
  `verified_by_title`    VARCHAR(120) NULL DEFAULT NULL,
  `approved_by_name`     VARCHAR(120) NULL DEFAULT NULL,
  `approved_by_title`    VARCHAR(120) NULL DEFAULT NULL,
  `is_active`            TINYINT(1) NOT NULL DEFAULT 1,
  `created_by`           INT UNSIGNED NULL DEFAULT NULL,
  `created_at`           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pcd_academic_year` (`academic_year_id`),
  KEY `idx_pcd_faculty` (`faculty_id`),
  KEY `idx_pcd_is_active` (`is_active`),
  CONSTRAINT `fk_pcd_academic_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pcd_faculty` FOREIGN KEY (`faculty_id`) REFERENCES `faculty` (`fac_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pcd_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `payment_calendar_items` (
  `id`               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `document_id`      INT UNSIGNED NOT NULL,
  `group_label`      VARCHAR(150) NULL DEFAULT NULL COMMENT 'Sub-heading above this row, e.g. "L8 S1&2" or "Start of L8 S3&4"',
  `item_label`       VARCHAR(250) NOT NULL,
  `event_type`       ENUM('registration_deadline','installment_due','penalty_start','semester_start','semester_end') NOT NULL DEFAULT 'installment_due',
  `start_date`       DATE NULL DEFAULT NULL,
  `deadline_date`    DATE NOT NULL,
  `amount`           DECIMAL(12,2) NULL DEFAULT NULL,
  `is_active`        TINYINT(1) NOT NULL DEFAULT 1,
  `sort_order`       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pci_document` (`document_id`),
  KEY `idx_pci_event_type` (`event_type`),
  KEY `idx_pci_deadline_date` (`deadline_date`),
  CONSTRAINT `fk_pci_document` FOREIGN KEY (`document_id`) REFERENCES `payment_calendar_documents` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

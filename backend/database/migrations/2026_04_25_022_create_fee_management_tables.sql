-- 2026_04_25_022_create_fee_management_tables.sql
-- Creates all tables required by the Fee Management module (3b):
--   fee_structures  — fee amounts configured per dept / level / year / type
--   fee_invoices    — one invoice line per student per fee item
--   fee_payments    — each individual payment recorded against an invoice
--   fee_bursaries   — bursary allocations applied per student per year

SET FOREIGN_KEY_CHECKS = 0;

-- ─── fee_structures ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `fee_structures` (
  `id`               INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  `academic_year_id` INT UNSIGNED      NOT NULL,
  `department_id`    INT UNSIGNED      NULL DEFAULT NULL,   -- NULL = all departments
  `level_id`         INT UNSIGNED      NULL DEFAULT NULL,   -- NULL = all levels
  `fee_type`         ENUM(
                       'TUITION','REGISTRATION','ADMISSION',
                       'HOSTEL','ACADEMIC_DOCUMENT','FINE','REPEAT_MODULE'
                     ) NOT NULL,
  `label`            VARCHAR(120)      NOT NULL,
  `amount`           DECIMAL(12,2)     NOT NULL,
  `semester`         TINYINT UNSIGNED  NULL DEFAULT NULL,   -- 1 | 2 | NULL = full year
  `is_active`        TINYINT(1)        NOT NULL DEFAULT 1,
  `created_by`       INT UNSIGNED      NOT NULL,
  `created_at`       DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_fs_year_dept_level` (`academic_year_id`, `department_id`, `level_id`),
  CONSTRAINT `fk_fs_academic_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`),
  CONSTRAINT `fk_fs_department`    FOREIGN KEY (`department_id`)    REFERENCES `departements` (`dep_id`),
  CONSTRAINT `fk_fs_level`         FOREIGN KEY (`level_id`)         REFERENCES `levels` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── fee_invoices ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `fee_invoices` (
  `id`                   INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `invoice_number`       VARCHAR(30)   NOT NULL,
  `student_id`           VARCHAR(20)   NOT NULL,             -- student.regnumber
  `fee_structure_id`     INT UNSIGNED  NULL DEFAULT NULL,    -- NULL for ad-hoc invoices
  `academic_year_id`     INT UNSIGNED  NOT NULL,
  `semester`             TINYINT UNSIGNED NULL DEFAULT NULL,
  `fee_type`             ENUM(
                           'TUITION','REGISTRATION','ADMISSION','HOSTEL',
                           'ACADEMIC_DOCUMENT','FINE','REPEAT_MODULE',
                           'ARREARS','BURSARY_CREDIT'
                         ) NOT NULL,
  `description`          VARCHAR(200)  NOT NULL,
  `amount_due`           DECIMAL(12,2) NOT NULL,
  `amount_paid`          DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `bursary_applied`      DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `due_date`             DATE          NULL DEFAULT NULL,
  `status`               ENUM('unpaid','partial','paid','overdue','waived') NOT NULL DEFAULT 'unpaid',
  `is_system_generated`  TINYINT(1)    NOT NULL DEFAULT 0,
  `module_id`            INT UNSIGNED  NULL DEFAULT NULL,    -- populated for REPEAT_MODULE
  `created_by`           INT UNSIGNED  NOT NULL,
  `created_at`           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_invoice_number` (`invoice_number`),
  INDEX `idx_fi_student_year` (`student_id`, `academic_year_id`),
  INDEX `idx_fi_status` (`status`),
  CONSTRAINT `fk_fi_academic_year`  FOREIGN KEY (`academic_year_id`)  REFERENCES `academic_years` (`id`),
  CONSTRAINT `fk_fi_fee_structure`  FOREIGN KEY (`fee_structure_id`)  REFERENCES `fee_structures` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── fee_payments ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `fee_payments` (
  `id`                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `invoice_id`        INT UNSIGNED  NOT NULL,
  `student_id`        VARCHAR(20)   NOT NULL,
  `amount`            DECIMAL(12,2) NOT NULL,
  `payment_method`    ENUM('CASH','BANK_TRANSFER','MOBILE_MONEY','BURSARY','WAIVER') NOT NULL,
  `reference_number`  VARCHAR(80)   NULL DEFAULT NULL,   -- bank / MoMo transaction ref
  `bank_slip_file_id` VARCHAR(36)   NULL DEFAULT NULL,   -- UUID in file-server
  `receipt_number`    VARCHAR(30)   NOT NULL,
  `status`            ENUM('pending','confirmed','rejected') NOT NULL DEFAULT 'confirmed',
  `notes`             TEXT          NULL DEFAULT NULL,
  `recorded_by`       INT UNSIGNED  NOT NULL,
  `paid_at`           DATETIME      NOT NULL,
  `confirmed_by`      INT UNSIGNED  NULL DEFAULT NULL,
  `confirmed_at`      DATETIME      NULL DEFAULT NULL,
  `rejection_reason`  TEXT          NULL DEFAULT NULL,
  `created_at`        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_receipt_number` (`receipt_number`),
  INDEX `idx_fp_invoice` (`invoice_id`),
  INDEX `idx_fp_student` (`student_id`),
  CONSTRAINT `fk_fp_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `fee_invoices` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── fee_bursaries ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `fee_bursaries` (
  `id`               INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  `student_id`       VARCHAR(20)    NOT NULL,
  `academic_year_id` INT UNSIGNED   NOT NULL,
  `bursary_type`     VARCHAR(80)    NOT NULL,            -- e.g. "Government Scholarship"
  `amount`           DECIMAL(12,2)  NOT NULL,
  `coverage_pct`     DECIMAL(5,2)   NULL DEFAULT NULL,   -- optional % of total fees
  `approved_by`      INT UNSIGNED   NOT NULL,
  `notes`            TEXT           NULL DEFAULT NULL,
  `created_at`       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_fb_student_year` (`student_id`, `academic_year_id`),
  CONSTRAINT `fk_fb_academic_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

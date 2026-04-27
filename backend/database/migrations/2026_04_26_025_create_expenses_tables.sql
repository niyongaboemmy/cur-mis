-- 2026_04_26_025_create_expenses_tables.sql
-- Creates expense_categories and expenses tables for recording
-- institutional expenditure alongside income tracking.

SET FOREIGN_KEY_CHECKS = 0;

-- ─── expense_categories ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `expense_categories` (
  `id`          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(80)   NOT NULL,
  `description` VARCHAR(255)  NULL DEFAULT NULL,
  `created_at`  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_expense_cat_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed standard CUR expense categories
INSERT IGNORE INTO `expense_categories` (`name`, `description`) VALUES
  ('Salaries & Benefits',    'Staff salaries, allowances, and social contributions'),
  ('Utilities',              'Electricity, water, internet, telephone'),
  ('Maintenance & Repairs',  'Building and equipment maintenance'),
  ('Office Supplies',        'Stationery, printing, consumables'),
  ('Travel & Transport',     'Staff travel, fuel, vehicle maintenance'),
  ('Training & Development', 'Workshops, conferences, staff training'),
  ('Scholarships Disbursed', 'External bursary funds disbursed to students'),
  ('Capital Expenditure',    'Equipment purchases, infrastructure'),
  ('Bank Charges',           'Bank fees, transaction charges'),
  ('Other',                  'Miscellaneous expenses');

-- ─── expenses ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `expenses` (
  `id`                 INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  `category_id`        INT UNSIGNED   NOT NULL,
  `academic_year_id`   INT UNSIGNED   NULL DEFAULT NULL,  -- optional link to year
  `title`              VARCHAR(150)   NOT NULL,
  `description`        TEXT           NULL DEFAULT NULL,
  `amount`             DECIMAL(12,2)  NOT NULL,
  `payment_date`       DATE           NOT NULL,
  `payment_method`     VARCHAR(30)    NOT NULL DEFAULT 'BANK_TRANSFER',
  `reference_number`   VARCHAR(80)    NULL DEFAULT NULL,
  `vendor`             VARCHAR(120)   NULL DEFAULT NULL,
  `receipt_file_id`    VARCHAR(36)    NULL DEFAULT NULL,   -- UUID in file store
  `recorded_by`        INT UNSIGNED   NOT NULL,
  `created_at`         DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_exp_category`    (`category_id`),
  INDEX `idx_exp_year`        (`academic_year_id`),
  INDEX `idx_exp_date`        (`payment_date`),
  CONSTRAINT `fk_exp_category`     FOREIGN KEY (`category_id`)      REFERENCES `expense_categories` (`id`),
  CONSTRAINT `fk_exp_academic_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`     (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

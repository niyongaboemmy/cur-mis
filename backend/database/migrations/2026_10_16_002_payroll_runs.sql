-- 2026_10_16_002_payroll_runs.sql
-- HR payroll (phases 3–5): employment contracts, payroll runs and their lines,
-- manual adjustments, and part-time module assignments.
--
--   employment_contracts  basic salary history per person, with tax method and responsibilities
--   payroll_runs          one run per pay scheme per month; holds the settings snapshot it was made with
--   payroll_lines         one line per person (per module for part-time), every figure stored
--   payroll_adjustments   each change made to a line in DRAFT/CALCULATED, with the reason
--   pt_assignments        part-time module assignments and their approval workflow
--
-- Safe to re-run: CREATE TABLE IF NOT EXISTS only.

CREATE TABLE IF NOT EXISTS `employment_contracts` (
    `id`                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `employee_id`           INT          NOT NULL,
    `scheme_code`           VARCHAR(20)  NOT NULL,
    `start_date`            DATE         NOT NULL,
    `end_date`              DATE         NULL,
    `basic_salary`          DECIMAL(15,2) NOT NULL DEFAULT 0,
    `topup_rate`            DECIMAL(9,5) NULL COMMENT 'percent; NULL uses the settings default',
    `housing_divisor`       INT          NULL COMMENT 'NULL uses the settings default; 0 = no housing allowance',
    `transport_divisor`     INT          NULL COMMENT 'NULL uses the settings default; 0 = no transport allowance',
    `responsibility_roles`  VARCHAR(255) NULL COMMENT 'comma-separated role codes',
    `tax_method`            VARCHAR(20)  NULL COMMENT 'NULL uses the scheme default',
    `tax_method_reason`     VARCHAR(255) NULL,
    `status`                VARCHAR(10)  NOT NULL DEFAULT 'Active' COMMENT 'Active | Ended',
    `created_by`            INT          NULL,
    `created_at`            TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_contract_employee` (`employee_id`),
    KEY `idx_contract_scheme` (`scheme_code`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `payroll_runs` (
    `id`                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `scheme_code`            VARCHAR(20)  NOT NULL,
    `period_date`            DATE         NOT NULL COMMENT 'first day of the pay month',
    `title`                  VARCHAR(200) NOT NULL,
    `status`                 VARCHAR(12)  NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT | CALCULATED | VERIFIED | APPROVED | PAID',
    `settings_effective_from` DATE        NOT NULL,
    `snapshot_json`          LONGTEXT     NOT NULL COMMENT 'settings, responsibility amounts and hourly rates used by this run',
    `created_by`             INT          NULL,
    `created_at`             TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
    `calculated_at`          DATETIME     NULL,
    `verified_by`            INT          NULL,
    `verified_at`            DATETIME     NULL,
    `approved_by`            INT          NULL,
    `approved_at`            DATETIME     NULL,
    `paid_by`                INT          NULL,
    `paid_at`                DATETIME     NULL,
    `reopen_reason`          VARCHAR(255) NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `ux_run_scheme_period` (`scheme_code`, `period_date`),
    CONSTRAINT `chk_run_snapshot_json` CHECK (JSON_VALID(`snapshot_json`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `payroll_lines` (
    `id`                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `run_id`                   INT UNSIGNED NOT NULL,
    `employee_id`              INT          NOT NULL,
    `contract_id`              INT UNSIGNED NULL,
    `line_ref`                 VARCHAR(60)  NOT NULL DEFAULT '' COMMENT 'module code for part-time lines; empty otherwise',
    `employee_name`            VARCHAR(200) NOT NULL,
    `bank_name`                VARCHAR(120) NULL,
    `account_number`           VARCHAR(40)  NULL,
    `inputs_json`              LONGTEXT     NOT NULL,
    `tax_method`               VARCHAR(20)  NULL,
    `warnings_json`            TEXT         NULL,
    `basic_salary`             DECIMAL(15,2) NOT NULL DEFAULT 0,
    `basic_topup`              DECIMAL(15,2) NOT NULL DEFAULT 0,
    `total_basic`              DECIMAL(15,2) NOT NULL DEFAULT 0,
    `housing_allowance`        DECIMAL(15,2) NOT NULL DEFAULT 0,
    `transport_allowance`      DECIMAL(15,2) NOT NULL DEFAULT 0,
    `gross_salary`             DECIMAL(15,2) NOT NULL DEFAULT 0,
    `responsibility_allowance` DECIMAL(15,2) NOT NULL DEFAULT 0,
    `arrears`                  DECIMAL(15,2) NOT NULL DEFAULT 0,
    `total_gross`              DECIMAL(15,2) NOT NULL DEFAULT 0,
    `paye`                     DECIMAL(15,2) NOT NULL DEFAULT 0,
    `maternity_base`           DECIMAL(15,2) NOT NULL DEFAULT 0,
    `pension_employee`         DECIMAL(15,2) NOT NULL DEFAULT 0,
    `pension_employer`         DECIMAL(15,2) NOT NULL DEFAULT 0,
    `maternity_employee`       DECIMAL(15,2) NOT NULL DEFAULT 0,
    `maternity_employer`       DECIMAL(15,2) NOT NULL DEFAULT 0,
    `hazard_employer`          DECIMAL(15,2) NOT NULL DEFAULT 0,
    `rssb_employee_total`      DECIMAL(15,2) NOT NULL DEFAULT 0,
    `rama_employee`            DECIMAL(15,2) NOT NULL DEFAULT 0,
    `rama_employer`            DECIMAL(15,2) NOT NULL DEFAULT 0,
    `other_insurance`          DECIMAL(15,2) NOT NULL DEFAULT 0,
    `net_before_cbhi`          DECIMAL(15,2) NOT NULL DEFAULT 0,
    `cbhi`                     DECIMAL(15,2) NOT NULL DEFAULT 0,
    `net_after_cbhi`           DECIMAL(15,2) NOT NULL DEFAULT 0,
    `deductions`               DECIMAL(15,2) NOT NULL DEFAULT 0,
    `net_pay`                  DECIMAL(15,2) NOT NULL DEFAULT 0,
    `total_deductions`         DECIMAL(15,2) NOT NULL DEFAULT 0,
    `employer_cost`            DECIMAL(15,2) NOT NULL DEFAULT 0,
    `gross_up_residual`        DECIMAL(15,2) NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `ux_line_run_employee_ref` (`run_id`, `employee_id`, `line_ref`),
    KEY `idx_line_employee` (`employee_id`),
    CONSTRAINT `fk_line_run` FOREIGN KEY (`run_id`) REFERENCES `payroll_runs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `payroll_adjustments` (
    `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `run_id`      INT UNSIGNED NOT NULL,
    `line_id`     BIGINT UNSIGNED NULL,
    `component`   VARCHAR(40)  NOT NULL COMMENT 'e.g. arrears, deductions, quantity, tax_method',
    `old_value`   VARCHAR(100) NULL,
    `new_value`   VARCHAR(100) NULL,
    `reason`      VARCHAR(255) NOT NULL,
    `created_by`  INT          NULL,
    `created_at`  TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_adjustment_run` (`run_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pt_assignments` (
    `id`                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `employee_id`           INT          NOT NULL,
    `module_code`           VARCHAR(40)  NOT NULL,
    `module_title`          VARCHAR(200) NOT NULL,
    `programme`             VARCHAR(20)  NOT NULL COMMENT 'Day | Weekend | Holiday',
    `credits`               INT          NOT NULL DEFAULT 0,
    `hours_default`         DECIMAL(8,2) NOT NULL DEFAULT 0 COMMENT 'credits × 4 unless overridden',
    `hours_paid`            DECIMAL(8,2) NULL COMMENT 'override; NULL means hours_default',
    `hours_override_reason` VARCHAR(255) NULL,
    `students`              INT          NULL,
    `grade_code`            VARCHAR(20)  NOT NULL,
    `period_start`          DATE         NOT NULL,
    `period_end`            DATE         NOT NULL,
    `home_institution`      VARCHAR(200) NULL,
    `origin_place`          VARCHAR(200) NULL,
    `from_outside_huye`     TINYINT(1)   NOT NULL DEFAULT 0,
    `accommodation_nights`  INT          NOT NULL DEFAULT 0,
    `transport_zone`        VARCHAR(10)  NULL COMMENT 'KIGALI | OTHER | NULL',
    `transport_trips`       INT          NOT NULL DEFAULT 0,
    `status`                VARCHAR(20)  NOT NULL DEFAULT 'REQUESTED'
                            COMMENT 'REQUESTED | DVCA_APPROVED | INVITED | CONTRACTED | SENT_TO_PAYROLL',
    `requested_by`          INT          NULL,
    `requested_at`          TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
    `dvca_approved_by`      INT          NULL,
    `dvca_approved_at`      DATETIME     NULL,
    `invitation_at`         DATETIME     NULL,
    `contract_at`           DATETIME     NULL,
    `payroll_run_id`        INT UNSIGNED NULL,
    PRIMARY KEY (`id`),
    KEY `idx_pt_employee` (`employee_id`),
    KEY `idx_pt_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

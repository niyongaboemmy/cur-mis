-- 2026_10_16_001_payroll_reference_tables.sql
-- HR payroll (phase 2): reference data that the new payroll engine reads.
--
--   pay_schemes          the seven pay schemes and what each one applies (structure, not versioned)
--   payroll_settings     one whole settings version per effective date, stored as JSON so every
--                        payroll run can keep a copy of the rates it used
--   responsibility_roles monthly responsibility allowance per role, effective-dated
--   hourly_rates         part-time hourly rate per grade, effective-dated
--   banks                controlled list of bank names (replaces free text on employees)
--   payroll_audit_log    who changed what in payroll, before and after
--
-- The new tables do not change any existing table. The old payroll tables (hr_payroll,
-- payroll_config, hr_custom_deductions) stay in use until the new payroll runs replace them.
--
-- Safe to re-run: every table uses CREATE TABLE IF NOT EXISTS.
-- Seed data is loaded separately by scripts/seed_payroll_reference.php (idempotent).

CREATE TABLE IF NOT EXISTS `pay_schemes` (
    `code`               VARCHAR(20)  NOT NULL,
    `name`               VARCHAR(120) NOT NULL,
    `earnings_mode`      VARCHAR(10)  NOT NULL COMMENT 'SALARY | HOURLY | DAILY | ENTERED',
    `default_tax_method` VARCHAR(20)  NOT NULL COMMENT 'PROGRESSIVE | FLAT_SECONDARY | CASUAL_LABOUR | WITHHOLDING | NONE',
    `applies_rssb`       TINYINT(1)   NOT NULL DEFAULT 1 COMMENT 'pension and maternity',
    `applies_hazard`     TINYINT(1)   NOT NULL DEFAULT 1 COMMENT 'occupational hazard (employer)',
    `applies_rama`       TINYINT(1)   NOT NULL DEFAULT 0 COMMENT 'RAMA may apply to people in this scheme',
    `applies_cbhi`       TINYINT(1)   NOT NULL DEFAULT 1,
    `is_active`          TINYINT(1)   NOT NULL DEFAULT 1,
    `sort_order`         INT          NOT NULL DEFAULT 0,
    `created_at`         TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`         TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `payroll_settings` (
    `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `effective_from` DATE         NOT NULL COMMENT 'Periods on or after this date use this version',
    `settings_json`  LONGTEXT     NOT NULL COMMENT 'Rates, divisors, PAYE bands and options (see settings_2026.php)',
    `note`           VARCHAR(255) NULL,
    `created_by`     INT          NULL,
    `created_at`     TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `ux_payroll_settings_effective_from` (`effective_from`),
    CONSTRAINT `chk_payroll_settings_json` CHECK (JSON_VALID(`settings_json`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `responsibility_roles` (
    `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `role_code`      VARCHAR(40)  NOT NULL,
    `role_name`      VARCHAR(120) NOT NULL,
    `monthly_amount` DECIMAL(15,2) NOT NULL DEFAULT 0,
    `effective_from` DATE         NOT NULL,
    `created_by`     INT          NULL,
    `created_at`     TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `ux_responsibility_role_from` (`role_code`, `effective_from`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `hourly_rates` (
    `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `grade_code`     VARCHAR(20)  NOT NULL,
    `grade_name`     VARCHAR(120) NOT NULL,
    `rate_per_hour`  DECIMAL(15,2) NOT NULL,
    `effective_from` DATE         NOT NULL,
    `created_by`     INT          NULL,
    `created_at`     TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `ux_hourly_rate_grade_from` (`grade_code`, `effective_from`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `banks` (
    `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name`       VARCHAR(120) NOT NULL,
    `short_code` VARCHAR(20)  NULL,
    `is_active`  TINYINT(1)   NOT NULL DEFAULT 1,
    `created_at` TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `ux_banks_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `payroll_audit_log` (
    `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `actor_user_id` INT          NULL,
    `action`        VARCHAR(60)  NOT NULL COMMENT 'e.g. settings.created, role.amount_changed',
    `entity_type`   VARCHAR(60)  NOT NULL,
    `entity_id`     VARCHAR(60)  NULL,
    `before_json`   LONGTEXT     NULL,
    `after_json`    LONGTEXT     NULL,
    `ip`            VARCHAR(45)  NULL,
    `created_at`    TIMESTAMP    NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_payroll_audit_entity` (`entity_type`, `entity_id`),
    KEY `idx_payroll_audit_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

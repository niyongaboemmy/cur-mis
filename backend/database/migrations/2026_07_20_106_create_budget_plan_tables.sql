-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 106: Financial Budget Plan (institution-wide annual budget model,
-- imported from the "UNIVERSITY BUDGET" Excel workbooks).
--
-- This is deliberately a separate schema from expense_budgets/expenses
-- (migrations 025/027/101), which remain the per-department expense-vs-actual
-- tracker surfaced on the Budget Execution page (the per-category budget
-- amount is edited inline there; older comments call this the "Budget Plan
-- tab", which now collides with this migration's unrelated top-level
-- "Budget Plan" nav item — don't confuse the two). That schema is
-- annual-only and expense-side-only by design.
--
-- The Excel workbooks model a full institution financial plan: revenue AND
-- expense line items broken down by month (Sept-Aug fiscal year), plus
-- capital expenditure, financing and arrears sections, annual execution
-- (budget vs actual) totals, and supporting student-number projections. Row
-- structure (labels, additions/removals) differs between academic years, so
-- line items are stored as a per-plan catalog rather than a fixed enum.
--
-- Note: the workbook's "General Total" column is NOT always SUM(months) for a
-- row (e.g. rows with a lump-sum annual figure entered independently of the
-- monthly cash-flow spread), so it is stored explicitly rather than derived.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS `budget_plans` (
  `id`                      INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `academic_year_id`        INT(10) UNSIGNED NOT NULL,
  `title`                   VARCHAR(150) NOT NULL COMMENT 'e.g. Financial Budget for Academic year 2024-2025',
  `student_count_budgeted`  INT(10) UNSIGNED NULL COMMENT 'Budgeted Number of Students, General Total column',
  `created_at`              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_budget_plans_year` (`academic_year_id`),
  CONSTRAINT `fk_budget_plans_year` FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `budget_line_items` (
  `id`               INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `budget_plan_id`   INT(10) UNSIGNED NOT NULL,
  `parent_id`        INT(10) UNSIGNED NULL COMMENT 'Self-reference for subtotal grouping, e.g. rows under Total Staff Cost',
  `section`          ENUM('revenue','staff_cost','admin_cost','academic_cost','ict_cost','finance_cost',
                          'capex','financing','arrears','cashflow') NOT NULL,
  `label`            VARCHAR(200) NOT NULL,
  `row_type`         ENUM('data','subtotal','header') NOT NULL DEFAULT 'data',
  `sort_order`       INT(10) UNSIGNED NOT NULL,
  `general_total`    DECIMAL(18,2) NULL COMMENT 'GENERAL TOTAL column as entered in the workbook (not always = SUM(months))',
  PRIMARY KEY (`id`),
  KEY `idx_bli_plan` (`budget_plan_id`),
  KEY `idx_bli_parent` (`parent_id`),
  CONSTRAINT `fk_bli_plan` FOREIGN KEY (`budget_plan_id`) REFERENCES `budget_plans`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_bli_parent` FOREIGN KEY (`parent_id`) REFERENCES `budget_line_items`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `budget_line_item_monthly_values` (
  `id`             INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `line_item_id`   INT(10) UNSIGNED NOT NULL,
  `month`          TINYINT(3) UNSIGNED NOT NULL COMMENT '1=September ... 12=August (fiscal year order)',
  `amount`         DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_blimv_item_month` (`line_item_id`, `month`),
  CONSTRAINT `fk_blimv_item` FOREIGN KEY (`line_item_id`) REFERENCES `budget_line_items`(`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_blimv_month` CHECK (`month` BETWEEN 1 AND 12)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `budget_line_item_executions` (
  `id`               INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `line_item_id`     INT(10) UNSIGNED NOT NULL,
  `executed_total`   DECIMAL(18,2) NOT NULL DEFAULT 0.00 COMMENT 'BUDGET EXECUTION column; variance/% realisation computed at read time',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_blie_item` (`line_item_id`),
  CONSTRAINT `fk_blie_item` FOREIGN KEY (`line_item_id`) REFERENCES `budget_line_items`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `budget_student_projections` (
  `id`               INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `budget_plan_id`   INT(10) UNSIGNED NOT NULL,
  `faculty_label`    VARCHAR(200) NOT NULL,
  `department_label` VARCHAR(200) NULL,
  `level_label`      VARCHAR(50) NOT NULL COMMENT 'e.g. L8 S1&2, L9, Graduands',
  `program_type`     ENUM('day','weekend','holiday') NOT NULL,
  `intake_period`    VARCHAR(50) NOT NULL COMMENT 'existing, or an intake label e.g. September 2024 Intake',
  `headcount`        INT(10) UNSIGNED NOT NULL DEFAULT 0,
  `sort_order`       INT(10) UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_bsp_plan` (`budget_plan_id`),
  CONSTRAINT `fk_bsp_plan` FOREIGN KEY (`budget_plan_id`) REFERENCES `budget_plans`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `budget_student_executions` (
  `id`               INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `budget_plan_id`   INT(10) UNSIGNED NOT NULL,
  `faculty_code`     VARCHAR(20) NOT NULL,
  `budgeted`         INT(10) NOT NULL DEFAULT 0,
  `executed`         INT(10) NOT NULL DEFAULT 0,
  `rank`             INT(10) UNSIGNED NULL,
  `sort_order`       INT(10) UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_bse_plan` (`budget_plan_id`),
  CONSTRAINT `fk_bse_plan` FOREIGN KEY (`budget_plan_id`) REFERENCES `budget_plans`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `budget_reference_rates` (
  `id`               INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `budget_plan_id`   INT(10) UNSIGNED NOT NULL,
  `rate_group`       ENUM('communication_fee','responsibility_allowance','part_time_staff_cost','salary_structure') NOT NULL,
  `label`            VARCHAR(200) NOT NULL,
  `value1`           DECIMAL(18,2) NULL,
  `value2`           DECIMAL(18,2) NULL,
  `value3`           DECIMAL(18,2) NULL,
  `sort_order`       INT(10) UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_brr_plan_group` (`budget_plan_id`, `rate_group`),
  CONSTRAINT `fk_brr_plan` FOREIGN KEY (`budget_plan_id`) REFERENCES `budget_plans`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 101: Budget Execution — Phase 4 (annual granularity, per client
-- confirmation; see MIS_REVISION_REQUEST_IMPLEMENTATION_PLAN.md §2.3/Phase 4).
--
-- Adds a department dimension to expense_budgets so budgets can be planned
-- per-department (cost center) in addition to the existing institution-wide
-- (department_id IS NULL) budgets used by the Expenses > Budget Plan tab.
-- Uniqueness for department-scoped rows is enforced at the application layer
-- in ExpenseBudgetModel::upsertBudget() because MySQL unique indexes do not
-- treat repeated NULLs as duplicates, which is required to keep supporting
-- institution-wide (NULL) budgets alongside department-scoped ones.
-- ══════════════════════════════════════════════════════════════════════════════

-- department_id is plain INT (not UNSIGNED) to match departements.dep_id's
-- actual type (int(11), signed) — MySQL FK constraints require matching
-- signedness between the referencing and referenced columns.
ALTER TABLE `expense_budgets`
  ADD COLUMN `department_id` INT NULL AFTER `category_id`,
  ADD CONSTRAINT `fk_expense_budgets_department` FOREIGN KEY (`department_id`) REFERENCES `departements`(`dep_id`) ON DELETE CASCADE,
  ADD INDEX `idx_expense_budgets_department` (`department_id`);

-- The old 2-column unique key can no longer express "one row per year+category
-- for a given department (or NULL for institution-wide)"; replace it with the
-- 3-column version so at least the department-scoped case is DB-enforced.
ALTER TABLE `expense_budgets`
  DROP INDEX `uk_budget_year_cat`,
  ADD UNIQUE KEY `uk_budget_year_cat_dept` (`academic_year_id`, `category_id`, `department_id`);

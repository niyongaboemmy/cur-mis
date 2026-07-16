-- 2026_07_14_093_create_per_credit_rate_departments.sql
-- Allow per-credit rates to be scoped to specific departments within a faculty.
-- If no departments are linked, the rate applies to the entire faculty.
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS `fee_per_credit_rate_departments` (
  `id`                    INT AUTO_INCREMENT PRIMARY KEY,
  `fee_per_credit_rate_id` INT UNSIGNED NOT NULL,
  `department_id`         INT NOT NULL,
  `created_at`            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_rate_dept` (`fee_per_credit_rate_id`, `department_id`),
  KEY `idx_rate_id` (`fee_per_credit_rate_id`),
  KEY `idx_dept_id` (`department_id`),
  CONSTRAINT `fk_pcrd_rate`
    FOREIGN KEY (`fee_per_credit_rate_id`)
    REFERENCES `fee_per_credit_rates` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Creates the expense_budgets table

CREATE TABLE IF NOT EXISTS `expense_budgets` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `academic_year_id` INT UNSIGNED NOT NULL,
  `category_id` INT UNSIGNED NOT NULL,
  `amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `notes` TEXT NULL,
  `created_by` INT UNSIGNED NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_budget_year_cat` (`academic_year_id`, `category_id`),
  FOREIGN KEY (`academic_year_id`) REFERENCES `academic_years`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`category_id`) REFERENCES `expense_categories`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 145: Student Opening Balances
-- Date: 2026-08-21
--
-- WHY
-- ───
-- The billing page needs to track each student's opening balance — the amount
-- owed at the start of a billing period. This is calculated from unpaid or
-- partially paid invoices from previous academic years/semesters.
--
-- WHAT IT DOES
-- ────────────
-- 1. Creates `student_opening_balances` table to track opening balance per student
-- 2. Opening balance = sum of unpaid + partial invoice amounts from prior periods
-- ──────────────────────────────────────────────────────────────────────────────

-- Table to track student opening balances
CREATE TABLE IF NOT EXISTS `student_opening_balances` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id` VARCHAR(20) NOT NULL,
  `academic_year_id` INT UNSIGNED NOT NULL,
  `semester` TINYINT UNSIGNED NOT NULL,
  `opening_balance` DECIMAL(12,2) NOT NULL DEFAULT '0.00' COMMENT 'Amount owed from previous periods',
  `notes` VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sob_student_year_semester` (`student_id`, `academic_year_id`, `semester`),
  KEY `idx_sob_student` (`student_id`),
  KEY `idx_sob_year` (`academic_year_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Populate opening balances from previous unpaid invoices
-- Get the current academic year ID to calculate prior period balances
SET @current_year_id = (SELECT id FROM academic_years WHERE is_current = 1 LIMIT 1);

INSERT INTO `student_opening_balances` (student_id, academic_year_id, semester, opening_balance)
SELECT
  fi.student_id,
  COALESCE(@current_year_id, (SELECT MAX(id) FROM academic_years)) as academic_year_id,
  1 as semester,
  SUM(CAST(fi.amount_due AS DECIMAL(12,2))) - SUM(CAST(COALESCE(fi.amount_paid, 0) AS DECIMAL(12,2))) as opening_balance
FROM `fee_invoices` fi
WHERE fi.status IN ('unpaid', 'partial', 'overdue')
  AND fi.academic_year_id < COALESCE(@current_year_id, (SELECT MAX(id) FROM academic_years))
GROUP BY fi.student_id
HAVING opening_balance > 0
ON DUPLICATE KEY UPDATE opening_balance = VALUES(opening_balance);

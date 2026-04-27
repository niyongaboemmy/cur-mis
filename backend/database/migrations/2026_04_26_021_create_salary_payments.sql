-- Migration: Create salary_payments table
-- Tracks actual salary disbursements linked to hr_payroll entries.

CREATE TABLE IF NOT EXISTS salary_payments (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    payroll_id      INT          NOT NULL,
    emp_id          INT          NOT NULL,
    period_year     SMALLINT     NOT NULL,
    period_month    TINYINT      NOT NULL,
    amount          DECIMAL(14,2) NOT NULL,
    payment_method  ENUM('Bank Transfer','Cash','MoMo') NOT NULL DEFAULT 'Bank Transfer',
    bank_name       VARCHAR(150) NULL,
    account_number  VARCHAR(60)  NULL,
    reference       VARCHAR(120) NULL,
    notes           TEXT         NULL,
    paid_by_user_id INT UNSIGNED NULL,
    paid_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status          ENUM('Processed','Cancelled') NOT NULL DEFAULT 'Processed',
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_sp_emp_period (emp_id, period_year, period_month),
    INDEX idx_sp_payroll    (payroll_id),
    INDEX idx_sp_status     (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
